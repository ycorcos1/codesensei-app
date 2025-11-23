const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const {
  createUser,
  getUserById,
  queryUserByEmail,
  queryUserByUsername,
} = require('./shared/dynamodb-client');
const {
  normalizeString,
  validateEmail,
  validatePassword,
  validateUsername,
} = require('./shared/validators');
const {
  success,
  error,
  setCookie,
  clearCookie,
} = require('./shared/response-helpers');
const { parseCookies } = require('./shared/auth-middleware');
const { assertWithinRateLimit } = require('./shared/rate-limiter');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'codesensei';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'accessToken';
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refreshToken';

if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET environment variable is not set.');
}

const ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
};

const DURATION_REGEX = /^(\d+)([smhd])$/;

function durationToSeconds(duration, fallbackSeconds) {
  if (!duration) {
    return fallbackSeconds;
  }

  if (/^\d+$/.test(duration)) {
    return parseInt(duration, 10);
  }

  const match = DURATION_REGEX.exec(duration);
  if (!match) {
    return fallbackSeconds;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    default:
      return fallbackSeconds;
  }
}

const ACCESS_MAX_AGE = durationToSeconds(JWT_ACCESS_EXPIRY, 15 * 60);
const REFRESH_MAX_AGE = durationToSeconds(JWT_REFRESH_EXPIRY, 7 * 24 * 60 * 60);

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch (err) {
    throw new Error('INVALID_JSON');
  }
}

function buildUserResponse(user) {
  return {
    id: user.user_id,
    name: user.name,
    email: user.email,
    username: user.username,
  };
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.user_id,
      username: user.username,
      type: 'access',
    },
    JWT_SECRET,
    {
      expiresIn: JWT_ACCESS_EXPIRY,
      issuer: JWT_ISSUER,
    },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.user_id,
      username: user.username,
      type: 'refresh',
    },
    JWT_SECRET,
    {
      expiresIn: JWT_REFRESH_EXPIRY,
      issuer: JWT_ISSUER,
    },
  );
}

function buildAuthCookies(accessToken, refreshToken) {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  };

  const accessCookie = setCookie(ACCESS_COOKIE_NAME, accessToken, {
    ...cookieOptions,
    maxAgeSeconds: ACCESS_MAX_AGE,
  });

  const refreshCookie = setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions,
    maxAgeSeconds: REFRESH_MAX_AGE,
  });

  return [accessCookie, refreshCookie];
}

function clearAuthCookies() {
  return [clearCookie(ACCESS_COOKIE_NAME), clearCookie(REFRESH_COOKIE_NAME)];
}

async function handleSignup(event) {
  const withinLimit = await assertWithinRateLimit(event, 'auth_signup');
  if (!withinLimit) {
    return error(
      429,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Too many signup attempts. Please try again in a minute.',
    );
  }

  let payload;
  try {
    payload = parseBody(event);
  } catch (err) {
    return error(400, ERROR_CODES.INVALID_INPUT, 'Malformed JSON body.');
  }

  const name = normalizeString(payload.name);
  const email = normalizeString(payload.email).toLowerCase();
  const username = normalizeString(payload.username).toLowerCase();
  const password = payload.password || '';
  const confirmPassword =
    payload.confirm_password || payload.confirmPassword || '';

  if (!name) {
    return error(
      400,
      ERROR_CODES.INVALID_INPUT,
      'Name is required.',
      'name',
    );
  }

  if (!validateEmail(email)) {
    return error(
      400,
      ERROR_CODES.INVALID_INPUT,
      'A valid email address is required.',
      'email',
    );
  }

  if (!validateUsername(username)) {
    return error(
      400,
      ERROR_CODES.INVALID_INPUT,
      'Username must be 3-20 alphanumeric characters.',
      'username',
    );
  }

  if (!validatePassword(password)) {
    return error(
      400,
      ERROR_CODES.WEAK_PASSWORD,
      'Password must be at least 8 characters and include one uppercase letter, one number, and one special character.',
      'password',
    );
  }

  if (password !== confirmPassword) {
    return error(
      400,
      ERROR_CODES.INVALID_INPUT,
      'Password and confirmation do not match.',
      'confirm_password',
    );
  }

  const [existingEmailUser, existingUsernameUser] = await Promise.all([
    queryUserByEmail(email),
    queryUserByUsername(username),
  ]);

  if (existingEmailUser) {
    return error(
      409,
      ERROR_CODES.USER_ALREADY_EXISTS,
      'An account with this email already exists.',
      'email',
    );
  }

  if (existingUsernameUser) {
    return error(
      409,
      ERROR_CODES.USER_ALREADY_EXISTS,
      'Username is already taken.',
      'username',
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const timestamp = new Date().toISOString();
  const user = {
    user_id: uuidv4(),
    name,
    email,
    username,
    password_hash: passwordHash,
    created_at: timestamp,
  };

  await createUser(user);

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const cookies = buildAuthCookies(accessToken, refreshToken);

  return success(
    201,
    {
      success: true,
      user: buildUserResponse(user),
    },
    cookies,
  );
}

async function handleLogin(event) {
  const withinLimit = await assertWithinRateLimit(event, 'auth_login');
  if (!withinLimit) {
    return error(
      429,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Too many login attempts. Please try again in a minute.',
    );
  }

  let payload;
  try {
    payload = parseBody(event);
  } catch (err) {
    return error(400, ERROR_CODES.INVALID_INPUT, 'Malformed JSON body.');
  }

  const username = normalizeString(payload.username).toLowerCase();
  const password = payload.password || '';

  if (!username || !password) {
    return error(
      400,
      ERROR_CODES.INVALID_INPUT,
      'Username and password are required.',
    );
  }

  const user = await queryUserByUsername(username);
  if (!user) {
    return error(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials.');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return error(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials.');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const cookies = buildAuthCookies(accessToken, refreshToken);

  return success(
    200,
    {
      success: true,
      user: buildUserResponse(user),
    },
    cookies,
  );
}

async function handleLogout() {
  return success(
    200,
    {
      success: true,
      message: 'Logged out successfully.',
    },
    clearAuthCookies(),
  );
}

async function handleRefresh(event) {
  const cookies = parseCookies(event.headers);
  const refreshToken = cookies[REFRESH_COOKIE_NAME];

  if (!refreshToken) {
    return error(
      401,
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      'Refresh token missing.',
    );
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET, {
      issuer: JWT_ISSUER,
    });
  } catch (err) {
    return error(
      401,
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      'Refresh token invalid or expired.',
    );
  }

  if (payload.type !== 'refresh') {
    return error(
      401,
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      'Invalid refresh token.',
    );
  }

  const user = await getUserById(payload.sub);
  if (!user) {
    return error(
      401,
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      'User no longer exists.',
    );
  }

  const accessToken = signAccessToken(user);

  const cookiesToSet = [
    setCookie(ACCESS_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAgeSeconds: ACCESS_MAX_AGE,
    }),
    setCookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAgeSeconds: REFRESH_MAX_AGE,
    }),
  ];

  return success(
    200,
    {
      success: true,
    },
    cookiesToSet,
  );
}

async function router(event) {
  const method = event.httpMethod || event.requestContext?.http?.method;
  // API Gateway proxy integration provides path with stage prefix (e.g., /dev/auth/signup)
  // event.resource contains the resource template (e.g., /auth/signup)
  const path = event.resource || event.path || event.requestContext?.path;

  if (method === 'OPTIONS') {
    return success(204, {});
  }

  // Match paths with or without stage prefix
  const normalizedPath = path.replace(/^\/[^/]+/, ''); // Remove stage prefix if present

  if (method === 'POST' && (normalizedPath === '/auth/signup' || path.includes('/auth/signup'))) {
    return handleSignup(event);
  }

  if (method === 'POST' && (normalizedPath === '/auth/login' || path.includes('/auth/login'))) {
    return handleLogin(event);
  }

  if (method === 'POST' && (normalizedPath === '/auth/logout' || path.includes('/auth/logout'))) {
    return handleLogout(event);
  }

  if (method === 'POST' && (normalizedPath === '/auth/refresh' || path.includes('/auth/refresh'))) {
    return handleRefresh(event);
  }

  return error(404, 'NOT_FOUND', 'Endpoint not found.');
}

exports.handler = async (event, context) => {
  try {
    return await router(event, context);
  } catch (err) {
    console.error('[auth] Unexpected error:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Something went wrong. Please try again later.',
    );
  }
};


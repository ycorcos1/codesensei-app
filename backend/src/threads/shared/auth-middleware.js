const jwt = require('jsonwebtoken');
const { error, applyCors } = require('./response-helpers');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'codesensei';

if (!JWT_SECRET) {
  console.warn('[auth-middleware] JWT_SECRET environment variable is not set.');
}

function parseCookies(headers = {}) {
  const cookieHeader =
    headers.Cookie ||
    headers.cookie ||
    headers['X-Cookie'] ||
    headers['x-cookie'];

  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, segment) => {
    const [rawKey, rawValue] = segment.split('=');
    if (!rawKey || typeof rawValue === 'undefined') {
      return acc;
    }
    const key = rawKey.trim();
    const value = rawValue.trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getTokenFromAuthorization(headers = {}) {
  const authHeader = headers.Authorization || headers.authorization;
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token.trim();
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER });
  } catch (err) {
    throw new Error('TOKEN_INVALID');
  }
}

function authRequired(handler) {
  return async (event, context) => {
    const origin = event.headers?.origin || event.headers?.Origin;
    const method =
      (event.httpMethod || event.requestContext?.http?.method || '').toUpperCase();

    const respond = (response) => applyCors(response, origin);

    if (method === 'OPTIONS') {
      const response = await handler(event, context);
      return respond(response);
    }

    const cookies = parseCookies(event.headers);
    const tokenFromCookie = cookies.accessToken;
    const tokenFromHeader = getTokenFromAuthorization(event.headers);
    const token = tokenFromCookie || tokenFromHeader;

    if (!token) {
      return respond(error(401, 'UNAUTHORIZED', 'Authentication required'));
    }

    try {
      const payload = verifyAccessToken(token);
      event.requestContext = event.requestContext || {};
      event.requestContext.authorizer = {
        ...(event.requestContext.authorizer || {}),
        user: {
          user_id: payload.sub,
        },
      };
      const response = await handler(event, context, payload);
      return respond(response);
    } catch (err) {
      return respond(error(401, 'UNAUTHORIZED', 'Invalid or expired token'));
    }
  };
}

module.exports = {
  authRequired,
  parseCookies,
  verifyAccessToken,
};


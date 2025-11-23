const bcrypt = require('bcryptjs');

const {
  getUserById,
  updateUser,
  deleteUser,
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
  clearCookie,
} = require('./shared/response-helpers');
const { authRequired } = require('./shared/auth-middleware');

const ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
};

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
    created_at: user.created_at,
  };
}

function getUserIdFromEvent(event) {
  return event.requestContext?.authorizer?.user?.user_id;
}

async function handleGetProfile(event) {
  const userId = getUserIdFromEvent(event);

  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const user = await getUserById(userId);

  if (!user) {
    return error(404, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  return success(200, {
    user: buildUserResponse(user),
  });
}

async function handleUpdateProfile(event) {
  const userId = getUserIdFromEvent(event);

  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  let payload;
  try {
    payload = parseBody(event);
  } catch (err) {
    return error(400, ERROR_CODES.INVALID_INPUT, 'Malformed JSON body.');
  }

  const user = await getUserById(userId);

  if (!user) {
    return error(404, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  const updates = {};

  if (payload.name !== undefined) {
    const name = normalizeString(payload.name);
    if (!name) {
      return error(
        400,
        ERROR_CODES.INVALID_INPUT,
        'Name cannot be empty.',
        'name',
      );
    }
    updates.name = name;
  }

  if (payload.email !== undefined) {
    const email = normalizeString(payload.email).toLowerCase();
    if (!validateEmail(email)) {
      return error(
        400,
        ERROR_CODES.INVALID_INPUT,
        'A valid email address is required.',
        'email',
      );
    }

    if (email !== user.email) {
      const existingUser = await queryUserByEmail(email);
      if (existingUser && existingUser.user_id !== userId) {
        return error(
          409,
          ERROR_CODES.USER_ALREADY_EXISTS,
          'Email is already in use.',
          'email',
        );
      }
      updates.email = email;
    }
  }

  if (payload.username !== undefined) {
    const username = normalizeString(payload.username).toLowerCase();
    if (!validateUsername(username)) {
      return error(
        400,
        ERROR_CODES.INVALID_INPUT,
        'Username must be 3-20 alphanumeric characters.',
        'username',
      );
    }

    if (username !== user.username) {
      const existingUser = await queryUserByUsername(username);
      if (existingUser && existingUser.user_id !== userId) {
        return error(
          409,
          ERROR_CODES.USER_ALREADY_EXISTS,
          'Username is already taken.',
          'username',
        );
      }
      updates.username = username;
    }
  }

  if (Object.keys(updates).length === 0) {
    return success(200, {
      user: buildUserResponse(user),
      message: 'No changes made',
    });
  }

  const updatedUser = await updateUser(userId, updates);

  return success(200, {
    user: buildUserResponse(updatedUser),
    message: 'Profile updated successfully',
  });
}

async function handleChangePassword(event) {
  const userId = getUserIdFromEvent(event);

  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  let payload;
  try {
    payload = parseBody(event);
  } catch (err) {
    return error(400, ERROR_CODES.INVALID_INPUT, 'Malformed JSON body.');
  }

  const currentPassword =
    payload.current_password || payload.currentPassword || '';
  const newPassword = payload.new_password || payload.newPassword || '';

  if (!currentPassword || !newPassword) {
    return error(
      400,
      ERROR_CODES.INVALID_INPUT,
      'Current password and new password are required.',
    );
  }

  const user = await getUserById(userId);

  if (!user) {
    return error(404, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  const passwordMatches = await bcrypt.compare(
    currentPassword,
    user.password_hash,
  );
  if (!passwordMatches) {
    return error(
      400,
      ERROR_CODES.INVALID_PASSWORD,
      'Current password is incorrect.',
      'current_password',
    );
  }

  if (!validatePassword(newPassword)) {
    return error(
      400,
      ERROR_CODES.WEAK_PASSWORD,
      'Password must be at least 8 characters and include one uppercase letter, one number, and one special character.',
      'new_password',
    );
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await updateUser(userId, { password_hash: newPasswordHash });

  return success(200, {
    success: true,
    message: 'Password updated successfully',
  });
}

async function handleDeleteAccount(event) {
  const userId = getUserIdFromEvent(event);

  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  let payload;
  try {
    payload = parseBody(event);
  } catch (err) {
    return error(400, ERROR_CODES.INVALID_INPUT, 'Malformed JSON body.');
  }

  const password = payload.password || '';

  if (!password) {
    return error(
      400,
      ERROR_CODES.INVALID_INPUT,
      'Password confirmation is required.',
      'password',
    );
  }

  const user = await getUserById(userId);

  if (!user) {
    return error(404, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return error(
      400,
      ERROR_CODES.INVALID_PASSWORD,
      'Password is incorrect.',
      'password',
    );
  }

  await deleteUser(userId);

  const cookies = [clearCookie('accessToken'), clearCookie('refreshToken')];

  return success(
    200,
    {
      success: true,
      message: 'Account deleted successfully',
    },
    cookies,
  );
}

async function router(event) {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.resource || event.path || event.requestContext?.path;

  if (method === 'OPTIONS') {
    return success(204, {});
  }

  if (method === 'GET' && path.includes('/users/me')) {
    return handleGetProfile(event);
  }

  if (method === 'PUT' && path.includes('/users/me/password')) {
    return handleChangePassword(event);
  }

  if (method === 'PUT' && path.includes('/users/me')) {
    return handleUpdateProfile(event);
  }

  if (method === 'DELETE' && path.includes('/users/me')) {
    return handleDeleteAccount(event);
  }

  return error(404, 'NOT_FOUND', 'Endpoint not found.');
}

exports.handler = authRequired(async (event, context) => {
  try {
    return await router(event, context);
  } catch (err) {
    console.error('[users] Unexpected error:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Something went wrong. Please try again later.',
    );
  }
});


const DEFAULT_ORIGIN =
  process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173';

function baseHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': DEFAULT_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    ...extra,
  };
}

function applyCookies(response, cookies) {
  if (!cookies || !cookies.length) {
    return response;
  }

  return {
    ...response,
    multiValueHeaders: {
      ...(response.multiValueHeaders || {}),
      'Set-Cookie': cookies,
    },
  };
}

function success(statusCode, data = {}, cookies = []) {
  const response = {
    statusCode,
    headers: baseHeaders(),
    body: JSON.stringify(data),
  };

  return applyCookies(response, cookies);
}

function error(statusCode, code, message, field, details) {
  const payload = {
    error: {
      code,
      message,
    },
  };

  if (field) {
    payload.error.field = field;
  }

  if (details) {
    payload.error.details = details;
  }

  return {
    statusCode,
    headers: baseHeaders(),
    body: JSON.stringify(payload),
  };
}

module.exports = {
  success,
  error,
};


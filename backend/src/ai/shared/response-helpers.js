const RAW_ALLOWED_ORIGINS =
  process.env.CORS_ALLOWED_ORIGIN ||
  'http://localhost:5173,https://main.dnq80x6al42k7.amplifyapp.com';
const ALLOWED_ORIGINS = RAW_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function resolveAllowedOrigin(requestOrigin) {
  if (!ALLOWED_ORIGINS.length) {
    return requestOrigin || 'http://localhost:5173';
  }

  if (ALLOWED_ORIGINS.includes('*')) {
    return requestOrigin || ALLOWED_ORIGINS[0] || '*';
  }

  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  return ALLOWED_ORIGINS[0];
}

function buildCorsHeaders(requestOrigin, extra = {}) {
  return {
    ...extra,
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(requestOrigin),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,Cookie',
    Vary: 'Origin',
  };
}

function baseHeaders(extra = {}) {
  return buildCorsHeaders(undefined, extra);
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

function applyCors(response, requestOrigin) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  return {
    ...response,
    headers: buildCorsHeaders(requestOrigin, response.headers || {}),
  };
}

module.exports = {
  success,
  error,
  applyCors,
};


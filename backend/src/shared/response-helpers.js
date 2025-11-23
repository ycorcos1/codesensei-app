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

function serializeCookie(name, value, options = {}) {
  const {
    maxAgeSeconds,
    httpOnly = true,
    secure = true,
    sameSite = 'Strict',
    path = '/',
    domain,
    expires,
  } = options;

  const parts = [`${name}=${value ?? ''}`];

  if (maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }

  if (expires) {
    parts.push(`Expires=${expires.toUTCString()}`);
  }

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (path) {
    parts.push(`Path=${path}`);
  }

  if (httpOnly) {
    parts.push('HttpOnly');
  }

  if (secure) {
    parts.push('Secure');
  }

  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  return parts.join('; ');
}

function setCookie(name, value, options = {}) {
  return serializeCookie(name, value, options);
}

function clearCookie(name) {
  return serializeCookie(name, '', {
    expires: new Date(0),
    maxAgeSeconds: 0,
  });
}

module.exports = {
  error,
  success,
  setCookie,
  clearCookie,
};


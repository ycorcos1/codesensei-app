const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export class APIError extends Error {
  constructor(code, message, field, statusCode) {
    super(message);
    this.code = code;
    this.field = field;
    this.statusCode = statusCode;
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = data.error || {};
      throw new APIError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An error occurred',
        error.field,
        response.status,
      );
    }

    return data;
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }

    throw new APIError(
      'NETWORK_ERROR',
      'Unable to connect. Check your internet connection and try again.',
    );
  }
}

export const api = {
  signup: (payload) =>
    request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request('/auth/logout', {
      method: 'POST',
    }),

  refresh: () =>
    request('/auth/refresh', {
      method: 'POST',
    }),

  getSessions: (cursor) => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return request(`/sessions${query}`, {
      method: 'GET',
    });
  },

  createSession: (payload) =>
    request('/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteSession: (sessionId) =>
    request(`/sessions/${sessionId}`, {
      method: 'DELETE',
    }),

  getSession: (sessionId) =>
    request(`/sessions/${sessionId}`, {
      method: 'GET',
    }),

  updateSession: (sessionId, payload) =>
    request(`/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updateSessionMetadata: (sessionId, payload) =>
    request(`/sessions/${sessionId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getThreads: (sessionId) =>
    request(`/sessions/${sessionId}/threads`, {
      method: 'GET',
    }),

  createThread: (sessionId, payload) =>
    request(`/sessions/${sessionId}/threads`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getThread: (threadId) =>
    request(`/threads/${threadId}`, {
      method: 'GET',
    }),

  deleteThread: (threadId) =>
    request(`/threads/${threadId}`, {
      method: 'DELETE',
    }),
};


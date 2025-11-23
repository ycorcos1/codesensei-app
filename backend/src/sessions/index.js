const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const { authRequired } = require('./shared/auth-middleware');
const { success, error } = require('./shared/response-helpers');
const { assertWithinRateLimit } = require('./shared/rate-limiter');

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const MAX_SESSIONS_PER_USER = Number(process.env.MAX_SESSIONS_PER_USER || 100);
const MAX_CODE_SIZE_BYTES =
  Number(process.env.MAX_SESSION_CODE_BYTES || 5 * 1024 * 1024);
const SESSION_SAVE_RATE_LIMIT = Number(
  process.env.SESSION_SAVE_RATE_LIMIT_PER_MINUTE || 60,
);
const SESSION_CREATE_RATE_LIMIT = Number(
  process.env.SESSION_CREATE_RATE_LIMIT_PER_MINUTE || 20,
);

if (!SESSIONS_TABLE) {
  console.warn('[sessions] SESSIONS_TABLE environment variable is not set.');
}

function getUserIdFromEvent(event) {
  return event.requestContext?.authorizer?.user?.user_id;
}

function parseJsonBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch (err) {
    throw new Error('INVALID_JSON');
  }
}

function decodeCursor(cursor) {
  if (!cursor) {
    return undefined;
  }

  try {
    const json = Buffer.from(cursor, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    throw new Error('INVALID_CURSOR');
  }
}

function encodeCursor(key) {
  if (!key) {
    return undefined;
  }

  return Buffer.from(JSON.stringify(key)).toString('base64');
}

function sanitizeFilename(filename) {
  if (typeof filename !== 'string') {
    return '';
  }
  return filename.trim();
}

function sanitizeLanguage(value, { allowNull = true } = {}) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return allowNull ? null : undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('INVALID_LANGUAGE');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return allowNull ? null : undefined;
  }

  return trimmed;
}

async function handleListSessions(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const params = event.queryStringParameters || {};
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 50);

  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeCursor(params.cursor);
  } catch (err) {
    return error(400, 'INVALID_INPUT', 'Invalid pagination cursor', 'cursor');
  }

  try {
    const result = await documentClient.send(
      new QueryCommand({
        TableName: SESSIONS_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'user_id = :user_id',
        ExpressionAttributeValues: {
          ':user_id': userId,
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false, // Newest first
      }),
    );

    const sessions = (result.Items || []).map((item) => ({
      session_id: item.session_id,
      filename: item.filename,
      language_detected: item.language_detected || null,
      language_override: item.language_override || null,
      version_number: item.version_number,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    const response = {
      sessions,
      count: sessions.length,
    };

    const cursor = encodeCursor(result.LastEvaluatedKey);
    if (cursor) {
      response.cursor = cursor;
    }

    return success(200, response);
  } catch (err) {
    console.error('[sessions] Failed to list sessions:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to retrieve sessions. Please try again later.',
    );
  }
}

async function handleCreateSession(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const withinLimit = await assertWithinRateLimit(
    event,
    `session_create#${userId}`,
    SESSION_CREATE_RATE_LIMIT,
  );
  if (!withinLimit) {
    return error(
      429,
      'RATE_LIMIT_EXCEEDED',
      'Too many session creations. Please try again later.',
    );
  }

  let payload;
  try {
    payload = parseJsonBody(event);
    if (
      Object.prototype.hasOwnProperty.call(payload, 'code_content') &&
      typeof payload.code_content !== 'string'
    ) {
      return error(
        400,
        'INVALID_INPUT',
        'code_content must be a string when provided.',
        'code_content',
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'language_override') &&
      payload.language_override !== null &&
      typeof payload.language_override !== 'string'
    ) {
      return error(
        400,
        'INVALID_INPUT',
        'language_override must be a string or null when provided.',
        'language_override',
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'language_detected') &&
      payload.language_detected !== null &&
      typeof payload.language_detected !== 'string'
    ) {
      return error(
        400,
        'INVALID_INPUT',
        'language_detected must be a string or null when provided.',
        'language_detected',
      );
    }
  } catch (err) {
    if (err.message === 'INVALID_LANGUAGE') {
      return error(
        400,
        'INVALID_LANGUAGE',
        'Invalid language value supplied.',
      );
    }

    return error(400, 'INVALID_INPUT', 'Malformed JSON body.');
  }

  const filename = sanitizeFilename(payload.filename);
  const codeContent =
    Object.prototype.hasOwnProperty.call(payload, 'code_content') &&
    typeof payload.code_content === 'string'
      ? payload.code_content
      : '';
  let languageDetected;
  let languageOverride;

  try {
    languageDetected = sanitizeLanguage(payload.language_detected, {
      allowNull: true,
    });
    languageOverride = sanitizeLanguage(payload.language_override, {
      allowNull: true,
    });
  } catch (err) {
    if (err.message === 'INVALID_LANGUAGE') {
      return error(
        400,
        'INVALID_LANGUAGE',
        'Invalid language value supplied.',
      );
    }
    throw err;
  }

  if (!filename) {
    return error(
      400,
      'INVALID_INPUT',
      'filename is required and must be a non-empty string.',
      'filename',
    );
  }

  const codeSize = Buffer.byteLength(codeContent, 'utf8');
  if (codeSize > MAX_CODE_SIZE_BYTES) {
    return error(
      400,
      'FILE_TOO_LARGE',
      'Code content exceeds the maximum size of 5MB.',
    );
  }

  try {
    const countResult = await documentClient.send(
      new QueryCommand({
        TableName: SESSIONS_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'user_id = :user_id',
        ExpressionAttributeValues: {
          ':user_id': userId,
        },
        Select: 'COUNT',
      }),
    );

    if ((countResult.Count || 0) >= MAX_SESSIONS_PER_USER) {
      return error(
        400,
        'SESSION_LIMIT_EXCEEDED',
        `Maximum of ${MAX_SESSIONS_PER_USER} sessions per user reached.`,
      );
    }

    const sessionId = uuidv4();
    const timestamp = new Date().toISOString();

    const item = {
      session_id: sessionId,
      user_id: userId,
      filename,
      code_content: codeContent,
      language_detected:
        languageDetected !== undefined ? languageDetected : null,
      language_override:
        languageOverride !== undefined ? languageOverride : null,
      version_number: 1,
      created_at: timestamp,
      updated_at: timestamp,
      last_modified_by: userId,
    };

    await documentClient.send(
      new PutCommand({
        TableName: SESSIONS_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(session_id)',
      }),
    );

    return success(201, {
      session: {
        session_id: sessionId,
        filename: item.filename,
        language_detected: item.language_detected,
        language_override: item.language_override,
        version_number: item.version_number,
        created_at: item.created_at,
        updated_at: item.updated_at,
      },
    });
  } catch (err) {
    console.error('[sessions] Failed to create session:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to create session. Please try again later.',
    );
  }
}

async function fetchSessionById(sessionId) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { session_id: sessionId },
    }),
  );

  return result.Item;
}

async function handleGetSession(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const sessionId =
    event.pathParameters?.id ||
    event.pathParameters?.session_id ||
    event.path?.split('/')?.pop();

  if (!sessionId) {
    return error(400, 'INVALID_INPUT', 'Session ID is required');
  }

  try {
    const session = await fetchSessionById(sessionId);

    if (!session) {
      return error(404, 'SESSION_NOT_FOUND', 'Session not found');
    }

    if (session.user_id !== userId) {
      return error(403, 'FORBIDDEN', 'You do not have access to this session');
    }

    return success(200, { session });
  } catch (err) {
    console.error('[sessions] Failed to get session:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to retrieve session. Please try again later.',
    );
  }
}

async function handleUpdateSession(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const withinLimit = await assertWithinRateLimit(
    event,
    `session_save#${userId}`,
    SESSION_SAVE_RATE_LIMIT,
  );
  if (!withinLimit) {
    return error(
      429,
      'RATE_LIMIT_EXCEEDED',
      'Too many save requests. Please try again later.',
    );
  }

  const sessionId =
    event.pathParameters?.id ||
    event.pathParameters?.session_id ||
    event.path?.split('/')?.pop();

  if (!sessionId) {
    return error(400, 'INVALID_INPUT', 'Session ID is required');
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, 'INVALID_INPUT', 'Malformed JSON body.');
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'expected_version_number')) {
    return error(
      400,
      'INVALID_INPUT',
      'expected_version_number is required.',
      'expected_version_number',
    );
  }

  const expectedVersion = payload.expected_version_number;
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    return error(
      400,
      'INVALID_INPUT',
      'expected_version_number must be a positive integer.',
      'expected_version_number',
    );
  }

  const hasCodeContent = Object.prototype.hasOwnProperty.call(
    payload,
    'code_content',
  );
  if (hasCodeContent && typeof payload.code_content !== 'string') {
    return error(
      400,
      'INVALID_INPUT',
      'code_content must be a string when provided.',
      'code_content',
    );
  }

  if (hasCodeContent) {
    const codeSize = Buffer.byteLength(payload.code_content, 'utf8');
    if (codeSize > MAX_CODE_SIZE_BYTES) {
      return error(
        400,
        'FILE_TOO_LARGE',
        'Code content exceeds the maximum size of 5MB.',
      );
    }
  }

  const hasLanguageOverride = Object.prototype.hasOwnProperty.call(
    payload,
    'language_override',
  );

  if (hasLanguageOverride) {
    try {
      payload.language_override = sanitizeLanguage(
        payload.language_override,
        { allowNull: true },
      );
    } catch (err) {
      if (err.message === 'INVALID_LANGUAGE') {
        return error(
          400,
          'INVALID_LANGUAGE',
          'Invalid language value supplied.',
          'language_override',
        );
      }
      throw err;
    }
  }

  try {
    const currentSession = await fetchSessionById(sessionId);

    if (!currentSession) {
      return error(404, 'SESSION_NOT_FOUND', 'Session not found');
    }

    if (currentSession.user_id !== userId) {
      return error(403, 'FORBIDDEN', 'You do not have access to this session');
    }

    if (currentSession.version_number !== expectedVersion) {
      return error(
        409,
        'VERSION_CONFLICT',
        'Session has been modified by another client.',
        null,
        {
          current_version: currentSession.version_number,
          current_code: currentSession.code_content,
        },
      );
    }

    const updateExpressions = [
      '#version_number = :new_version',
      '#updated_at = :updated_at',
      '#last_modified_by = :user_id',
    ];
    const expressionAttributeNames = {
      '#version_number': 'version_number',
      '#updated_at': 'updated_at',
      '#last_modified_by': 'last_modified_by',
    };
    const expressionAttributeValues = {
      ':new_version': expectedVersion + 1,
      ':updated_at': new Date().toISOString(),
      ':user_id': userId,
      ':expected_version': expectedVersion,
    };

    if (hasCodeContent) {
      updateExpressions.push('#code_content = :code_content');
      expressionAttributeNames['#code_content'] = 'code_content';
      expressionAttributeValues[':code_content'] = payload.code_content;
    }

    if (hasLanguageOverride) {
      updateExpressions.push('#language_override = :language_override');
      expressionAttributeNames['#language_override'] = 'language_override';
      expressionAttributeValues[':language_override'] =
        payload.language_override;
    }

    if (updateExpressions.length === 3) {
      // Nothing to update besides version/timestamps
      return success(200, {
        session: {
          session_id: sessionId,
          version_number: expectedVersion,
          updated_at: currentSession.updated_at,
        },
        message: 'No changes supplied.',
      });
    }

    const updateResult = await documentClient.send(
      new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id: sessionId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ConditionExpression: '#version_number = :expected_version',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    const updatedSession = updateResult.Attributes;

    return success(200, {
      session: {
        session_id: updatedSession.session_id,
        version_number: updatedSession.version_number,
        updated_at: updatedSession.updated_at,
      },
      message: 'Session saved successfully.',
    });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return error(
        409,
        'VERSION_CONFLICT',
        'Session has been modified during save.',
      );
    }

    console.error('[sessions] Failed to update session:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to update session. Please try again later.',
    );
  }
}

async function handleUpdateMetadata(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const sessionId =
    event.pathParameters?.id ||
    event.pathParameters?.session_id ||
    event.path?.split('/')?.filter(Boolean).slice(-2)[0];

  if (!sessionId) {
    return error(400, 'INVALID_INPUT', 'Session ID is required');
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, 'INVALID_INPUT', 'Malformed JSON body.');
  }

  const filename = sanitizeFilename(payload.filename);

  if (!filename) {
    return error(
      400,
      'INVALID_INPUT',
      'filename is required and must be a non-empty string.',
      'filename',
    );
  }

  try {
    const currentSession = await fetchSessionById(sessionId);

    if (!currentSession) {
      return error(404, 'SESSION_NOT_FOUND', 'Session not found');
    }

    if (currentSession.user_id !== userId) {
      return error(403, 'FORBIDDEN', 'You do not have access to this session');
    }

    const updatedAt = new Date().toISOString();

    await documentClient.send(
      new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id: sessionId },
        UpdateExpression: 'SET #filename = :filename, #updated_at = :updated_at',
        ExpressionAttributeNames: {
          '#filename': 'filename',
          '#updated_at': 'updated_at',
        },
        ExpressionAttributeValues: {
          ':filename': filename,
          ':updated_at': updatedAt,
        },
      }),
    );

    return success(200, {
      session: {
        session_id: sessionId,
        filename,
        updated_at: updatedAt,
      },
      message: 'Session metadata updated successfully.',
    });
  } catch (err) {
    console.error('[sessions] Failed to update metadata:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to update session metadata. Please try again later.',
    );
  }
}

async function handleDeleteSession(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const sessionId =
    event.pathParameters?.id ||
    event.pathParameters?.session_id ||
    event.path?.split('/')?.pop();

  if (!sessionId) {
    return error(400, 'INVALID_INPUT', 'Session ID is required');
  }

  try {
    const currentSession = await fetchSessionById(sessionId);

    if (!currentSession) {
      return error(404, 'SESSION_NOT_FOUND', 'Session not found');
    }

    if (currentSession.user_id !== userId) {
      return error(403, 'FORBIDDEN', 'You do not have access to this session');
    }

    await documentClient.send(
      new DeleteCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id: sessionId },
      }),
    );

    return success(200, {
      session_id: sessionId,
      message: 'Session deleted successfully.',
    });
  } catch (err) {
    console.error('[sessions] Failed to delete session:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to delete session. Please try again later.',
    );
  }
}

async function router(event) {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const resource =
    event.resource || event.requestContext?.resourcePath || event.path;

  if (method === 'OPTIONS') {
    return success(204, {});
  }

  if (method === 'GET' && resource === '/sessions') {
    return handleListSessions(event);
  }

  if (method === 'POST' && resource === '/sessions') {
    return handleCreateSession(event);
  }

  if (method === 'GET' && resource === '/sessions/{id}') {
    return handleGetSession(event);
  }

  if (method === 'PUT' && resource === '/sessions/{id}') {
    return handleUpdateSession(event);
  }

  if (method === 'PATCH' && resource === '/sessions/{id}/metadata') {
    return handleUpdateMetadata(event);
  }

  if (method === 'DELETE' && resource === '/sessions/{id}') {
    return handleDeleteSession(event);
  }

  // Fallback for cases where resource isn't populated (e.g., custom integrations)
  const path = event.path || '';

  if (method === 'GET' && path.match(/\/sessions\/[^/]+$/)) {
    return handleGetSession(event);
  }

  if (method === 'PUT' && path.match(/\/sessions\/[^/]+$/)) {
    return handleUpdateSession(event);
  }

  if (method === 'PATCH' && path.match(/\/sessions\/[^/]+\/metadata$/)) {
    return handleUpdateMetadata(event);
  }

  if (method === 'DELETE' && path.match(/\/sessions\/[^/]+$/)) {
    return handleDeleteSession(event);
  }

  return error(404, 'NOT_FOUND', 'Endpoint not found.');
}

exports.handler = authRequired(async (event, context) => {
  try {
    return await router(event, context);
  } catch (err) {
    console.error('[sessions] Unexpected error:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Something went wrong. Please try again later.',
    );
  }
});



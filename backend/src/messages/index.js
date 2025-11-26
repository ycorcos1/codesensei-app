const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const { authRequired } = require('./shared/auth-middleware');
const { success, error } = require('./shared/response-helpers');

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

const MESSAGES_TABLE = process.env.MESSAGES_TABLE;
const THREADS_TABLE = process.env.THREADS_TABLE;
const MAX_MESSAGES_PER_THREAD = Number(
  process.env.MAX_MESSAGES_PER_THREAD || 500,
);
const MAX_USER_MESSAGE_LENGTH = Number(
  process.env.MAX_USER_MESSAGE_LENGTH || 5000,
);
const MAX_AI_MESSAGE_LENGTH = Number(
  process.env.MAX_AI_MESSAGE_LENGTH || 20000,
);

if (!MESSAGES_TABLE) {
  console.warn(
    '[messages] MESSAGES_TABLE environment variable is not set.',
  );
}

if (!THREADS_TABLE) {
  console.warn('[messages] THREADS_TABLE environment variable is not set.');
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

function sanitizeRole(value) {
  if (typeof value !== 'string') {
    throw new Error('INVALID_ROLE');
  }

  const normalized = value.trim().toLowerCase();

  if (normalized !== 'user' && normalized !== 'ai') {
    throw new Error('INVALID_ROLE');
  }

  return normalized;
}

function sanitizeContent(value, role) {
  if (typeof value !== 'string') {
    throw new Error('INVALID_CONTENT');
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('INVALID_CONTENT_EMPTY');
  }

  if (role === 'user' && trimmed.length > MAX_USER_MESSAGE_LENGTH) {
    throw new Error('MESSAGE_TOO_LONG_USER');
  }

  if (role === 'ai' && trimmed.length > MAX_AI_MESSAGE_LENGTH) {
    throw new Error('MESSAGE_TOO_LONG_AI');
  }

  return trimmed;
}

function sanitizeContextMode(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('INVALID_CONTEXT_MODE');
  }

  const normalized = value.trim().toLowerCase();

  if (normalized !== 'full' && normalized !== 'local') {
    throw new Error('INVALID_CONTEXT_MODE');
  }

  return normalized;
}

function sanitizeTokenCount(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('INVALID_TOKEN_COUNT');
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error('INVALID_TOKEN_COUNT');
  }

  return value;
}

async function fetchThreadById(threadId) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: THREADS_TABLE,
      Key: { thread_id: threadId },
    }),
  );

  return result.Item;
}

async function countMessagesForThread(threadId) {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: 'thread_id = :thread_id',
      ExpressionAttributeValues: {
        ':thread_id': threadId,
      },
      Select: 'COUNT',
    }),
  );

  return result.Count || 0;
}

async function handleCreateMessage(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const threadId =
    event.pathParameters?.thread_id ||
    event.pathParameters?.id ||
    event.path?.split('/')?.filter(Boolean)?.pop();

  if (!threadId) {
    return error(400, 'INVALID_INPUT', 'Thread ID is required');
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, 'INVALID_INPUT', 'Malformed JSON body.');
  }

  let role;
  let content;
  let contextMode;
  let tokenCount;
  let metadata;

  try {
    role = sanitizeRole(payload.role);
    content = sanitizeContent(payload.content, role);

    if (payload.context_mode !== undefined) {
      contextMode = sanitizeContextMode(payload.context_mode);
    }

    if (payload.token_count !== undefined) {
      tokenCount = sanitizeTokenCount(payload.token_count);
    }

    if (role === 'ai' && payload.metadata !== undefined) {
      if (payload.metadata === null || typeof payload.metadata !== 'object' || Array.isArray(payload.metadata)) {
        throw new Error('INVALID_METADATA');
      }

      metadata = {};

      if (payload.metadata.analysis !== undefined) {
        if (typeof payload.metadata.analysis !== 'string') {
          throw new Error('INVALID_METADATA_ANALYSIS');
        }
        metadata.analysis = payload.metadata.analysis;
      }

      if (payload.metadata.changes !== undefined) {
        if (!Array.isArray(payload.metadata.changes)) {
          throw new Error('INVALID_METADATA_CHANGES');
        }

        metadata.changes = payload.metadata.changes.map((change) => {
          if (
            !change ||
            typeof change !== 'object' ||
            !Number.isInteger(change.start_line) ||
            !Number.isInteger(change.end_line) ||
            change.start_line < 1 ||
            change.end_line < change.start_line ||
            typeof change.replacement !== 'string'
          ) {
            throw new Error('INVALID_METADATA_CHANGE');
          }

          return {
            start_line: change.start_line,
            end_line: change.end_line,
            replacement: change.replacement,
          };
        });
      }

      if (payload.metadata.context_mode !== undefined) {
        metadata.context_mode = sanitizeContextMode(payload.metadata.context_mode);
        if (contextMode === undefined) {
          contextMode = metadata.context_mode;
        }
      }

      if (payload.metadata.token_count !== undefined) {
        metadata.token_count = sanitizeTokenCount(payload.metadata.token_count);
        if (tokenCount === undefined) {
          tokenCount = metadata.token_count;
        }
      }

      if (payload.metadata.patch_applied !== undefined) {
        if (typeof payload.metadata.patch_applied !== 'boolean') {
          throw new Error('INVALID_METADATA_PATCH_APPLIED');
        }
        metadata.patch_applied = payload.metadata.patch_applied;
      }

      if (payload.metadata.applied_from_message_id !== undefined) {
        if (typeof payload.metadata.applied_from_message_id !== 'string') {
          throw new Error('INVALID_METADATA_APPLIED_FROM');
        }
        metadata.applied_from_message_id = payload.metadata.applied_from_message_id;
      }
    }
  } catch (err) {
    switch (err.message) {
      case 'INVALID_ROLE':
        return error(
          400,
          'INVALID_INPUT',
          'role must be either "user" or "ai".',
          'role',
        );
      case 'INVALID_CONTENT':
      case 'INVALID_CONTENT_EMPTY':
        return error(
          400,
          'INVALID_INPUT',
          'content must be a non-empty string.',
          'content',
        );
      case 'MESSAGE_TOO_LONG_USER':
        return error(
          400,
          'MESSAGE_TOO_LONG',
          `User messages are limited to ${MAX_USER_MESSAGE_LENGTH} characters.`,
          'content',
        );
      case 'MESSAGE_TOO_LONG_AI':
        return error(
          400,
          'MESSAGE_TOO_LONG',
          `AI messages are limited to ${MAX_AI_MESSAGE_LENGTH} characters.`,
          'content',
        );
      case 'INVALID_CONTEXT_MODE':
        return error(
          400,
          'INVALID_INPUT',
          'context_mode must be "full" or "local".',
          'context_mode',
        );
      case 'INVALID_TOKEN_COUNT':
        return error(
          400,
          'INVALID_INPUT',
          'token_count must be a non-negative integer.',
          'token_count',
        );
      case 'INVALID_METADATA':
        return error(
          400,
          'INVALID_INPUT',
          'metadata must be an object.',
          'metadata',
        );
      case 'INVALID_METADATA_ANALYSIS':
        return error(
          400,
          'INVALID_INPUT',
          'metadata.analysis must be a string.',
          'metadata.analysis',
        );
      case 'INVALID_METADATA_CHANGES':
        return error(
          400,
          'INVALID_INPUT',
          'metadata.changes must be an array.',
          'metadata.changes',
        );
      case 'INVALID_METADATA_CHANGE':
        return error(
          400,
          'INVALID_INPUT',
          'Each metadata.changes item must include start_line, end_line, and replacement.',
          'metadata.changes',
        );
      case 'INVALID_METADATA_PATCH_APPLIED':
        return error(
          400,
          'INVALID_INPUT',
          'metadata.patch_applied must be a boolean.',
          'metadata.patch_applied',
        );
      case 'INVALID_METADATA_APPLIED_FROM':
        return error(
          400,
          'INVALID_INPUT',
          'metadata.applied_from_message_id must be a string.',
          'metadata.applied_from_message_id',
        );
      default:
        throw err;
    }
  }

  if (contextMode !== undefined && role !== 'ai') {
    return error(
      400,
      'INVALID_INPUT',
      'context_mode can only be set for AI messages.',
      'context_mode',
    );
  }

  if (tokenCount !== undefined && role !== 'ai') {
    return error(
      400,
      'INVALID_INPUT',
      'token_count can only be set for AI messages.',
      'token_count',
    );
  }

  try {
    const thread = await fetchThreadById(threadId);

    if (!thread) {
      return error(404, 'THREAD_NOT_FOUND', 'Thread not found');
    }

    if (thread.user_id !== userId) {
      return error(
        403,
        'FORBIDDEN',
        'You do not have access to this thread',
      );
    }

    const existingCount = await countMessagesForThread(threadId);
    if (existingCount >= MAX_MESSAGES_PER_THREAD) {
      return error(
        400,
        'MESSAGE_LIMIT_EXCEEDED',
        `Maximum of ${MAX_MESSAGES_PER_THREAD} messages per thread reached.`,
      );
    }

    const messageId = uuidv4();
    let attempts = 0;
    let timestamp;

    while (attempts < 5) {
      timestamp = new Date(Date.now() + attempts).toISOString();

      const item = {
        thread_id: threadId,
        timestamp,
        message_id: messageId,
        user_id: userId,
        role,
        content,
        created_at: timestamp,
      };

      if (contextMode !== undefined) {
        item.context_mode = contextMode;
      }

      if (tokenCount !== undefined) {
        item.token_count = tokenCount;
      }

      if (metadata && Object.keys(metadata).length > 0) {
        item.metadata = metadata;
      }

      try {
        await documentClient.send(
          new PutCommand({
            TableName: MESSAGES_TABLE,
            Item: item,
            ConditionExpression: 'attribute_not_exists(thread_id)',
          }),
        );

        const responseMessage = {
          message_id: item.message_id,
          thread_id: item.thread_id,
          role: item.role,
          content: item.content,
          timestamp: item.created_at,
          user_id: item.user_id,
        };

        if (item.context_mode !== undefined) {
          responseMessage.context_mode = item.context_mode;
        }

        if (item.token_count !== undefined) {
          responseMessage.token_count = item.token_count;
        }

        if (item.metadata !== undefined) {
          responseMessage.metadata = item.metadata;
        }

        return success(201, { message: responseMessage });
      } catch (putErr) {
        if (putErr.name === 'ConditionalCheckFailedException') {
          attempts += 1;
          continue;
        }

        throw putErr;
      }
    }

    console.error(
      '[messages] Failed to persist message after multiple attempts.',
    );
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to create message. Please try again later.',
    );
  } catch (err) {
    if (err.message === 'INVALID_CURSOR') {
      return error(
        400,
        'INVALID_INPUT',
        'Invalid pagination cursor.',
        'cursor',
      );
    }

    console.error('[messages] Failed to create message:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to create message. Please try again later.',
    );
  }
}

async function handleListMessages(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'User ID not found in token');
  }

  const threadId =
    event.pathParameters?.thread_id ||
    event.pathParameters?.id ||
    event.path?.split('/')?.filter(Boolean)?.pop();

  if (!threadId) {
    return error(400, 'INVALID_INPUT', 'Thread ID is required');
  }

  const params = event.queryStringParameters || {};
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 100, 1), 100);

  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeCursor(params.cursor);
  } catch (err) {
    return error(
      400,
      'INVALID_INPUT',
      'Invalid pagination cursor.',
      'cursor',
    );
  }

  try {
    const thread = await fetchThreadById(threadId);

    if (!thread) {
      return error(404, 'THREAD_NOT_FOUND', 'Thread not found');
    }

    if (thread.user_id !== userId) {
      return error(
        403,
        'FORBIDDEN',
        'You do not have access to this thread',
      );
    }

    const result = await documentClient.send(
      new QueryCommand({
        TableName: MESSAGES_TABLE,
        KeyConditionExpression: 'thread_id = :thread_id',
        ExpressionAttributeValues: {
          ':thread_id': threadId,
        },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: limit,
        ScanIndexForward: true,
      }),
    );

    const messages = (result.Items || []).map((item) => {
      const message = {
        message_id: item.message_id,
        thread_id: item.thread_id,
        role: item.role,
        content: item.content,
        timestamp: item.created_at || item.timestamp,
        user_id: item.user_id,
      };

      if (item.context_mode !== undefined) {
        message.context_mode = item.context_mode;
      }

      if (item.token_count !== undefined) {
        message.token_count = item.token_count;
      }

      if (item.metadata !== undefined) {
        message.metadata = item.metadata;
      }

      return message;
    });

    const response = {
      messages,
      count: messages.length,
    };

    const cursor = encodeCursor(result.LastEvaluatedKey);
    if (cursor) {
      response.cursor = cursor;
    }

    return success(200, response);
  } catch (err) {
    console.error('[messages] Failed to list messages:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to fetch messages. Please try again later.',
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

  if (
    method === 'POST' &&
    resource === '/threads/{thread_id}/messages'
  ) {
    return handleCreateMessage(event);
  }

  if (
    method === 'GET' &&
    resource === '/threads/{thread_id}/messages'
  ) {
    return handleListMessages(event);
  }

  const path = event.path || '';

  if (
    method === 'POST' &&
    path.match(/\/threads\/[^/]+\/messages$/)
  ) {
    return handleCreateMessage(event);
  }

  if (
    method === 'GET' &&
    path.match(/\/threads\/[^/]+\/messages$/)
  ) {
    return handleListMessages(event);
  }

  return error(404, 'NOT_FOUND', 'Endpoint not found.');
}

exports.handler = authRequired(async (event, context) => {
  try {
    return await router(event, context);
  } catch (err) {
    console.error('[messages] Unexpected error:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Something went wrong. Please try again later.',
    );
  }
});



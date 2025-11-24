const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const { authRequired } = require('./shared/auth-middleware');
const { success, error } = require('./shared/response-helpers');
const { assertWithinRateLimit } = require('./shared/rate-limiter');
const { normalizeString } = require('./shared/validators');

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const THREADS_TABLE = process.env.THREADS_TABLE;
const AI_RATE_LIMIT_PER_MINUTE = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 10);

const MAX_PROMPT_LENGTH = 5000;
const MAX_CODE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_HISTORY_ITEMS = 10;
const CONTEXT_LOCAL_THRESHOLD_CHARS = 320000; // ~80k tokens

if (!THREADS_TABLE) {
  console.warn('[ai] THREADS_TABLE environment variable is not set.');
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

async function fetchThreadById(threadId) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: THREADS_TABLE,
      Key: { thread_id: threadId },
    }),
  );

  return result.Item;
}

function sanitizeSelection(rawSelection) {
  if (rawSelection === undefined || rawSelection === null) {
    return undefined;
  }

  if (typeof rawSelection !== 'object') {
    throw new Error('INVALID_SELECTION');
  }

  const startLine = Number(rawSelection.start_line);
  const endLine = Number(rawSelection.end_line);

  if (!Number.isInteger(startLine) || startLine < 1) {
    throw new Error('INVALID_SELECTION_START');
  }

  if (!Number.isInteger(endLine) || endLine < startLine) {
    throw new Error('INVALID_SELECTION_END');
  }

  const selectedText =
    typeof rawSelection.selected_text === 'string'
      ? rawSelection.selected_text
      : undefined;

  return {
    start_line: startLine,
    end_line: endLine,
    ...(selectedText !== undefined ? { selected_text: selectedText } : {}),
  };
}

function sanitizeHistory(history) {
  if (!history) {
    return [];
  }

  if (!Array.isArray(history)) {
    throw new Error('INVALID_HISTORY');
  }

  const trimmedHistory = history.slice(-MAX_HISTORY_ITEMS).map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`INVALID_HISTORY_ENTRY_${index}`);
    }

    const role = normalizeString(entry.role).toLowerCase();
    if (role !== 'user' && role !== 'ai') {
      throw new Error(`INVALID_HISTORY_ROLE_${index}`);
    }

    if (typeof entry.content !== 'string' || !entry.content.trim()) {
      throw new Error(`INVALID_HISTORY_CONTENT_${index}`);
    }

    return {
      role,
      content: entry.content,
    };
  });

  return trimmedHistory;
}

function determineContextMode(code = '') {
  return code.length > CONTEXT_LOCAL_THRESHOLD_CHARS ? 'local' : 'full';
}

function estimateTokenCount({ code, prompt, history }) {
  const historyChars = history.reduce(
    (total, message) => total + (message.content?.length || 0),
    0,
  );
  const totalChars = (code?.length || 0) + (prompt?.length || 0) + historyChars;

  return Math.ceil(totalChars / 4) || 1;
}

function generateStubResponse(payload) {
  const contextMode = determineContextMode(payload.code);
  const previewPrompt =
    payload.prompt.length > 100
      ? `${payload.prompt.substring(0, 100).trimEnd()}…`
      : payload.prompt;

  const selectionLabel = payload.selection
    ? `Lines ${payload.selection.start_line}-${payload.selection.end_line}`
    : 'Full file';

  const explanation = [
    '**AI Analysis Stub**',
    '',
    'This is a placeholder response. The real AWS Bedrock integration will arrive in Task 17.',
    '',
    '**Request Snapshot:**',
    `- Language: ${payload.language}`,
    `- Scope: ${selectionLabel}`,
    `- Context Mode: ${contextMode === 'local' ? 'Local (selection + context)' : 'Full file'}`,
    `- Prompt: "${previewPrompt}"`,
  ].join('\n');

  return {
    explanation,
    suggested_code: null,
    patch: null,
    context_mode: contextMode,
    confidence: 'high',
    token_count: estimateTokenCount(payload),
  };
}

async function handleAnalyze(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const withinLimit = await assertWithinRateLimit(
    event,
    `ai_analyze#${userId}`,
    AI_RATE_LIMIT_PER_MINUTE,
  );

  if (!withinLimit) {
    return error(
      429,
      'RATE_LIMIT_EXCEEDED',
      'Too many AI requests. Please try again in a minute.',
    );
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, 'INVALID_INPUT', 'Malformed JSON body.');
  }

  const rawThreadId = normalizeString(payload.thread_id || payload.threadId);
  if (!rawThreadId) {
    return error(
      400,
      'INVALID_INPUT',
      'thread_id is required.',
      'thread_id',
    );
  }

  const code = payload.code;
  if (typeof code !== 'string') {
    return error(
      400,
      'INVALID_INPUT',
      'code must be a string value.',
      'code',
    );
  }

  const codeBytes = Buffer.byteLength(code, 'utf8');
  if (codeBytes > MAX_CODE_BYTES) {
    return error(
      400,
      'FILE_TOO_LARGE',
      'Code payload exceeds the 5MB limit.',
      'code',
    );
  }

  const language = normalizeString(payload.language);
  if (!language) {
    return error(
      400,
      'INVALID_INPUT',
      'language is required.',
      'language',
    );
  }

  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    return error(
      400,
      'INVALID_INPUT',
      'prompt is required.',
      'prompt',
    );
  }

  const prompt = payload.prompt.trim();
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return error(
      400,
      'MESSAGE_TOO_LONG',
      `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
      'prompt',
    );
  }

  let selection;
  try {
    selection = sanitizeSelection(payload.selection);
  } catch (err) {
    switch (err.message) {
      case 'INVALID_SELECTION':
        return error(
          400,
          'INVALID_INPUT',
          'selection must be an object with start_line and end_line.',
          'selection',
        );
      case 'INVALID_SELECTION_START':
        return error(
          400,
          'INVALID_INPUT',
          'selection.start_line must be a positive integer.',
          'selection.start_line',
        );
      case 'INVALID_SELECTION_END':
        return error(
          400,
          'INVALID_INPUT',
          'selection.end_line must be an integer greater than or equal to start_line.',
          'selection.end_line',
        );
      default:
        return error(
          400,
          'INVALID_INPUT',
          'Invalid selection payload.',
          'selection',
        );
    }
  }

  let history = [];
  try {
    history = sanitizeHistory(payload.history);
  } catch (err) {
    return error(
      400,
      'INVALID_INPUT',
      'history must be an array of { role, content } items.',
      'history',
    );
  }

  try {
    const thread = await fetchThreadById(rawThreadId);

    if (!thread) {
      return error(404, 'THREAD_NOT_FOUND', 'Thread not found.');
    }

    if (thread.user_id !== userId) {
      return error(
        403,
        'FORBIDDEN',
        'You do not have access to this thread.',
      );
    }

    const response = generateStubResponse({
      code,
      prompt,
      language,
      selection,
      history,
    });

    return success(200, response);
  } catch (err) {
    console.error('[ai] Failed to handle analyze request:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Failed to analyze code. Please try again later.',
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

  if (method === 'POST' && resource === '/ai/analyze') {
    return handleAnalyze(event);
  }

  const normalizedPath = (event.path || '').toLowerCase();
  if (method === 'POST' && normalizedPath.endsWith('/ai/analyze')) {
    return handleAnalyze(event);
  }

  return error(404, 'NOT_FOUND', 'Endpoint not found.');
}

exports.handler = authRequired(async (event, context) => {
  try {
    return await router(event, context);
  } catch (err) {
    console.error('[ai] Unexpected error:', err);
    return error(
      500,
      'INTERNAL_ERROR',
      'Something went wrong. Please try again later.',
    );
  }
});


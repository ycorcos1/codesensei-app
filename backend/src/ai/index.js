const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const { TextDecoder } = require("util");
const JSON5 = require("json5");

const { authRequired } = require("./shared/auth-middleware");
const { success, error } = require("./shared/response-helpers");
const { assertWithinRateLimit } = require("./shared/rate-limiter");
const { normalizeString } = require("./shared/validators");

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const MAX_RETRIES = 3;
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1",
  maxAttempts: MAX_RETRIES,
});

const THREADS_TABLE = process.env.THREADS_TABLE;
const AI_RATE_LIMIT_PER_MINUTE = Number(
  process.env.AI_RATE_LIMIT_PER_MINUTE || 10
);
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20241022-v2:0";
const BEDROCK_REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
const BEDROCK_MAX_OUTPUT_TOKENS = Number(
  process.env.BEDROCK_MAX_OUTPUT_TOKENS || 4000
);
const BEDROCK_TEMPERATURE = Number(process.env.BEDROCK_TEMPERATURE || 0.7);
const BEDROCK_TIMEOUT_MS = 30000;
const FALLBACK_THRESHOLD_TOKENS = 80000;
const MAX_INPUT_TOKENS = 100000;
const CONTEXT_LINES_BUFFER = 50;

const MAX_PROMPT_LENGTH = 5000;
const MAX_CODE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_HISTORY_ITEMS = 10;

if (!THREADS_TABLE) {
  console.warn("[ai] THREADS_TABLE environment variable is not set.");
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
    throw new Error("INVALID_JSON");
  }
}

async function fetchThreadById(threadId) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: THREADS_TABLE,
      Key: { thread_id: threadId },
    })
  );

  return result.Item;
}

function sanitizeSelection(rawSelection) {
  if (rawSelection === undefined || rawSelection === null) {
    return undefined;
  }

  if (typeof rawSelection !== "object") {
    throw new Error("INVALID_SELECTION");
  }

  const startLine = Number(rawSelection.start_line);
  const endLine = Number(rawSelection.end_line);

  if (!Number.isInteger(startLine) || startLine < 1) {
    throw new Error("INVALID_SELECTION_START");
  }

  if (!Number.isInteger(endLine) || endLine < startLine) {
    throw new Error("INVALID_SELECTION_END");
  }

  const selectedText =
    typeof rawSelection.selected_text === "string"
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
    throw new Error("INVALID_HISTORY");
  }

  const trimmedHistory = history
    .slice(-MAX_HISTORY_ITEMS)
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`INVALID_HISTORY_ENTRY_${index}`);
      }

      const role = normalizeString(entry.role).toLowerCase();
      if (role !== "user" && role !== "ai") {
        throw new Error(`INVALID_HISTORY_ROLE_${index}`);
      }

      if (typeof entry.content !== "string" || !entry.content.trim()) {
        throw new Error(`INVALID_HISTORY_CONTENT_${index}`);
      }

      return {
        role,
        content: entry.content,
      };
    });

  return trimmedHistory;
}

function estimateTokenCount({ code, prompt, history }) {
  const historyChars = history.reduce(
    (total, message) => total + (message.content?.length || 0),
    0
  );
  const totalChars = (code?.length || 0) + (prompt?.length || 0) + historyChars;

  return Math.ceil(totalChars / 4) || 1;
}

function extractLocalContext(code, selection) {
  const lines = code.split("\n");
  const startIndex = Math.max(
    0,
    selection.start_line - 1 - CONTEXT_LINES_BUFFER
  );
  const endIndex = Math.min(
    lines.length,
    selection.end_line + CONTEXT_LINES_BUFFER
  );
  const contextLines = lines.slice(startIndex, endIndex);

  return {
    code: contextLines.join("\n"),
    actualStartLine: startIndex + 1,
    actualEndLine: endIndex,
  };
}

function buildSystemPrompt(language, contextMode, intent) {
  const common = [
    `You are an expert ${language} code reviewer.`,
    "Respond with ONLY a valid JSON object and nothing else.",
    "{",
    '  "analysis": "plain text explanation with no markdown or code fences",',
    '  "changes": [',
    '    { "start_line": number, "end_line": number, "replacement": "string" }',
    "  ]",
    "}",
    "Line numbers must reference the original file, not the snippet.",
    "analysis must be plain sentences suitable for chat display (no markdown fences, headers, or bullet markers).",
  ];

  if (intent === "explain") {
    common.push(
      "The user wants an explanation of the selected code.",
      "Describe what the code does, key behaviors, and any noteworthy edge cases in analysis.",
      "Do NOT suggest code changes. Return an empty changes array [].",
      "If the user explicitly asks for improvements, acknowledge that in analysis but keep changes empty."
    );
  } else {
    common.push(
      "The user wants to improve the code.",
      "If improvements are possible, return one or more entries in changes with the exact replacement code.",
      "If the code is already acceptable, return an empty changes array [] and explain why no changes are needed."
    );
  }

  if (contextMode === "local") {
    common.push(
      "The user only provided a portion of the file. When referencing line numbers, ALWAYS use the original file numbering as communicated in the prompt."
    );
  }

  return common.join("\n");
}

function buildUserPrompt({
  code,
  language,
  selection,
  prompt,
  history,
  contextMode,
  actualStartLine,
  actualEndLine,
}) {
  const historyText =
    history.length > 0
      ? `Previous conversation:\n${history
          .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
          .join("\n\n")}\n\n`
      : "";

  const selectionText = selection
    ? `Selected region (lines ${selection.start_line}-${
        selection.end_line
      }):\n${selection.selected_text || "(selection text not provided)"}\n\n`
    : "Full file review requested.\n\n";

  const contextNote =
    contextMode === "local"
      ? `Context note: You are viewing lines ${actualStartLine}-${actualEndLine} from the original file. When you reference or return line numbers (e.g., in patch.start_line), use ORIGINAL file line numbers.\n\n`
      : "";

  const promptSections = [
    `Language: ${language}`,
    contextNote,
    "Code snippet:",
    "```",
    code,
    "```",
    "",
    selectionText,
    historyText,
    `User question: ${prompt}`,
  ];

  return promptSections.filter((section) => section !== undefined).join("\n");
}

async function invokeBedrockWithRetry(prompt, systemPrompt) {
  let attempt = 0;
  let lastError;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BEDROCK_TIMEOUT_MS);

    try {
      const command = new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: BEDROCK_MAX_OUTPUT_TOKENS,
          temperature: BEDROCK_TEMPERATURE,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
            },
          ],
        }),
      });

      const response = await bedrockClient.send(command, {
        abortSignal: controller.signal,
      });
      clearTimeout(timeoutId);

      const rawBody = new TextDecoder().decode(response.body);
      return JSON.parse(rawBody);
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err.name === "AbortError" || err.message?.includes("timeout")) {
        if (attempt >= MAX_RETRIES) {
          const timeoutError = new Error("AI_TIMEOUT");
          timeoutError.cause = err;
          throw timeoutError;
        }
      } else if (
        err.name === "ThrottlingException" ||
        err.$metadata?.httpStatusCode === 429 ||
        err.name === "TooManyRequestsException"
      ) {
        if (attempt >= MAX_RETRIES) {
          const rateError = new Error("RATE_LIMIT_EXCEEDED");
          rateError.cause = err;
          throw rateError;
        }
      } else if (err.$metadata?.httpStatusCode >= 500) {
        if (attempt >= MAX_RETRIES) {
          const unavailableError = new Error("BEDROCK_UNAVAILABLE");
          unavailableError.cause = err;
          throw unavailableError;
        }
      } else {
        throw err;
      }

      const backoff = Math.min(1000 * 2 ** (attempt - 1), 4000);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError || new Error("BEDROCK_UNAVAILABLE");
}

function extractResponseText(bedrockResponse) {
  if (!bedrockResponse || !Array.isArray(bedrockResponse.content)) {
    return "";
  }

  const textSegment = bedrockResponse.content.find(
    (segment) => segment.type === "text"
  );
  if (!textSegment || typeof textSegment.text !== "string") {
    return "";
  }

  return textSegment.text;
}

function sanitizeAnalysisText(text) {
  if (typeof text !== "string") {
    return "";
  }

  const original = text.trim();
  if (!original) {
    return "";
  }

  let cleaned = original;

  // Remove markdown headers
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");

  // Remove bold/italic markers but keep content
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
  cleaned = cleaned.replace(/__([^_]+)__/g, "$1");
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1");

  // Remove inline code backticks but keep text
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // Replace bullet markers with simple bullets
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, "• ");

  // Remove numbered list formatting
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, "");

  // Collapse excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  cleaned = cleaned.trim();
  return cleaned.length > 0 ? cleaned : original;
}

function sanitizeReplacementCode(code) {
  if (typeof code !== "string") {
    return "";
  }

  let cleaned = code;

  // Strip leading markdown fences with optional language tag
  cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*\r?\n/, "");

  // Strip trailing markdown fence
  cleaned = cleaned.replace(/\r?\n```$/, "");

  // Remove narrative prefixes such as "Here is the code:"
  cleaned = cleaned.replace(
    /^(Here'?s?\s+(the\s+)?(improved|updated|corrected)?\s*code:?)(\s*\n)+/i,
    ""
  );

  return cleaned;
}

function parseBedrockResponse(bedrockResponse) {
  const responseText = extractResponseText(bedrockResponse);

  if (!responseText) {
    throw new Error("AI_MALFORMED_RESPONSE");
  }

  let jsonPayload;
  try {
    const firstBrace = responseText.indexOf("{");
    const lastBrace = responseText.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("NO_JSON_OBJECT");
    }
    const rawObject = responseText.slice(firstBrace, lastBrace + 1);
    try {
      jsonPayload = JSON.parse(rawObject);
    } catch (err) {
      jsonPayload = JSON5.parse(rawObject);
    }
  } catch (err) {
    try {
      jsonPayload = JSON5.parse(responseText);
    } catch (secondaryError) {
      console.error(
        "[ai] Failed to parse AI response JSON:",
        secondaryError,
        responseText
      );
      throw new Error("AI_MALFORMED_RESPONSE");
    }
  }

  if (
    typeof jsonPayload.analysis !== "string" ||
    !jsonPayload.analysis.trim()
  ) {
    throw new Error("AI_MALFORMED_RESPONSE");
  }

  if (!Array.isArray(jsonPayload.changes)) {
    throw new Error("AI_MALFORMED_RESPONSE");
  }

  const analysis = sanitizeAnalysisText(jsonPayload.analysis);
  if (!analysis.trim()) {
    throw new Error("AI_MALFORMED_RESPONSE");
  }
  const changes = jsonPayload.changes.map((change) => {
    if (
      !change ||
      typeof change !== "object" ||
      !Number.isInteger(change.start_line) ||
      !Number.isInteger(change.end_line) ||
      change.start_line < 1 ||
      change.end_line < change.start_line ||
      typeof change.replacement !== "string"
    ) {
      throw new Error("AI_MALFORMED_RESPONSE");
    }

    return {
      start_line: change.start_line,
      end_line: change.end_line,
      replacement: sanitizeReplacementCode(change.replacement),
    };
  });

  return {
    analysis,
    changes,
  };
}

async function callBedrock({
  code,
  prompt,
  language,
  selection,
  history,
  mode,
}) {
  const intentMode = mode === "explain" ? "explain" : "improve";
  const baselineTokens = estimateTokenCount({ code, prompt, history });

  let contextMode = "full";
  let effectiveCode = code;
  let actualStartLine = 1;
  let actualEndLine = code.split("\n").length;

  if (baselineTokens > FALLBACK_THRESHOLD_TOKENS) {
    if (!selection) {
      throw new Error("TOKEN_LIMIT_EXCEEDED_NEEDS_SELECTION");
    }

    const localContext = extractLocalContext(code, selection);
    contextMode = "local";
    effectiveCode = localContext.code;
    actualStartLine = localContext.actualStartLine;
    actualEndLine = localContext.actualEndLine;
  }

  const inputTokens = estimateTokenCount({
    code: effectiveCode,
    prompt,
    history,
  });
  if (inputTokens > MAX_INPUT_TOKENS) {
    throw new Error("TOKEN_LIMIT_EXCEEDED");
  }

  const systemPrompt = buildSystemPrompt(language, contextMode, intentMode);
  const userPrompt = buildUserPrompt({
    code: effectiveCode,
    language,
    selection,
    prompt,
    history,
    contextMode,
    actualStartLine,
    actualEndLine,
  });

  const bedrockResponse = await invokeBedrockWithRetry(
    userPrompt,
    systemPrompt
  );
  const parsed = parseBedrockResponse(bedrockResponse);

  if (intentMode === "explain" && parsed.changes.length > 0) {
    throw new Error("AI_MALFORMED_RESPONSE");
  }

  const translatedChanges =
    contextMode === "local"
      ? parsed.changes.map((change) => {
          const snippetLineCount = effectiveCode.split("\n").length;
          const appearsRelative =
            change.start_line >= 1 &&
            change.end_line >= change.start_line &&
            change.end_line <= snippetLineCount &&
            actualStartLine > 1;

          if (appearsRelative) {
            return {
              ...change,
              start_line: change.start_line + actualStartLine - 1,
              end_line: change.end_line + actualStartLine - 1,
            };
          }

          return change;
        })
      : parsed.changes;

  const analysisLength = parsed.analysis.length || 0;
  const replacementLength = translatedChanges.reduce(
    (total, change) => total + (change.replacement?.length || 0),
    0
  );
  const outputTokens = Math.ceil((analysisLength + replacementLength) / 4);

  return {
    analysis: parsed.analysis,
    changes: translatedChanges,
    context_mode: contextMode,
    token_count: inputTokens + outputTokens,
    intent: intentMode,
  };
}

async function handleAnalyze(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, "UNAUTHORIZED", "Authentication required");
  }

  const withinLimit = await assertWithinRateLimit(
    event,
    `ai_analyze#${userId}`,
    AI_RATE_LIMIT_PER_MINUTE
  );

  if (!withinLimit) {
    return error(
      429,
      "RATE_LIMIT_EXCEEDED",
      "Too many AI requests. Please try again in a minute."
    );
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, "INVALID_INPUT", "Malformed JSON body.");
  }

  const rawThreadId = normalizeString(payload.thread_id || payload.threadId);
  if (!rawThreadId) {
    return error(400, "INVALID_INPUT", "thread_id is required.", "thread_id");
  }

  const code = payload.code;
  if (typeof code !== "string") {
    return error(400, "INVALID_INPUT", "code must be a string value.", "code");
  }

  const codeBytes = Buffer.byteLength(code, "utf8");
  if (codeBytes > MAX_CODE_BYTES) {
    return error(
      400,
      "FILE_TOO_LARGE",
      "Code payload exceeds the 5MB limit.",
      "code"
    );
  }

  const language = normalizeString(payload.language);
  if (!language) {
    return error(400, "INVALID_INPUT", "language is required.", "language");
  }

  if (typeof payload.prompt !== "string" || !payload.prompt.trim()) {
    return error(400, "INVALID_INPUT", "prompt is required.", "prompt");
  }

  const prompt = payload.prompt.trim();
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return error(
      400,
      "MESSAGE_TOO_LONG",
      `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
      "prompt"
    );
  }

  const modeRaw = normalizeString(payload.mode);
  const intent =
    modeRaw === "explain" || modeRaw === "improve" ? modeRaw : "improve";

  let selection;
  try {
    selection = sanitizeSelection(payload.selection);
  } catch (err) {
    switch (err.message) {
      case "INVALID_SELECTION":
        return error(
          400,
          "INVALID_INPUT",
          "selection must be an object with start_line and end_line.",
          "selection"
        );
      case "INVALID_SELECTION_START":
        return error(
          400,
          "INVALID_INPUT",
          "selection.start_line must be a positive integer.",
          "selection.start_line"
        );
      case "INVALID_SELECTION_END":
        return error(
          400,
          "INVALID_INPUT",
          "selection.end_line must be an integer greater than or equal to start_line.",
          "selection.end_line"
        );
      default:
        return error(
          400,
          "INVALID_INPUT",
          "Invalid selection payload.",
          "selection"
        );
    }
  }

  let history = [];
  try {
    history = sanitizeHistory(payload.history);
  } catch (err) {
    return error(
      400,
      "INVALID_INPUT",
      "history must be an array of { role, content } items.",
      "history"
    );
  }

  try {
    const thread = await fetchThreadById(rawThreadId);

    if (!thread) {
      return error(404, "THREAD_NOT_FOUND", "Thread not found.");
    }

    if (thread.user_id !== userId) {
      return error(403, "FORBIDDEN", "You do not have access to this thread.");
    }

    try {
      const response = await callBedrock({
        code,
        prompt,
        language,
        selection,
        history,
        mode: intent,
      });

      return success(200, { ...response, intent });
    } catch (err) {
      console.error("[ai] Bedrock call failed:", err);

      switch (err.message) {
        case "TOKEN_LIMIT_EXCEEDED_NEEDS_SELECTION":
          return error(
            400,
            "TOKEN_LIMIT_EXCEEDED",
            "This file is too large for a full analysis. Select a smaller code block and try again.",
            "code"
          );
        case "TOKEN_LIMIT_EXCEEDED":
          return error(
            400,
            "TOKEN_LIMIT_EXCEEDED",
            "This selection is too large for the AI context window. Reduce the selection and try again.",
            "selection"
          );
        case "AI_TIMEOUT":
          return error(
            504,
            "AI_TIMEOUT",
            "AI request timed out. Try with a smaller code selection."
          );
        case "AI_MALFORMED_RESPONSE":
          return error(
            502,
            "AI_MALFORMED_RESPONSE",
            "AI response could not be processed. Please try again."
          );
        case "RATE_LIMIT_EXCEEDED":
          return error(
            429,
            "RATE_LIMIT_EXCEEDED",
            "AI service is busy. Please try again in a moment."
          );
        case "BEDROCK_UNAVAILABLE":
          return error(
            503,
            "BEDROCK_UNAVAILABLE",
            "AI service is temporarily unavailable. Please try again later."
          );
        default:
          return error(
            500,
            "INTERNAL_ERROR",
            "Failed to analyze code. Please try again later."
          );
      }
    }
  } catch (err) {
    console.error("[ai] Failed to handle analyze request:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Failed to analyze code. Please try again later."
    );
  }
}

async function router(event) {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const resource =
    event.resource || event.requestContext?.resourcePath || event.path;

  if (method === "OPTIONS") {
    return success(204, {});
  }

  if (method === "POST" && resource === "/ai/analyze") {
    return handleAnalyze(event);
  }

  const normalizedPath = (event.path || "").toLowerCase();
  if (method === "POST" && normalizedPath.endsWith("/ai/analyze")) {
    return handleAnalyze(event);
  }

  return error(404, "NOT_FOUND", "Endpoint not found.");
}

exports.handler = authRequired(async (event, context) => {
  try {
    return await router(event, context);
  } catch (err) {
    console.error("[ai] Unexpected error:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Something went wrong. Please try again later."
    );
  }
});

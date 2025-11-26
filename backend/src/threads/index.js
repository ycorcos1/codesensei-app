const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const { authRequired } = require("./shared/auth-middleware");
const { success, error } = require("./shared/response-helpers");

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

const THREADS_TABLE = process.env.THREADS_TABLE;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const MAX_THREADS_PER_SESSION = Number(
  process.env.MAX_THREADS_PER_SESSION || 50
);

if (!THREADS_TABLE) {
  console.warn("[threads] THREADS_TABLE environment variable is not set.");
}

if (!SESSIONS_TABLE) {
  console.warn("[threads] SESSIONS_TABLE environment variable is not set.");
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

function decodeCursor(cursor) {
  if (!cursor) {
    return undefined;
  }

  try {
    const json = Buffer.from(cursor, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (err) {
    throw new Error("INVALID_CURSOR");
  }
}

function encodeCursor(key) {
  if (!key) {
    return undefined;
  }

  return Buffer.from(JSON.stringify(key)).toString("base64");
}

function sanitizeThreadType(value) {
  if (typeof value !== "string") {
    throw new Error("INVALID_THREAD_TYPE");
  }

  const normalized = value.trim().toLowerCase();

  if (normalized !== "block" && normalized !== "file") {
    throw new Error("INVALID_THREAD_TYPE");
  }

  return normalized;
}

function sanitizeLineNumber(value, { fieldName }) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`INVALID_${fieldName.toUpperCase()}`);
  }

  return value;
}

function sanitizeSelectedText(value) {
  if (typeof value !== "string") {
    throw new Error("INVALID_SELECTED_TEXT");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("INVALID_SELECTED_TEXT");
  }

  return trimmed;
}

function sanitizeAnchorStatus(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("INVALID_ANCHOR_STATUS");
  }

  const normalized = value.trim().toLowerCase();

  if (normalized !== "stable" && normalized !== "approximate") {
    throw new Error("INVALID_ANCHOR_STATUS");
  }

  return normalized;
}

async function fetchSessionById(sessionId) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { session_id: sessionId },
    })
  );

  return result.Item;
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

async function countThreadsForSession(sessionId) {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: THREADS_TABLE,
      IndexName: "SessionIdIndex",
      KeyConditionExpression: "session_id = :session_id",
      ExpressionAttributeValues: {
        ":session_id": sessionId,
      },
      Select: "COUNT",
    })
  );

  return result.Count || 0;
}

async function handleCreateThread(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, "UNAUTHORIZED", "User ID not found in token");
  }

  const sessionId =
    event.pathParameters?.id ||
    event.pathParameters?.session_id ||
    event.path?.split("/")?.filter(Boolean)?.slice(-2)[0];

  if (!sessionId) {
    return error(400, "INVALID_INPUT", "Session ID is required");
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, "INVALID_INPUT", "Malformed JSON body.");
  }

  let threadType;
  let startLine;
  let endLine;
  let selectedText;

  try {
    threadType = sanitizeThreadType(payload.type);
    startLine = sanitizeLineNumber(payload.start_line, {
      fieldName: "start_line",
    });
    endLine = sanitizeLineNumber(payload.end_line, { fieldName: "end_line" });
    selectedText = sanitizeSelectedText(payload.selected_text);
  } catch (err) {
    switch (err.message) {
      case "INVALID_THREAD_TYPE":
        return error(
          400,
          "INVALID_INPUT",
          'type must be either "block" or "file".',
          "type"
        );
      case "INVALID_START_LINE":
        return error(
          400,
          "INVALID_INPUT",
          "start_line must be a positive integer.",
          "start_line"
        );
      case "INVALID_END_LINE":
        return error(
          400,
          "INVALID_INPUT",
          "end_line must be a positive integer.",
          "end_line"
        );
      case "INVALID_SELECTED_TEXT":
        return error(
          400,
          "INVALID_INPUT",
          "selected_text must be a non-empty string.",
          "selected_text"
        );
      default:
        throw err;
    }
  }

  if (endLine < startLine) {
    return error(
      400,
      "INVALID_INPUT",
      "end_line must be greater than or equal to start_line.",
      "end_line"
    );
  }

  try {
    const session = await fetchSessionById(sessionId);

    if (!session) {
      return error(404, "SESSION_NOT_FOUND", "Session not found");
    }

    if (session.user_id !== userId) {
      return error(403, "FORBIDDEN", "You do not have access to this session");
    }

    const threadCount = await countThreadsForSession(sessionId);
    if (threadCount >= MAX_THREADS_PER_SESSION) {
      return error(
        400,
        "THREAD_LIMIT_EXCEEDED",
        `Maximum of ${MAX_THREADS_PER_SESSION} threads per session reached.`
      );
    }

    const threadId = uuidv4();
    const timestamp = new Date().toISOString();

    const item = {
      thread_id: threadId,
      session_id: sessionId,
      user_id: userId,
      type: threadType,
      start_line: startLine,
      end_line: endLine,
      selected_text: selectedText,
      anchor_status: "stable",
      created_at: timestamp,
      updated_at: timestamp,
    };

    await documentClient.send(
      new PutCommand({
        TableName: THREADS_TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(thread_id)",
      })
    );

    return success(201, {
      thread: item,
    });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return error(
        409,
        "THREAD_ALREADY_EXISTS",
        "Thread could not be created at this time. Please retry."
      );
    }

    console.error("[threads] Failed to create thread:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Failed to create thread. Please try again later."
    );
  }
}

async function handleListThreads(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, "UNAUTHORIZED", "User ID not found in token");
  }

  const sessionId =
    event.pathParameters?.id ||
    event.pathParameters?.session_id ||
    event.path?.split("/")?.filter(Boolean)?.slice(-2)[0];

  if (!sessionId) {
    return error(400, "INVALID_INPUT", "Session ID is required");
  }

  const params = event.queryStringParameters || {};

  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 50);

  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeCursor(params.cursor);
  } catch (err) {
    return error(400, "INVALID_INPUT", "Invalid pagination cursor", "cursor");
  }

  try {
    const session = await fetchSessionById(sessionId);

    if (!session) {
      return error(404, "SESSION_NOT_FOUND", "Session not found");
    }

    if (session.user_id !== userId) {
      return error(403, "FORBIDDEN", "You do not have access to this session");
    }

    const result = await documentClient.send(
      new QueryCommand({
        TableName: THREADS_TABLE,
        IndexName: "SessionIdIndex",
        KeyConditionExpression: "session_id = :session_id",
        ExpressionAttributeValues: {
          ":session_id": sessionId,
        },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: limit,
        ScanIndexForward: false, // newest first
      })
    );

    const threads = (result.Items || []).map((item) => ({
      thread_id: item.thread_id,
      session_id: item.session_id,
      user_id: item.user_id,
      type: item.type,
      start_line: item.start_line,
      end_line: item.end_line,
      selected_text: item.selected_text || "",
      anchor_status: item.anchor_status || "stable",
      created_at: item.created_at,
      updated_at: item.updated_at || item.created_at,
    }));

    const response = {
      threads,
      count: threads.length,
    };

    const cursor = encodeCursor(result.LastEvaluatedKey);
    if (cursor) {
      response.cursor = cursor;
    }

    return success(200, response);
  } catch (err) {
    console.error("[threads] Failed to list threads:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Failed to fetch threads. Please try again later."
    );
  }
}

async function handleGetThread(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, "UNAUTHORIZED", "User ID not found in token");
  }

  const threadId =
    event.pathParameters?.thread_id ||
    event.pathParameters?.id ||
    event.path?.split("/")?.filter(Boolean)?.pop();

  if (!threadId) {
    return error(400, "INVALID_INPUT", "Thread ID is required");
  }

  try {
    const thread = await fetchThreadById(threadId);

    if (!thread) {
      return error(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    if (thread.user_id !== userId) {
      return error(403, "FORBIDDEN", "You do not have access to this thread");
    }

    return success(200, { thread });
  } catch (err) {
    console.error("[threads] Failed to get thread:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Failed to retrieve thread. Please try again later."
    );
  }
}

async function handleUpdateThread(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, "UNAUTHORIZED", "User ID not found in token");
  }

  const threadId =
    event.pathParameters?.thread_id ||
    event.pathParameters?.id ||
    event.path?.split("/")?.filter(Boolean)?.pop();

  if (!threadId) {
    return error(400, "INVALID_INPUT", "Thread ID is required");
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, "INVALID_INPUT", "Malformed JSON body.");
  }

  let anchorStatus;
  let startLine;
  let endLine;
  let selectedText;

  try {
    anchorStatus = sanitizeAnchorStatus(payload.anchor_status);

    if (payload.start_line !== undefined) {
      startLine = sanitizeLineNumber(payload.start_line, {
        fieldName: "start_line",
      });
    }

    if (payload.end_line !== undefined) {
      endLine = sanitizeLineNumber(payload.end_line, {
        fieldName: "end_line",
      });
    }

    if (payload.selected_text !== undefined) {
      selectedText = sanitizeSelectedText(payload.selected_text);
    }
  } catch (err) {
    switch (err.message) {
      case "INVALID_ANCHOR_STATUS":
        return error(
          400,
          "INVALID_INPUT",
          'anchor_status must be "stable" or "approximate".',
          "anchor_status"
        );
      case "INVALID_START_LINE":
        return error(
          400,
          "INVALID_INPUT",
          "start_line must be a positive integer.",
          "start_line"
        );
      case "INVALID_END_LINE":
        return error(
          400,
          "INVALID_INPUT",
          "end_line must be a positive integer.",
          "end_line"
        );
      case "INVALID_SELECTED_TEXT":
        return error(
          400,
          "INVALID_INPUT",
          "selected_text must be a non-empty string.",
          "selected_text"
        );
      default:
        throw err;
    }
  }

  if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
    return error(
      400,
      "INVALID_INPUT",
      "end_line must be greater than or equal to start_line.",
      "end_line"
    );
  }

  if (
    anchorStatus === undefined &&
    startLine === undefined &&
    endLine === undefined &&
    selectedText === undefined
  ) {
    return error(400, "INVALID_INPUT", "No updatable fields were supplied.");
  }

  try {
    const currentThread = await fetchThreadById(threadId);

    if (!currentThread) {
      return error(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    if (currentThread.user_id !== userId) {
      return error(403, "FORBIDDEN", "You do not have access to this thread");
    }

    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ":updated_at": new Date().toISOString(),
    };

    if (anchorStatus !== undefined) {
      updateExpressions.push("#anchor_status = :anchor_status");
      expressionAttributeNames["#anchor_status"] = "anchor_status";
      expressionAttributeValues[":anchor_status"] = anchorStatus;
    }

    if (startLine !== undefined) {
      updateExpressions.push("#start_line = :start_line");
      expressionAttributeNames["#start_line"] = "start_line";
      expressionAttributeValues[":start_line"] = startLine;
    }

    if (endLine !== undefined) {
      updateExpressions.push("#end_line = :end_line");
      expressionAttributeNames["#end_line"] = "end_line";
      expressionAttributeValues[":end_line"] = endLine;
    }

    if (selectedText !== undefined) {
      updateExpressions.push("#selected_text = :selected_text");
      expressionAttributeNames["#selected_text"] = "selected_text";
      expressionAttributeValues[":selected_text"] = selectedText;
    }

    updateExpressions.push("#updated_at = :updated_at");
    expressionAttributeNames["#updated_at"] = "updated_at";

    const result = await documentClient.send(
      new UpdateCommand({
        TableName: THREADS_TABLE,
        Key: { thread_id: threadId },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    return success(200, { thread: result.Attributes });
  } catch (err) {
    console.error("[threads] Failed to update thread:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Failed to update thread. Please try again later."
    );
  }
}

async function handleUpdateThreadAnchor(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, "UNAUTHORIZED", "User ID not found in token");
  }

  const threadId =
    event.pathParameters?.thread_id ||
    event.pathParameters?.id ||
    event.path?.split("/")?.filter(Boolean)?.pop();

  if (!threadId) {
    return error(400, "INVALID_INPUT", "Thread ID is required");
  }

  let payload;
  try {
    payload = parseJsonBody(event);
  } catch (err) {
    return error(400, "INVALID_INPUT", "Malformed JSON body.");
  }

  let startLine;
  let endLine;
  let selectedText;

  try {
    startLine = sanitizeLineNumber(payload.start_line, {
      fieldName: "start_line",
    });
    endLine = sanitizeLineNumber(payload.end_line, {
      fieldName: "end_line",
    });

    if (typeof payload.selected_text !== "string") {
      throw new Error("INVALID_SELECTED_TEXT");
    }
    selectedText = payload.selected_text;
  } catch (err) {
    switch (err.message) {
      case "INVALID_START_LINE":
        return error(
          400,
          "INVALID_INPUT",
          "start_line must be a positive integer.",
          "start_line"
        );
      case "INVALID_END_LINE":
        return error(
          400,
          "INVALID_INPUT",
          "end_line must be a positive integer.",
          "end_line"
        );
      case "INVALID_SELECTED_TEXT":
        return error(
          400,
          "INVALID_INPUT",
          "selected_text must be a string.",
          "selected_text"
        );
      default:
        throw err;
    }
  }

  if (endLine < startLine) {
    return error(
      400,
      "INVALID_INPUT",
      "end_line must be greater than or equal to start_line.",
      "end_line"
    );
  }

  try {
    const thread = await fetchThreadById(threadId);

    if (!thread) {
      return error(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    if (thread.user_id !== userId) {
      return error(403, "FORBIDDEN", "You do not have access to this thread");
    }

    const updatedAt = new Date().toISOString();

    await documentClient.send(
      new UpdateCommand({
        TableName: THREADS_TABLE,
        Key: { thread_id: threadId },
        UpdateExpression:
          "SET start_line = :start_line, end_line = :end_line, selected_text = :selected_text, updated_at = :updated_at",
        ExpressionAttributeValues: {
          ":start_line": startLine,
          ":end_line": endLine,
          ":selected_text": selectedText,
          ":updated_at": updatedAt,
        },
        ConditionExpression: "attribute_exists(thread_id)",
      })
    );

    return success(200, {
      thread: {
        ...thread,
        start_line: startLine,
        end_line: endLine,
        selected_text: selectedText,
        updated_at: updatedAt,
      },
    });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return error(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    console.error("[threads] Failed to update thread anchor:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Failed to update thread. Please try again later."
    );
  }
}

async function handleDeleteThread(event) {
  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return error(401, "UNAUTHORIZED", "User ID not found in token");
  }

  const threadId =
    event.pathParameters?.thread_id ||
    event.pathParameters?.id ||
    event.path?.split("/")?.filter(Boolean)?.pop();

  if (!threadId) {
    return error(400, "INVALID_INPUT", "Thread ID is required");
  }

  try {
    const currentThread = await fetchThreadById(threadId);

    if (!currentThread) {
      return error(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    if (currentThread.user_id !== userId) {
      return error(403, "FORBIDDEN", "You do not have access to this thread");
    }

    await documentClient.send(
      new DeleteCommand({
        TableName: THREADS_TABLE,
        Key: { thread_id: threadId },
      })
    );

    return success(200, {
      thread_id: threadId,
      message: "Thread deleted successfully.",
    });
  } catch (err) {
    console.error("[threads] Failed to delete thread:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Failed to delete thread. Please try again later."
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

  if (method === "POST" && resource === "/sessions/{id}/threads") {
    return handleCreateThread(event);
  }

  if (method === "GET" && resource === "/sessions/{id}/threads") {
    return handleListThreads(event);
  }

  if (method === "GET" && resource === "/threads/{thread_id}") {
    return handleGetThread(event);
  }

  if (method === "PUT" && resource === "/threads/{thread_id}") {
    return handleUpdateThread(event);
  }

  if (method === "PATCH" && resource === "/threads/{thread_id}/anchor") {
    return handleUpdateThreadAnchor(event);
  }

  if (method === "DELETE" && resource === "/threads/{thread_id}") {
    return handleDeleteThread(event);
  }

  const path = event.path || "";

  if (method === "POST" && path.match(/\/sessions\/[^/]+\/threads$/)) {
    return handleCreateThread(event);
  }

  if (method === "GET" && path.match(/\/sessions\/[^/]+\/threads$/)) {
    return handleListThreads(event);
  }

  if (method === "GET" && path.match(/\/threads\/[^/]+$/)) {
    return handleGetThread(event);
  }

  if (method === "PUT" && path.match(/\/threads\/[^/]+$/)) {
    return handleUpdateThread(event);
  }

  if (method === "PATCH" && path.match(/\/threads\/[^/]+\/anchor$/)) {
    return handleUpdateThreadAnchor(event);
  }

  if (method === "DELETE" && path.match(/\/threads\/[^/]+$/)) {
    return handleDeleteThread(event);
  }

  return error(404, "NOT_FOUND", "Endpoint not found.");
}

exports.handler = authRequired(async (event, context) => {
  try {
    return await router(event, context);
  } catch (err) {
    console.error("[threads] Unexpected error:", err);
    return error(
      500,
      "INTERNAL_ERROR",
      "Something went wrong. Please try again later."
    );
  }
});

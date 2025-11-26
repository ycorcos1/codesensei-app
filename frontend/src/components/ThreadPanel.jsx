import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";

import { api, APIError } from "../utils/api";
import classifyIntent from "../utils/aiIntent";
import { useAuth } from "../context/AuthContext";
import DiffModal from "./DiffModal";

const MAX_MESSAGE_LENGTH = 5000;
const WARNING_THRESHOLD = 4500;
const MAX_HISTORY_FOR_AI = 10;

const LANGUAGE_TO_MONACO = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  go: "go",
  rust: "rust",
  "c++": "cpp",
  c: "c",
  "c#": "csharp",
  php: "php",
  ruby: "ruby",
  html: "html",
  css: "css",
  sql: "sql",
  json: "json",
  yaml: "yaml",
  markdown: "markdown",
  shell: "shell",
  "plain text": "plaintext",
};

function toMonacoLanguage(languageName) {
  if (!languageName || typeof languageName !== "string") {
    return "plaintext";
  }
  const normalized = languageName.trim().toLowerCase();
  return LANGUAGE_TO_MONACO[normalized] || "plaintext";
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  const now = Date.now();
  const messageTime = new Date(timestamp).getTime();

  if (Number.isNaN(messageTime)) {
    return "";
  }

  const diffMs = now - messageTime;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function normalizeMessagesResponse(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.messages)) {
    return payload.messages;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
}

export default function ThreadPanel({
  thread,
  onClose,
  sessionCode,
  sessionLanguage,
  onApplyPatch,
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userInput, setUserInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messageExtras, setMessageExtras] = useState({});
  const [diffState, setDiffState] = useState(null);
  const [appliedMessageIds, setAppliedMessageIds] = useState(() => new Set());
  const [applyingPatch, setApplyingPatch] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const threadId = thread?.thread_id;
  const effectiveCode = typeof sessionCode === "string" ? sessionCode : "";
  const effectiveLanguage =
    typeof sessionLanguage === "string" && sessionLanguage.trim()
      ? sessionLanguage.trim()
      : "Plain Text";

  const scrollToBottom = useCallback((behavior = "auto") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  const handleAuthFailure = useCallback(async () => {
    await logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    if (!threadId) {
      return;
    }

    let isSubscribed = true;

    const fetchMessages = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.getMessages(threadId);
        if (!isSubscribed) {
          return;
        }
        const threadMessages = normalizeMessagesResponse(response);
        setMessages(threadMessages);

        const restoredExtras = {};
        const restoredApplied = new Set();

        threadMessages.forEach((message) => {
          if (message.role !== "ai" || !message.metadata) {
            return;
          }

          const changes = Array.isArray(message.metadata.changes)
            ? message.metadata.changes
            : [];
          const contextMode =
            typeof message.metadata.context_mode === "string"
              ? message.metadata.context_mode
              : null;
          const intent =
            typeof message.metadata.intent === "string"
              ? message.metadata.intent
              : "improve";

          restoredExtras[message.message_id] = {
            changes,
            context_mode: contextMode,
            intent,
          };

          if (
            message.metadata.patch_applied === true &&
            typeof message.metadata.applied_from_message_id === "string"
          ) {
            restoredApplied.add(message.metadata.applied_from_message_id);
          }
        });

        setMessageExtras(restoredExtras);
        setAppliedMessageIds(restoredApplied);
      } catch (err) {
        if (!isSubscribed) {
          return;
        }

        if (err instanceof APIError && err.statusCode === 401) {
          await handleAuthFailure();
          return;
        }

        const message =
          err instanceof APIError
            ? err.message || "Failed to load messages."
            : "Failed to load messages. Please try again.";
        setError(message);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    };

    setMessages([]);
    setUserInput("");
    setError("");
    setLoading(true);
    setMessageExtras({});
    setAppliedMessageIds(new Set());
    setDiffState(null);
    fetchMessages();

    return () => {
      isSubscribed = false;
    };
  }, [threadId, handleAuthFailure]);

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userInput, threadId]);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleSendMessage = useCallback(async () => {
    const trimmed = userInput.trim();

    if (!threadId || !trimmed || sending) {
      return;
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(`Message exceeds ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }

    const tempMessage = {
      message_id: `temp-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
      _optimistic: true,
    };

    const optimisticTimeline = [...messages, tempMessage];
    let userMessageCreated = false;
    let thinkingMessage = null;
    let timelineWithUser = optimisticTimeline;

    try {
      setSending(true);
      setError("");
      setMessages(optimisticTimeline);
      setUserInput("");

      const createResponse = await api.createMessage(threadId, {
        role: "user",
        content: trimmed,
      });
      const createdMessage = createResponse?.message || createResponse;
      userMessageCreated = true;

      timelineWithUser = optimisticTimeline.map((message) =>
        message.message_id === tempMessage.message_id ? createdMessage : message
      );
      setMessages(timelineWithUser);

      const historyPayload = timelineWithUser
        .slice(-MAX_HISTORY_FOR_AI)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      thinkingMessage = {
        message_id: `thinking-${Date.now()}`,
        role: "ai",
        content: "",
        timestamp: new Date().toISOString(),
        _thinking: true,
      };
      setMessages([...timelineWithUser, thinkingMessage]);

      const selectionPayload =
        thread?.type === "file" ||
        typeof thread?.start_line !== "number" ||
        typeof thread?.end_line !== "number"
          ? undefined
          : {
              start_line: thread.start_line,
              end_line: thread.end_line,
              ...(typeof thread.selected_text === "string" &&
              thread.selected_text.length
                ? { selected_text: thread.selected_text }
                : {}),
            };

      const requestedIntent = classifyIntent(trimmed);

      const aiResponse = await api.analyzeCode({
        thread_id: threadId,
        code: effectiveCode,
        language: effectiveLanguage,
        prompt: trimmed,
        mode: requestedIntent,
        selection: selectionPayload,
        history: historyPayload,
      });

      const intent =
        typeof aiResponse?.intent === "string"
          ? aiResponse.intent
          : requestedIntent;

      const analysis =
        typeof aiResponse?.analysis === "string" ? aiResponse.analysis : "";
      const rawChanges = Array.isArray(aiResponse?.changes)
        ? aiResponse.changes
        : [];
      const cleanedChanges = rawChanges
        .filter(
          (change) =>
            change &&
            typeof change === "object" &&
            Number.isInteger(change.start_line) &&
            Number.isInteger(change.end_line) &&
            change.start_line >= 1 &&
            change.end_line >= change.start_line &&
            typeof change.replacement === "string"
        )
        .map((change) => ({
          start_line: change.start_line,
          end_line: change.end_line,
          replacement: change.replacement,
        }));

      const contextMode =
        typeof aiResponse?.context_mode === "string"
          ? aiResponse.context_mode
          : null;
      const tokenCount =
        typeof aiResponse?.token_count === "number"
          ? aiResponse.token_count
          : null;

      const metadata = {
        intent,
        analysis,
        changes: cleanedChanges,
      };

      if (contextMode) {
        metadata.context_mode = contextMode;
      }
      if (tokenCount !== null) {
        metadata.token_count = tokenCount;
      }

      const aiMessagePayload = {
        role: "ai",
        content: analysis,
        metadata,
      };

      if (contextMode) {
        aiMessagePayload.context_mode = contextMode;
      }
      if (tokenCount !== null) {
        aiMessagePayload.token_count = tokenCount;
      }

      const aiMessageResponse = await api.createMessage(
        threadId,
        aiMessagePayload
      );
      const aiMessage = aiMessageResponse?.message || aiMessageResponse;

      setMessages((prev) =>
        prev.map((message) =>
          message.message_id === (thinkingMessage?.message_id || "")
            ? aiMessage
            : message
        )
      );
      setMessageExtras((prev) => {
        const next = { ...prev };
        if (thinkingMessage?.message_id) {
          delete next[thinkingMessage.message_id];
        }
        next[aiMessage.message_id] = {
          changes: cleanedChanges,
          context_mode: contextMode,
          intent,
        };
        return next;
      });
    } catch (err) {
      if (!userMessageCreated) {
        setMessages((prev) =>
          prev.filter(
            (message) => message.message_id !== tempMessage.message_id
          )
        );
        setUserInput(trimmed);
      } else if (thinkingMessage) {
        setMessages((prev) =>
          prev.filter(
            (message) => message.message_id !== thinkingMessage.message_id
          )
        );
        setMessageExtras((prev) => {
          const next = { ...prev };
          if (thinkingMessage.message_id) {
            delete next[thinkingMessage.message_id];
          }
          return next;
        });
      }

      if (err instanceof APIError && err.statusCode === 401) {
        await handleAuthFailure();
        return;
      }

      const message =
        err instanceof APIError
          ? err.message || "Failed to process AI request."
          : "Failed to process AI request. Please try again.";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [
    threadId,
    userInput,
    sending,
    handleAuthFailure,
    messages,
    effectiveCode,
    effectiveLanguage,
    thread,
  ]);

  const handleTextareaChange = useCallback((event) => {
    setUserInput(event.target.value);
  }, []);

  const handleTextareaKeyDown = useCallback(
    (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleCopyCode = useCallback(
    async (messageId) => {
      const extras = messageExtras[messageId];
      const changes = extras?.changes || [];

      if (changes.length === 0) {
        setError("No suggested code available to copy.");
        return;
      }

      // Combine all replacements into one string
      const combinedCode = changes.map((c) => c.replacement).join("\n\n");

      try {
        if (
          typeof navigator === "undefined" ||
          !navigator.clipboard ||
          !navigator.clipboard.writeText
        ) {
          throw new Error("Clipboard API is not available");
        }
        await navigator.clipboard.writeText(combinedCode);
      } catch {
        setError("Unable to copy to clipboard. Please copy manually.");
      }
    },
    [messageExtras]
  );

  const handleViewDiff = useCallback(
    (messageId) => {
      if (appliedMessageIds.has(messageId)) {
        return;
      }

      const extras = messageExtras[messageId];
      const changes = extras?.changes || [];
      if (changes.length === 0) {
        return;
      }

      // Use the THREAD's original selection range, not the AI's patch ranges
      // This ensures we replace the entire block the user selected
      const threadStart = thread?.start_line;
      const threadEnd = thread?.end_line;

      if (!Number.isInteger(threadStart) || !Number.isInteger(threadEnd)) {
        return;
      }

      const lines = (sessionCode || "").split("\n");
      const safeStart = Math.max(1, threadStart);
      const safeEnd = Math.max(safeStart, Math.min(threadEnd, lines.length));

      // Original snippet is the FULL thread selection that will be replaced
      const originalSnippet = lines.slice(safeStart - 1, safeEnd).join("\n");

      // Build the modified code by applying all AI changes to the thread's range
      // Start with the original lines in the thread's range
      let rangeLines = lines.slice(safeStart - 1, safeEnd);

      // Sort changes by start_line descending to apply from bottom to top
      const changesDescending = [...changes].sort(
        (a, b) => b.start_line - a.start_line
      );

      for (const change of changesDescending) {
        // Convert absolute line numbers to relative (within the thread's range)
        const relativeStart = change.start_line - safeStart;
        const relativeEnd = change.end_line - safeStart;
        
        // Skip changes that are outside the thread's range
        if (relativeStart < 0 || relativeEnd >= rangeLines.length) {
          continue;
        }
        
        const replacementLines = change.replacement.split("\n");

        // Replace the lines within our range
        rangeLines.splice(
          relativeStart,
          relativeEnd - relativeStart + 1,
          ...replacementLines
        );
      }

      const modifiedSnippet = rangeLines.join("\n");

      setDiffState({
        messageId,
        originalCode: originalSnippet,
        modifiedCode: modifiedSnippet,
        language: toMonacoLanguage(sessionLanguage),
        startLine: safeStart,
        endLine: safeEnd,
      });
    },
    [appliedMessageIds, messageExtras, sessionLanguage, sessionCode, thread]
  );

  const handleCloseDiff = useCallback(() => {
    setDiffState(null);
  }, []);

  const handleApplyPatchFromDiff = useCallback(async () => {
    if (
      !diffState?.modifiedCode ||
      !diffState?.startLine ||
      !diffState?.endLine ||
      !onApplyPatch ||
      !threadId
    ) {
      return;
    }

    const { modifiedCode, startLine, endLine, messageId } = diffState;

    try {
      setApplyingPatch(true);
      setError("");

      // Pass a single patch that replaces the entire original range with the complete modified code
      // This avoids issues with applying multiple patches with shifting line numbers
      await onApplyPatch({
        start_line: startLine,
        end_line: endLine,
        replacement: modifiedCode,
      });

      setAppliedMessageIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });

      setDiffState(null);

      const confirmationPayload = {
        role: "ai",
        content:
          "Patch applied successfully. The code has been updated. Feel free to ask for more suggestions if needed.",
        metadata: {
          patch_applied: true,
          applied_from_message_id: messageId,
          changes: [],
          intent: "info",
        },
      };

      try {
        const confirmationResponse = await api.createMessage(
          threadId,
          confirmationPayload
        );
        const confirmationMessage =
          confirmationResponse?.message || confirmationResponse;

        setMessages((prev) => [...prev, confirmationMessage]);
        setMessageExtras((prev) => ({
          ...prev,
          [confirmationMessage.message_id]: {
            changes: [],
            context_mode: null,
            intent: "info",
          },
        }));
      } catch (confirmErr) {
        if (confirmErr instanceof APIError && confirmErr.statusCode === 401) {
          await handleAuthFailure();
          return;
        }
        console.error(
          "[thread-panel] Failed to create confirmation message:",
          confirmErr
        );
      }
    } catch (applyError) {
      const message =
        applyError instanceof APIError
          ? applyError.message || "Failed to apply patch."
          : applyError?.message || "Failed to apply patch.";
      setError(message);
    } finally {
      setApplyingPatch(false);
    }
  }, [diffState, onApplyPatch, threadId, handleAuthFailure]);

  if (!thread) {
    return null;
  }

  const isFileThread = thread.type === "file";
  const threadTitle = isFileThread
    ? "Full File Review"
    : `Lines ${thread.start_line}\u2013${thread.end_line}`;

  const anchorBadge =
    thread.anchor_status === "stable"
      ? { label: "Stable", className: "anchor-badge-stable" }
      : { label: "Approximate", className: "anchor-badge-approximate" };

  const charCount = userInput.length;
  const isOverWarning = charCount > WARNING_THRESHOLD;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;

  return (
    <aside
      className="thread-panel"
      role="complementary"
      aria-label="Thread conversation panel"
    >
      <header className="thread-panel-header">
        <div className="thread-panel-title-group">
          <h2 className="thread-panel-title">{threadTitle}</h2>
          <span className={`anchor-badge ${anchorBadge.className}`}>
            {anchorBadge.label}
          </span>
        </div>
        <button
          type="button"
          className="thread-panel-close"
          onClick={onClose}
          aria-label="Close thread panel"
        >
          ×
        </button>
      </header>

      {error ? (
        <div className="thread-panel-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="thread-panel-messages">
        {loading ? (
          <div className="thread-panel-loading">
            <div className="spinner" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="thread-panel-empty">
            <p className="thread-panel-empty-title">Start the conversation</p>
            <p className="thread-panel-empty-text">
              Ask AI about this code to begin the discussion.
            </p>
          </div>
        ) : (
          <ul className="message-list">
            {messages.map((message) => {
              const extras = messageExtras[message.message_id] || {};
              const changeCount = Array.isArray(extras.changes)
                ? extras.changes.length
                : 0;
              const hasDiff = message.role === "ai" && changeCount > 0;
              const isApplied =
                message.role === "ai" &&
                appliedMessageIds.has(message.message_id);
              const isConfirmation =
                message.role === "ai" &&
                (message.metadata?.patch_applied === true ||
                  message.metadata?.applied_from_message_id);
              const contextMode =
                message.context_mode || extras.context_mode || null;
              const intent =
                extras.intent ||
                message.metadata?.intent ||
                (changeCount > 0 ? "improve" : "explain");

              return (
                <li
                  key={message.message_id}
                  className={`message-item message-${message.role}${
                    isConfirmation ? " message-confirmation" : ""
                  }`}
                >
                  {message._thinking ? (
                    <div className="message-content message-thinking">
                      <div className="spinner" aria-hidden="true" />
                      <span>AI is thinking...</span>
                    </div>
                  ) : (
                    <div className="message-content">
                      {isConfirmation ? (
                        <span className="confirmation-icon" aria-hidden="true">
                          ✓
                        </span>
                      ) : null}
                      {message.content}
                    </div>
                  )}
                  <div className="message-timestamp">
                    {message._thinking
                      ? "Analyzing..."
                      : formatRelativeTime(message.timestamp)}
                    {contextMode === "local" ? (
                      <span className="message-context-badge">
                        Used local context
                      </span>
                    ) : null}
                    {isApplied ? (
                      <span className="message-applied-badge">
                        Patch applied
                      </span>
                    ) : null}
                  </div>
                  {hasDiff ? (
                    <div className="message-actions">
                      <button
                        type="button"
                        className={`btn btn-small ${
                          isApplied ? "btn-disabled" : "btn-primary"
                        }`}
                        onClick={() => handleViewDiff(message.message_id)}
                        disabled={isApplied}
                        title={
                          isApplied
                            ? "This patch has already been applied"
                            : "View suggested changes"
                        }
                      >
                        {isApplied ? "Applied" : "View Diff"}
                      </button>
                      {!isApplied ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => handleCopyCode(message.message_id)}
                        >
                          Copy Code
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="thread-panel-input-area">
        <textarea
          ref={textareaRef}
          className="thread-panel-textarea"
          value={userInput}
          onChange={handleTextareaChange}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Ask AI about this code..."
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={sending}
          aria-label="Message input"
        />
        <div className="thread-panel-input-footer">
          <span
            className={`char-counter${
              isOverWarning ? " char-counter-warning" : ""
            }`}
            aria-live="polite"
          >
            {charCount} / {MAX_MESSAGE_LENGTH}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={handleSendMessage}
            disabled={!userInput.trim() || isOverLimit || sending}
          >
            {sending ? "Analyzing..." : "Send"}
          </button>
        </div>
      </div>
      <DiffModal
        isOpen={Boolean(diffState)}
        onClose={handleCloseDiff}
        onApply={handleApplyPatchFromDiff}
        originalCode={diffState?.originalCode || ""}
        modifiedCode={diffState?.modifiedCode || ""}
        language={
          diffState?.language ||
          toMonacoLanguage(sessionLanguage || "Plain Text")
        }
        startLine={diffState?.startLine}
        endLine={diffState?.endLine}
        isApplying={applyingPatch}
        canApply={
          Boolean(
            diffState?.modifiedCode &&
              diffState?.startLine &&
              diffState?.endLine &&
              onApplyPatch
          ) && !appliedMessageIds.has(diffState?.messageId || "")
        }
      />
    </aside>
  );
}

ThreadPanel.propTypes = {
  thread: PropTypes.shape({
    thread_id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(["block", "file"]).isRequired,
    start_line: PropTypes.number.isRequired,
    end_line: PropTypes.number.isRequired,
    selected_text: PropTypes.string,
    anchor_status: PropTypes.oneOf(["stable", "approximate"]).isRequired,
  }),
  onClose: PropTypes.func.isRequired,
  sessionCode: PropTypes.string,
  sessionLanguage: PropTypes.string,
  onApplyPatch: PropTypes.func,
};

ThreadPanel.defaultProps = {
  sessionCode: "",
  sessionLanguage: "Plain Text",
  onApplyPatch: null,
};

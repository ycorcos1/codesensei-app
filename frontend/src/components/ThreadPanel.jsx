import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";

import { api, APIError } from "../utils/api";
import { useAuth } from "../context/AuthContext";

const MAX_MESSAGE_LENGTH = 5000;
const WARNING_THRESHOLD = 4500;

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

export default function ThreadPanel({ thread, onClose }) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userInput, setUserInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const threadId = thread?.thread_id;

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

    try {
      setSending(true);
      setError("");
      setMessages((prev) => [...prev, tempMessage]);
      setUserInput("");

      const payload = {
        role: "user",
        content: trimmed,
      };

      const response = await api.createMessage(threadId, payload);
      const createdMessage = response?.message || response;

      setMessages((prev) =>
        prev.map((message) =>
          message.message_id === tempMessage.message_id ? createdMessage : message
        )
      );

      const placeholderMessage = {
        message_id: `placeholder-${Date.now()}`,
        role: "ai",
        content:
          "AI is not connected yet. A response will appear here once the AI integration is enabled.",
        timestamp: new Date().toISOString(),
        _placeholder: true,
      };

      setMessages((prev) => [...prev, placeholderMessage]);
    } catch (err) {
      setMessages((prev) =>
        prev.filter((message) => message.message_id !== tempMessage.message_id)
      );
      setUserInput(trimmed);

      if (err instanceof APIError && err.statusCode === 401) {
        await handleAuthFailure();
        return;
      }

      const message =
        err instanceof APIError
          ? err.message || "Failed to send message."
          : "Failed to send message. Please try again.";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [threadId, userInput, sending, handleAuthFailure]);

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
            {messages.map((message) => (
              <li
                key={message.message_id}
                className={`message-item message-${message.role}`}
              >
                <div className="message-content">{message.content}</div>
                <div className="message-timestamp">
                  {formatRelativeTime(message.timestamp)}
                  {message.context_mode === "local" ? (
                    <span className="message-context-badge">Used local context</span>
                  ) : null}
                  {message._placeholder ? (
                    <span className="message-context-badge">Placeholder</span>
                  ) : null}
                </div>
              </li>
            ))}
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
            className={`char-counter${isOverWarning ? " char-counter-warning" : ""}`}
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
            {sending ? "Analyzing..." : "Ask AI"}
          </button>
        </div>
      </div>
    </aside>
  );
}

ThreadPanel.propTypes = {
  thread: PropTypes.shape({
    thread_id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(["block", "file"]).isRequired,
    start_line: PropTypes.number.isRequired,
    end_line: PropTypes.number.isRequired,
    anchor_status: PropTypes.oneOf(["stable", "approximate"]).isRequired,
  }),
  onClose: PropTypes.func.isRequired,
};


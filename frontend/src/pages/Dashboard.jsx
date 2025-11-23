import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import NewSessionModal from "../components/NewSessionModal";
import SessionTable from "../components/SessionTable";
import { APIError, api } from "../utils/api";
import { useAuth } from "../context/AuthContext";

const getSessionId = (session) =>
  session?.session_id ??
  session?.id ??
  session?._id ??
  session?.uuid ??
  session?.pk ??
  null;

const normalizeSessionsResponse = (data) => {
  if (!data) {
    return { sessions: [], cursor: null };
  }

  if (Array.isArray(data)) {
    return { sessions: data, cursor: null };
  }

  if (Array.isArray(data.sessions)) {
    return {
      sessions: data.sessions,
      cursor: data.cursor ?? data.nextCursor ?? null,
    };
  }

  if (Array.isArray(data.items)) {
    return {
      sessions: data.items,
      cursor: data.cursor ?? data.nextCursor ?? null,
    };
  }

  return { sessions: [], cursor: null };
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchSessions = useCallback(
    async ({ cursor: cursorOverride = null, append = false } = {}) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        setError("");
        const response = await api.getSessions(cursorOverride);
        const { sessions: incomingSessions, cursor: nextCursor } =
          normalizeSessionsResponse(response);

        setSessions((prev) => {
          if (!append) {
            return incomingSessions;
          }

          const merged = [...prev];

          incomingSessions.forEach((session) => {
            const sessionIdentifier = getSessionId(session);

            if (!sessionIdentifier) {
              merged.push(session);
              return;
            }

            const existingIndex = merged.findIndex(
              (existing) => getSessionId(existing) === sessionIdentifier
            );

            if (existingIndex >= 0) {
              merged[existingIndex] = session;
            } else {
              merged.push(session);
            }
          });

          return merged;
        });

        setCursor(nextCursor ?? null);
        setHasMore(Boolean(nextCursor));
      } catch (err) {
        // Handle 401 Unauthorized - token expired or invalid
        if (err instanceof APIError && err.statusCode === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        const message =
          err instanceof APIError
            ? err.message || "Unable to load sessions."
            : "Unable to load sessions. Please try again.";
        setError(message);
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [logout, navigate]
  );

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const handleOpenSession = useCallback(
    (session) => {
      const sessionIdentifier = getSessionId(session);

      if (!sessionIdentifier) {
        return;
      }

      navigate(`/editor/${sessionIdentifier}`);
    },
    [navigate]
  );

  const handleRequestDelete = useCallback((session) => {
    setPendingDelete(session);
    setDeleteError("");
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDelete(null);
    setDeleteError("");
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) {
      return;
    }

    const sessionIdentifier = getSessionId(pendingDelete);

    if (!sessionIdentifier) {
      setDeleteError("Unable to determine session identifier.");
      return;
    }

    try {
      setDeleting(true);
      setDeleteError("");
      await api.deleteSession(sessionIdentifier);
      setSessions((prev) =>
        prev.filter((item) => getSessionId(item) !== sessionIdentifier)
      );
      setPendingDelete(null);
    } catch (err) {
      const message =
        err instanceof APIError
          ? err.message || "Failed to delete session."
          : "Failed to delete session. Please try again.";
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  const handleLoadMore = useCallback(() => {
    if (!cursor || loadingMore) {
      return;
    }

    fetchSessions({ cursor, append: true });
  }, [cursor, loadingMore, fetchSessions]);

  const handleSessionCreated = useCallback(() => {
    setShowModal(false);
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="dashboard-page">
      <nav className="dashboard-nav">
        <div className="dashboard-brand">
          <img
            src="/codesensei_logo.png"
            alt="CodeSensei"
            className="dashboard-logo"
          />
        </div>
        <div className="dashboard-nav-actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => navigate("/settings")}
          >
            Settings
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h2>Your Sessions</h2>
            <p className="dashboard-welcome">
              Welcome back, {user?.name || user?.username || "there"}.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
          >
            Create Session
          </button>
        </div>

        {error ? (
          <div className="dashboard-error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <SessionTable
          sessions={sessions}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onOpenSession={handleOpenSession}
          onRequestDelete={handleRequestDelete}
          onCreateSession={() => setShowModal(true)}
        />
      </main>

      {showModal ? (
        <NewSessionModal
          onClose={() => setShowModal(false)}
          onSessionCreated={handleSessionCreated}
        />
      ) : null}

      {pendingDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button
              type="button"
              className="modal-close"
              onClick={handleCancelDelete}
              aria-label="Close modal"
              disabled={deleting}
            >
              ×
            </button>

            <h2 className="modal-title">Delete session</h2>
            <p>
              Delete session{" "}
              <strong>
                {pendingDelete?.filename ||
                  pendingDelete?.name ||
                  "this session"}
              </strong>
              ?<br />
              This will remove the session and all associated threads. This
              action cannot be undone.
            </p>

            {deleteError ? (
              <div className="form-error" role="alert">
                {deleteError}
              </div>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelDelete}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

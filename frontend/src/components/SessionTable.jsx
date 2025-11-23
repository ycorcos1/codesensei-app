import { useMemo } from 'react';

const FALLBACK_LANGUAGE = 'Unknown';

const getSessionIdentifier = (session) =>
  session?.session_id ?? session?.id ?? session?._id ?? session?.uuid ?? session?.pk ?? null;

const resolveLanguage = (session) =>
  session?.language_override ||
  session?.language_detected ||
  session?.language ||
  session?.languageCode ||
  FALLBACK_LANGUAGE;

const resolveTimestamp = (session) => session?.updated_at || session?.updatedAt || session?.created_at || session?.createdAt;

const formatRelativeTime = (timestamp) => {
  if (!timestamp) {
    return '—';
  }

  const parsed = typeof timestamp === 'string' || typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return '—';
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffSec = Math.max(0, Math.round(diffMs / 1000));

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  }

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths}mo ago`;
  }

  const diffYears = Math.round(diffDays / 365);
  return `${diffYears}y ago`;
};

const EmptyState = ({ onCreate }) => (
  <div className="empty-state">
    <div className="empty-state-icon" aria-hidden="true">
      <svg
        width="96"
        height="96"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    </div>
    <h3>No sessions yet</h3>
    <p>Create your first session to start reviewing code with AI.</p>
    <button type="button" className="btn btn-primary" onClick={onCreate}>
      Create Session
    </button>
  </div>
);

function SessionTable({
  sessions,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onOpenSession,
  onRequestDelete,
  onCreateSession,
}) {
  const content = useMemo(() => {
    if (loading && sessions.length === 0) {
      return (
        <tbody>
          {Array.from({ length: 5 }).map((_, index) => (
            <tr key={`skeleton-${index}`} className="skeleton-table-row">
              <td colSpan={4}>
                <div className="skeleton-cell" />
              </td>
            </tr>
          ))}
        </tbody>
      );
    }

    if (!loading && sessions.length === 0) {
      return null;
    }

    return (
      <tbody>
        {sessions.map((session, index) => {
          const filename = session?.filename || session?.name || session?.title || 'Untitled Session';
          const sessionId = getSessionIdentifier(session) ?? `${filename}-${index}`;
          const language = resolveLanguage(session);
          const displayTimestamp = formatRelativeTime(resolveTimestamp(session));

          const handleOpen = () => {
            onOpenSession?.(session);
          };

          const handleDelete = () => {
            onRequestDelete?.(session);
          };

          return (
            <tr key={sessionId}>
              <td>
                <button
                  type="button"
                  className="session-name"
                  onClick={handleOpen}
                  aria-label={`Open session ${filename}`}
                >
                  {filename}
                </button>
              </td>
              <td>{displayTimestamp}</td>
              <td>
                <span className="language-badge">{language}</span>
              </td>
              <td>
                <div className="session-actions">
                  <button type="button" className="btn btn-secondary btn-small" onClick={handleOpen}>
                    Open
                  </button>
                  <button type="button" className="btn btn-secondary btn-small" onClick={handleDelete}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    );
  }, [loading, sessions, onRequestDelete, onOpenSession]);

  if (!loading && sessions.length === 0) {
    return <EmptyState onCreate={onCreateSession} />;
  }

  return (
    <div className="session-table-wrapper">
      <table className="session-table">
        <thead>
          <tr>
            <th scope="col">Session Name</th>
            <th scope="col">Last Updated</th>
            <th scope="col">Language</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        {content}
      </table>

      {hasMore && (
        <div className="pagination">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

export default SessionTable;


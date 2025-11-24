import PropTypes from "prop-types";
import { memo } from "react";

function ThreadSidebar({
  threads,
  loading,
  onThreadSelect,
  selectedThreadId,
  onNewThread,
  hasSelection,
  creatingThread,
}) {
  return (
    <aside className="thread-sidebar" aria-label="Thread list">
      <div className="thread-sidebar-header">
        <div>
          <h2 className="thread-sidebar-title">Threads</h2>
          <p className="thread-sidebar-subtitle">
            {threads.length} {threads.length === 1 ? "thread" : "threads"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={onNewThread}
          disabled={!hasSelection || creatingThread || loading}
        >
          {creatingThread ? "Creating..." : "Ask AI"}
        </button>
      </div>

      {loading ? (
        <div className="thread-sidebar-loading">
          <div className="thread-skeleton-row" />
          <div className="thread-skeleton-row" />
          <div className="thread-skeleton-row" />
        </div>
      ) : threads.length === 0 ? (
        <div className="thread-sidebar-empty">
          <div className="thread-sidebar-empty-icon" aria-hidden="true">
            💬
          </div>
          <p className="thread-sidebar-empty-title">No conversations yet</p>
          <p className="thread-sidebar-empty-text">
            Select code in the editor and click &ldquo;Ask AI&rdquo; to start a
            thread.
          </p>
        </div>
      ) : (
        <ul className="thread-list">
          {threads.map((thread) => {
            const isSelected = thread.thread_id === selectedThreadId;
            const isFileThread = thread.type === "file";
            const lineLabel = isFileThread
              ? "Full file"
              : `Lines ${thread.start_line}\u2013${thread.end_line}`;

            const preview = thread.selected_text
              ? thread.selected_text.trim()
              : "";
            const previewDisplay =
              preview.length > 0 ? preview : "(No selection captured)";

            const anchorStatus =
              thread.anchor_status === "stable"
                ? {
                    label: "Anchor stable",
                    className: "thread-anchor-stable",
                  }
                : {
                    label: "Position approximate",
                    className: "thread-anchor-approximate",
                  };

            return (
              <li key={thread.thread_id}>
                <button
                  type="button"
                  className={`thread-item${isSelected ? " selected" : ""}`}
                  onClick={() => onThreadSelect(thread.thread_id)}
                >
                  <div className="thread-item-header">
                    <span
                      className={`thread-type-badge ${
                        isFileThread ? "thread-type-file" : "thread-type-block"
                      }`}
                    >
                      {isFileThread ? "File" : "Block"}
                    </span>
                    <span className="thread-line-range">{lineLabel}</span>
                  </div>
                  <p className="thread-preview" title={previewDisplay}>
                    {previewDisplay}
                  </p>
                  <div className={`thread-anchor-status ${anchorStatus.className}`}>
                    <span aria-hidden="true">●</span>
                    <span>{anchorStatus.label}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

ThreadSidebar.propTypes = {
  threads: PropTypes.arrayOf(
    PropTypes.shape({
      thread_id: PropTypes.string.isRequired,
      type: PropTypes.oneOf(["block", "file"]).isRequired,
      start_line: PropTypes.number.isRequired,
      end_line: PropTypes.number.isRequired,
      selected_text: PropTypes.string,
      anchor_status: PropTypes.oneOf(["stable", "approximate"]).isRequired,
    })
  ).isRequired,
  loading: PropTypes.bool,
  onThreadSelect: PropTypes.func.isRequired,
  selectedThreadId: PropTypes.string,
  onNewThread: PropTypes.func.isRequired,
  hasSelection: PropTypes.bool.isRequired,
  creatingThread: PropTypes.bool,
};

ThreadSidebar.defaultProps = {
  loading: false,
  selectedThreadId: null,
  creatingThread: false,
};

export default memo(ThreadSidebar);


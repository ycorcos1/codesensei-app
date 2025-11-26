import { useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import { DiffEditor } from "@monaco-editor/react";

export default function DiffModal({
  isOpen,
  onClose,
  onApply,
  originalCode,
  modifiedCode,
  language,
  startLine,
  endLine,
  isApplying,
  canApply,
}) {
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, isOpen]
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const headingSuffix =
    typeof startLine === "number" && typeof endLine === "number"
      ? ` (Lines ${startLine}\u2013${endLine})`
      : "";

  const overlayStyle = {
    display: isOpen ? "flex" : "none",
  };

  return (
    <div
      className="diff-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-hidden={!isOpen}
      aria-label="Review code changes"
      onClick={handleOverlayClick}
      style={overlayStyle}
    >
      <div className="diff-modal-card">
        <header className="diff-modal-header">
          <h2 className="diff-modal-title">Review Changes{headingSuffix}</h2>
          <button
            type="button"
            className="diff-modal-close"
            onClick={onClose}
            aria-label="Close diff modal"
            tabIndex={isOpen ? 0 : -1}
          >
            ×
          </button>
        </header>
        <div className="diff-modal-body">
          {originalCode || modifiedCode ? (
            <DiffEditor
              original={originalCode}
              modified={modifiedCode}
              language={language}
              theme="vs-dark"
              options={{
                renderSideBySide: true,
                readOnly: true,
                automaticLayout: true,
                wordWrap: "on",
                minimap: { enabled: false },
              }}
              height="100%"
            />
          ) : null}
        </div>
        <footer className="diff-modal-footer">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onClose}
            disabled={isApplying}
            tabIndex={isOpen ? 0 : -1}
          >
            Cancel
          </button>
          {canApply ? (
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={onApply}
              disabled={isApplying}
              tabIndex={isOpen ? 0 : -1}
            >
              {isApplying ? "Applying..." : "Apply Patch"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

DiffModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
  originalCode: PropTypes.string.isRequired,
  modifiedCode: PropTypes.string.isRequired,
  language: PropTypes.string,
  startLine: PropTypes.number,
  endLine: PropTypes.number,
  isApplying: PropTypes.bool,
  canApply: PropTypes.bool,
};

DiffModal.defaultProps = {
  language: "plaintext",
  startLine: undefined,
  endLine: undefined,
  isApplying: false,
  canApply: true,
};

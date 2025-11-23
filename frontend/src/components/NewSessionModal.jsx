import { useCallback, useMemo, useState } from 'react';

import { APIError, api } from '../utils/api';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const LANGUAGE_OPTIONS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'Go',
  'Rust',
  'C++',
  'C#',
  'PHP',
  'Ruby',
  'HTML',
  'CSS',
  'SQL',
  'JSON',
  'YAML',
  'Markdown',
];

const languageByExtension = {
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  py: 'Python',
  java: 'Java',
  go: 'Go',
  rs: 'Rust',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  c: 'C',
  h: 'C',
  cs: 'C#',
  php: 'PHP',
  rb: 'Ruby',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'CSS',
  less: 'CSS',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  txt: 'Plain Text',
  sh: 'Shell',
  bash: 'Shell',
};

const detectLanguage = (filename) => {
  if (!filename) {
    return null;
  }

  const match = filename.toLowerCase().split('.').pop();
  if (!match) {
    return null;
  }

  return languageByExtension[match] || null;
};

const readFileContent = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });

function NewSessionModal({ onClose, onSessionCreated }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [languageInput, setLanguageInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(
    () => Boolean(selectedFile || (nameInput.trim() && languageInput)),
    [selectedFile, nameInput, languageInput],
  );

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setFileError('');
    setDragActive(false);
    setNameInput('');
    setLanguageInput('');
    setError('');
    setSubmitting(false);
  }, []);

  const closeModal = useCallback(() => {
    resetState();
    onClose?.();
  }, [onClose, resetState]);

  const handleFileSelection = useCallback(async (file) => {
    if (!file) {
      return;
    }

    setFileError('');

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setSelectedFile(null);
      setFileError('File too large. Maximum size is 5MB.');
      return;
    }

    try {
      const content = await readFileContent(file);
      const inferredLanguage = detectLanguage(file.name);

      setSelectedFile({
        name: file.name,
        size: file.size,
        content,
        language: inferredLanguage,
      });
      setFileError('');
    } catch (err) {
      setSelectedFile(null);
      setFileError(err?.message || 'Failed to read file. Please try again.');
    }
  }, []);

  const handleFileInputChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (event.target) {
        event.target.value = '';
      }

      await handleFileSelection(file);
    },
    [handleFileSelection],
  );

  const handleDrop = useCallback(
    async (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      const file = event.dataTransfer?.files?.[0];
      await handleFileSelection(file);
    },
    [handleFileSelection],
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!canSubmit) {
        return;
      }

      setSubmitting(true);
      setError('');

      try {
        let payload;

        if (selectedFile) {
          payload = {
            filename: selectedFile.name,
            code_content: selectedFile.content,
            language_detected: selectedFile.language || undefined,
          };
        } else {
          payload = {
            filename: nameInput.trim(),
            code_content: '',
            language_override: languageInput,
            language_detected: languageInput,
          };
        }

        const response = await api.createSession(payload);
        const session =
          response?.session || response?.data?.session || response?.data || response;

        onSessionCreated?.(session);
        resetState();
        onClose?.();
      } catch (err) {
        if (err instanceof APIError) {
          setError(err.message || 'Failed to create session.');
        } else {
          setError('Failed to create session. Please try again.');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, selectedFile, nameInput, languageInput, onSessionCreated, onClose, resetState],
  );

  const clearFileSelection = useCallback(() => {
    setSelectedFile(null);
    setFileError('');
  }, []);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button
          type="button"
          className="modal-close"
          onClick={closeModal}
          aria-label="Close modal"
          disabled={submitting}
        >
          ×
        </button>

        <h2 className="modal-title">Create New Session</h2>

        <form onSubmit={handleSubmit} className="new-session-form">
          <div
            className={`upload-zone ${dragActive ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
          >
            <div className="upload-zone-icon" aria-hidden="true">
              ⬆️
            </div>
            <div className="upload-zone-text">Drag a file here or click to browse</div>
            <div className="upload-zone-hint">Max 5MB per file</div>
            <input
              type="file"
              accept=".js,.ts,.tsx,.jsx,.py,.java,.go,.rs,.cpp,.cc,.cxx,.c,.h,.cs,.php,.rb,.html,.htm,.css,.scss,.less,.sql,.json,.yaml,.yml,.md,.markdown,.txt,.sh"
              className="upload-input"
              onChange={handleFileInputChange}
              disabled={submitting}
            />

            {selectedFile ? (
              <div className="selected-file">
                <div className="selected-file-name">{selectedFile.name}</div>
                <div className="selected-file-meta">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                  {selectedFile.language ? ` • ${selectedFile.language}` : null}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={clearFileSelection}
                  disabled={submitting}
                >
                  Choose another file
                </button>
              </div>
            ) : null}

            {fileError ? <div className="upload-error">{fileError}</div> : null}
          </div>

          <div className="or-divider">OR</div>

          <div className="form-field">
            <label htmlFor="session-name">Session name</label>
            <input
              id="session-name"
              type="text"
              placeholder="e.g., auth-service.js"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="session-language">Language</label>
            <select
              id="session-language"
              value={languageInput}
              onChange={(event) => setLanguageInput(event.target.value)}
              disabled={submitting}
            >
              <option value="">Select language</option>
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeModal}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit || submitting}>
              {submitting ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewSessionModal;


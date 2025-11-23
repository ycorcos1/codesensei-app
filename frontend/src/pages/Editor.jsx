import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';

import { api, APIError } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const LANGUAGE_OPTIONS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'Go',
  'Rust',
  'C++',
  'C',
  'C#',
  'PHP',
  'Ruby',
  'HTML',
  'CSS',
  'SQL',
  'JSON',
  'YAML',
  'Markdown',
  'Shell',
  'Plain Text',
];

const DEFAULT_LANGUAGE = 'Plain Text';

const LANGUAGE_TO_MONACO = {
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  Python: 'python',
  Java: 'java',
  Go: 'go',
  Rust: 'rust',
  'C++': 'cpp',
  C: 'c',
  'C#': 'csharp',
  PHP: 'php',
  Ruby: 'ruby',
  HTML: 'html',
  CSS: 'css',
  SQL: 'sql',
  JSON: 'json',
  YAML: 'yaml',
  Markdown: 'markdown',
  Shell: 'shell',
  'Plain Text': 'plaintext',
};

function normalizeLanguageName(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return DEFAULT_LANGUAGE;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return DEFAULT_LANGUAGE;
  }

  const matchedOption = LANGUAGE_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  );

  return matchedOption || DEFAULT_LANGUAGE;
}

function getMonacoLanguage(languageName) {
  const normalized = normalizeLanguageName(languageName);
  return LANGUAGE_TO_MONACO[normalized] || 'plaintext';
}

export default function EditorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const leaveActionRef = useRef(null);
  const editorUrlRef = useRef(window.location.href);

  const [session, setSession] = useState(null);
  const [code, setCode] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState('');
  const [nameDirty, setNameDirty] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(DEFAULT_LANGUAGE);
  const [languageSaving, setLanguageSaving] = useState(false);

  const normalizeSessionResponse = useCallback(
    (payload) => payload?.session ?? payload ?? null,
    [],
  );

  const derivedLanguage = useMemo(() => {
    return getMonacoLanguage(selectedLanguage);
  }, [selectedLanguage]);

  const hasPendingChanges = useMemo(
    () => Boolean(isDirty || nameDirty),
    [isDirty, nameDirty],
  );

  useEffect(() => {
    async function fetchSession() {
      if (!sessionId) {
        setError('Session ID missing.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await api.getSession(sessionId);
        const fetchedSession = normalizeSessionResponse(response);
        const initialCode = fetchedSession?.code_content ?? '';

        setSession(fetchedSession);
        setSessionName(fetchedSession?.filename || '');
        setCode(initialCode);
        setLastSavedContent(initialCode);
        setIsDirty(false);
        setNameDirty(false);
      } catch (err) {
        if (err instanceof APIError && err.statusCode === 401) {
          await logout();
          navigate('/login', { replace: true });
          return;
        }
        if (err instanceof APIError && err.statusCode === 404) {
          setError('Session not found.');
        } else {
          const message =
            err instanceof APIError
              ? err.message || 'Failed to load session.'
              : 'Failed to load session. Please try again.';
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [sessionId, logout, navigate, normalizeSessionResponse]);

  useEffect(() => {
    if (!session) {
      setSelectedLanguage(DEFAULT_LANGUAGE);
      return;
    }

    const sessionLanguage =
      session.language_override || session.language_detected;

    setSelectedLanguage(normalizeLanguageName(sessionLanguage));
  }, [session]);

  const handleSave = useCallback(async () => {
    if (!sessionId || !session || saving) {
      return;
    }

    if (!session.version_number) {
      setError(
        'Unable to save changes because the session metadata is out of sync. Please reload the page and try again.',
      );
      return;
    }

    const currentCode = editorRef.current?.getValue() ?? code;

    try {
      setSaving(true);
      setError('');

      const payload = {
        code_content: currentCode,
        expected_version_number: session.version_number,
      };

      const response = await api.updateSession(sessionId, payload);
      const updatedSession = normalizeSessionResponse(response);

      setSession((prev) => ({
        ...(prev || {}),
        ...(updatedSession || {}),
        code_content: currentCode,
      }));
      setCode(currentCode);
      setLastSavedContent(currentCode);
      setIsDirty(false);
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 401) {
        await logout();
        navigate('/login', { replace: true });
        return;
      }
      if (err instanceof APIError && err.statusCode === 409) {
        setError(
          'Version conflict detected. Reload the session to see the latest changes.',
        );
      } else {
        const message =
          err instanceof APIError
            ? err.message || 'Failed to save session.'
            : 'Failed to save session. Please try again.';
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }, [sessionId, session, saving, code, logout, navigate, normalizeSessionResponse]);

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleEditorDidMount = useCallback((editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
  }, []);

  const handleEditorChange = useCallback(
    (nextValue) => {
      const normalizedValue = nextValue ?? '';
      setCode(normalizedValue);
      setIsDirty(normalizedValue !== lastSavedContent);
    },
    [lastSavedContent],
  );

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasPendingChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingChanges]);

  useEffect(() => {
    const handlePopState = (event) => {
      if (!hasPendingChanges) {
        return;
      }
      event.preventDefault();
      window.history.pushState(null, '', editorUrlRef.current);
      leaveActionRef.current = () => navigate(-1);
      setShowLeaveModal(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasPendingChanges, navigate]);

  const requestNavigation = useCallback(
    (action) => {
      if (hasPendingChanges) {
        leaveActionRef.current = action;
        setShowLeaveModal(true);
      } else {
        action();
      }
    },
    [hasPendingChanges],
  );

  const handleLanguageChange = useCallback(
    async (event) => {
      const nextLanguage = normalizeLanguageName(event.target.value);
      const previousLanguage =
        normalizeLanguageName(selectedLanguage) || DEFAULT_LANGUAGE;

      setSelectedLanguage(nextLanguage);

      if (!sessionId || !session) {
        return;
      }

      if (!session.version_number) {
        setError(
          'Unable to update the language because the session metadata is out of sync. Please reload and try again.',
        );
        setSelectedLanguage(previousLanguage);
        return;
      }

      const currentSessionLanguage = normalizeLanguageName(
        session.language_override || session.language_detected,
      );

      if (nextLanguage === currentSessionLanguage) {
        return;
      }

      try {
        setLanguageSaving(true);
        setError('');

        const payload = {
          language_override: nextLanguage,
          expected_version_number: session.version_number,
        };

        const response = await api.updateSession(sessionId, payload);
        const updatedSession = normalizeSessionResponse(response);

        setSession((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            ...(updatedSession || {}),
            language_override: nextLanguage,
          };
        });
      } catch (err) {
        setSelectedLanguage(previousLanguage);
        const message =
          err instanceof APIError
            ? err.message || 'Failed to update language.'
            : 'Failed to update language. Please try again.';
        setError(message);
      } finally {
        setLanguageSaving(false);
      }
    },
    [sessionId, session, selectedLanguage, normalizeSessionResponse],
  );

  useEffect(() => {
    const monaco = monacoRef.current;
    const editorInstance = editorRef.current;

    if (!monaco || !editorInstance) {
      return;
    }

    const model = editorInstance.getModel();
    if (!model) {
      return;
    }

    const targetLanguage = getMonacoLanguage(selectedLanguage);
    const currentLanguage = model.getLanguageId();

    if (currentLanguage !== targetLanguage) {
      monaco.editor.setModelLanguage(model, targetLanguage);
    }
  }, [selectedLanguage]);

  const handleStayOnPage = useCallback(() => {
    leaveActionRef.current = null;
    setShowLeaveModal(false);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    setShowLeaveModal(false);
    setIsDirty(false);
    setNameDirty(false);
    const pendingAction = leaveActionRef.current;
    leaveActionRef.current = null;
    if (pendingAction) {
      pendingAction();
    }
  }, []);

  const handleNavigateToDashboard = useCallback(() => {
    requestNavigation(() => navigate('/dashboard'));
  }, [navigate, requestNavigation]);

  const handleNameChange = useCallback((event) => {
    setSessionName(event.target.value);
    setNameDirty(true);
    setError('');
  }, []);

  const handleNameCommit = useCallback(async () => {
    if (!sessionId || !session) {
      return;
    }

    const trimmed = sessionName.trim();
    const currentFilename = session.filename || '';

    if (!trimmed) {
      setSessionName(currentFilename || '');
      setNameDirty(false);
      setError('Session name cannot be empty.');
      return;
    }

    if (trimmed === currentFilename) {
      setSessionName(currentFilename);
      setNameDirty(false);
      return;
    }

    try {
      setNameSaving(true);
      const response = await api.updateSessionMetadata(sessionId, {
        filename: trimmed,
      });
      const updatedMetadata = normalizeSessionResponse(response);

      setSession((prev) => ({
        ...(prev || {}),
        ...(updatedMetadata || {}),
        filename: trimmed,
      }));
      setSessionName(trimmed);
    } catch (err) {
      const message =
        err instanceof APIError
          ? err.message || 'Failed to rename session.'
          : 'Failed to rename session. Please try again.';
      setError(message);
      setSessionName(currentFilename);
    } finally {
      setNameSaving(false);
      setNameDirty(false);
    }
  }, [sessionId, session, sessionName, normalizeSessionResponse]);

  const handleNameBlur = useCallback(() => {
    void handleNameCommit();
  }, [handleNameCommit]);

  const handleNameKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSessionName(session?.filename || '');
        setNameDirty(false);
      }
    },
    [session],
  );

  if (loading) {
    return (
      <div className="loading-page">
        <div className="loading-indicator">
          <div className="spinner" />
          <p>Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="loading-page">
        <div className="error-state">
          <p className="error-message">{error || 'Session not available.'}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNavigateToDashboard}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <nav className="editor-nav">
        <div className="editor-nav-left">
          <img
            src="/codesensei_logo.png"
            alt="CodeSensei"
            className="editor-logo"
          />
          <div className="editor-filename">
            {hasPendingChanges ? (
              <span className="unsaved-indicator" title="Unsaved changes">
                &#x25cf;
              </span>
            ) : null}
            <input
              className="editor-filename-input"
              value={sessionName}
              placeholder="Untitled"
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              disabled={nameSaving}
              aria-label="Session name"
            />
          </div>
        </div>
        <div className="editor-nav-right">
          <div className="language-picker">
            <label htmlFor="editor-language-select" className="sr-only">
              Select programming language
            </label>
            <select
              id="editor-language-select"
              className="language-dropdown"
              value={selectedLanguage}
              onChange={handleLanguageChange}
              disabled={languageSaving || saving || loading}
              aria-label="Programming language selector"
            >
              {LANGUAGE_OPTIONS.map((languageOption) => (
                <option key={languageOption} value={languageOption}>
                  {languageOption}
                </option>
              ))}
            </select>
            {languageSaving ? (
              <span className="language-saving-indicator" aria-live="polite">
                Saving...
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={`btn btn-small ${
              isDirty ? 'btn-primary' : 'btn-secondary'
            }`}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleNavigateToDashboard}
          >
            Dashboard
          </button>
        </div>
      </nav>

      {error ? (
        <div className="editor-error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <div className="editor-workspace">
        <div className="editor-container">
          <Editor
            height="100%"
            language={derivedLanguage}
            theme="vs-dark"
            value={code}
            onMount={handleEditorDidMount}
            onChange={handleEditorChange}
            options={{
              fontSize: 14,
              lineNumbers: 'on',
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              smoothScrolling: true,
            }}
          />
        </div>
        <aside className="thread-panel-placeholder">
          <p className="placeholder-text">Thread panel coming soon...</p>
        </aside>
      </div>

      {showLeaveModal ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button
              type="button"
              className="modal-close"
              onClick={handleStayOnPage}
              aria-label="Close modal"
            >
              ×
            </button>
            <h2 className="modal-title">Leave without saving?</h2>
            <p>
              You have unsaved changes in this session. Leaving now will discard them.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleStayOnPage}
              >
                Stay on page
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmLeave}
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


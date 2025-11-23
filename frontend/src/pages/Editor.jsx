import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';

import { api, APIError } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function EditorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const editorRef = useRef(null);

  const [session, setSession] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState('');

  const derivedLanguage = useMemo(() => {
    if (!session) {
      return 'plaintext';
    }
    return (
      session.language_override ||
      session.language_detected ||
      'plaintext'
    );
  }, [session]);

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
        const data = await api.getSession(sessionId);
        const initialCode = data?.code_content ?? '';

        setSession(data);
        setCode(initialCode);
        setLastSavedContent(initialCode);
        setIsDirty(false);
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
  }, [sessionId, logout, navigate]);

  const handleSave = useCallback(async () => {
    if (!session || saving) {
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

      const updatedSession = await api.updateSession(sessionId, payload);
      const nextCode = updatedSession?.code_content ?? currentCode;

      setSession(updatedSession);
      setCode(nextCode);
      setLastSavedContent(nextCode);
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
  }, [session, saving, sessionId, logout, navigate, code]);

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

  const handleEditorDidMount = useCallback((editorInstance) => {
    editorRef.current = editorInstance;
  }, []);

  const handleEditorChange = useCallback(
    (nextValue) => {
      const normalizedValue = nextValue ?? '';
      setCode(normalizedValue);
      setIsDirty(normalizedValue !== lastSavedContent);
    },
    [lastSavedContent],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleNavigateToDashboard = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  const handleNavigateToSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

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
            <span className="filename-text">{session.filename || 'Untitled'}</span>
            {isDirty ? (
              <span className="unsaved-indicator" title="Unsaved changes">
                &#x25cf;
              </span>
            ) : null}
          </div>
        </div>
        <div className="editor-nav-right">
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
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleNavigateToSettings}
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
    </div>
  );
}


import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dashboard-page">
      <nav className="dashboard-nav">
        <div className="dashboard-brand">
          <img 
            src="/codesensei-logo.png" 
            alt="CodeSensei" 
            className="dashboard-logo"
          />
          <span className="dashboard-subtitle">Inline AI code review sessions</span>
        </div>
        <div className="dashboard-nav-actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => {}}
            disabled
          >
            Settings
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <main className="dashboard-content">
        <h2>Settings</h2>
        <p>Settings page will be implemented in Task 22.</p>
      </main>
    </div>
  );
}


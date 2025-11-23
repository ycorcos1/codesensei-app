import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="dashboard-page">
      <nav className="dashboard-nav">
        <h1>CodeSensei Dashboard</h1>
        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
          Logout
        </button>
      </nav>

      <main className="dashboard-content">
        <h2>Welcome, {user?.name || user?.username}!</h2>
        <p>
          The dashboard experience will be implemented in Task 9. For now, use this space to
          confirm authentication is working end-to-end.
        </p>
      </main>
    </div>
  );
}


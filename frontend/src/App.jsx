import HealthCheck from './components/HealthCheck'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <img
          src="/codesensei-logo.png"
          alt="CodeSensei Logo"
          className="logo"
        />
        <h1 className="title">CodeSensei</h1>
        <p className="subtitle">
          AI-Powered Inline Code Review. Faster. Smarter. Precise.
        </p>
      </header>

      <main className="app-main">
        <HealthCheck />
      </main>

      <footer className="app-footer">
        <p>© 2025 CodeSensei. Built with React + AWS.</p>
      </footer>
    </div>
  )
}

export default App

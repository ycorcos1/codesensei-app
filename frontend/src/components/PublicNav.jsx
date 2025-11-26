import { Link } from "react-router-dom";

function PublicNav({ className = "" }) {
  return (
    <nav
      className={["landing-nav", className].filter(Boolean).join(" ")}
      aria-label="Primary navigation"
    >
      <Link to="/" className="landing-brand">
        <img
          src="/codesensei_logo.png"
          alt="CodeSensei logo"
          className="landing-logo"
        />
      </Link>
      <div className="landing-nav-links">
        <Link to="/login" className="btn btn-secondary btn-small">
          Login
        </Link>
        <Link to="/signup" className="btn btn-primary btn-small">
          Get Started
        </Link>
      </div>
    </nav>
  );
}

export default PublicNav;


import { Link } from "react-router-dom";
import PublicNav from "../components/PublicNav";

const InlineThreadsIcon = () => (
  <svg
    className="landing-feature-svg"
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4.5 5.5h11a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H11l-4 3v-3H4.5a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3Z" />
    <circle cx="9" cy="10.5" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="13" cy="10.5" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="17" cy="10.5" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

const AIPatchesIcon = () => (
  <svg
    className="landing-feature-svg"
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
  >
    <path
      d="M13 2 6 12h5l-1.5 10L18 12h-5L13 2Z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);

const SmartLanguageIcon = () => (
  <svg
    className="landing-feature-svg"
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 4 9 14 14 0 0 1-4 9" />
    <path d="M12 3c-2.6 2.3-4 5.6-4 9s1.4 6.7 4 9" />
    <path d="M7.5 9h3.5" />
    <path d="M13.5 15h3" />
  </svg>
);

function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <PublicNav />
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="hero-heading">
          <img
            src="/codesensei_logo.png"
            alt=""
            aria-hidden="true"
            className="landing-hero-logo"
          />
          <h1 id="hero-heading" className="landing-hero-title">
            AI-Powered Inline Code Review.
            <br />
            Faster. Smarter. Precise.
          </h1>
          <p className="landing-hero-subtitle">
            Upload or write code, highlight specific blocks, and engage in
            inline AI conversations tied directly to your selection. Get
            contextual analysis, improvement suggestions, and one-click
            patches—all inside a Monaco-powered coding experience.
          </p>
          <div className="landing-hero-cta">
            <Link to="/signup" className="btn btn-primary btn-large">
              Get Started
            </Link>
            <Link to="/about" className="landing-hero-secondary-link">
              About CodeSensei →
            </Link>
          </div>
        </section>

        <section
          className="landing-features"
          aria-labelledby="features-heading"
        >
          <h2 id="features-heading" className="sr-only">
            Key features
          </h2>
          <div className="landing-features-grid">
            <article className="landing-feature-card">
              <div className="landing-feature-icon" aria-hidden="true">
                <InlineThreadsIcon />
              </div>
              <h3 className="landing-feature-title">Inline Threads</h3>
              <p className="landing-feature-description">
                Start AI conversations tied to a selected block or the entire
                file. Multiple threads per file, each with its own context and
                history.
              </p>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon" aria-hidden="true">
                <AIPatchesIcon />
              </div>
              <h3 className="landing-feature-title">AI Patches</h3>
              <p className="landing-feature-description">
                Get contextual code suggestions with diff view. Apply
                improvements with one click—changes save automatically so
                nothing is lost.
              </p>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon" aria-hidden="true">
                <SmartLanguageIcon />
              </div>
              <h3 className="landing-feature-title">
                Smart Language Detection
              </h3>
              <p className="landing-feature-description">
                CodeSensei auto-detects languages from filenames and content so
                Monaco highlighting and AI prompts stay accurate without extra
                setup.
              </p>
            </article>
          </div>
        </section>

        <section
          className="landing-final-cta"
          aria-labelledby="final-cta-heading"
        >
          <h2 id="final-cta-heading" className="landing-final-cta-title">
            Ready to level up your code review?
          </h2>
          <p className="landing-final-cta-subtitle">
            Join developers using AI-powered inline review to ship better code,
            faster.
          </p>
          <Link to="/signup" className="btn btn-primary btn-large">
            Start Reviewing Code with AI
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <p>
          Built by Yahav Corcos ·{" "}
          <Link to="/about" className="landing-footer-link">
            Learn More
          </Link>
        </p>
      </footer>
    </div>
  );
}

export default Landing;

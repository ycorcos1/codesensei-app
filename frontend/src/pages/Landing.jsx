import { Link } from "react-router-dom";

function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <nav className="landing-nav" aria-label="Primary navigation">
          <Link to="/" className="landing-brand">
            <img
              src="/codesensei_logo.png"
              alt="CodeSensei logo"
              className="landing-logo"
            />
          </Link>
          <div className="landing-nav-links">
            <Link to="/about" className="landing-nav-link">
              About
            </Link>
            <Link to="/login" className="btn btn-secondary btn-small">
              Login
            </Link>
            <Link to="/signup" className="btn btn-primary btn-small">
              Get Started
            </Link>
          </div>
        </nav>
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
            Upload or write code, highlight specific blocks, and engage in inline AI
            conversations tied directly to your selection. Get contextual analysis,
            improvement suggestions, and one-click patches—all inside a Monaco-powered
            coding experience.
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

        <section className="landing-features" aria-labelledby="features-heading">
          <h2 id="features-heading" className="sr-only">
            Key features
          </h2>
          <div className="landing-features-grid">
            <article className="landing-feature-card">
              <div className="landing-feature-icon" aria-hidden="true">
                💬
              </div>
              <h3 className="landing-feature-title">Inline Threads</h3>
              <p className="landing-feature-description">
                Start AI conversations tied to a selected block or the entire file.
                Multiple threads per file, each with its own context and history.
              </p>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon" aria-hidden="true">
                ⚡
              </div>
              <h3 className="landing-feature-title">AI Patches</h3>
              <p className="landing-feature-description">
                Get contextual code suggestions with diff view. Apply improvements with
                one click—changes save automatically so nothing is lost.
              </p>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon" aria-hidden="true">
                🎯
              </div>
              <h3 className="landing-feature-title">Smart Anchoring</h3>
              <p className="landing-feature-description">
                Conversations follow your code as it changes. CodeSensei tracks anchors
                and highlights when context drifts so you stay aligned.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-final-cta" aria-labelledby="final-cta-heading">
          <h2 id="final-cta-heading" className="landing-final-cta-title">
            Ready to level up your code review?
          </h2>
          <p className="landing-final-cta-subtitle">
            Join developers using AI-powered inline review to ship better code, faster.
          </p>
          <Link to="/signup" className="btn btn-primary btn-large">
            Start Reviewing Code with AI
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <p>
          Built with ❤️ by Yahav Corcos ·{" "}
          <Link to="/about" className="landing-footer-link">
            Learn More
          </Link>
        </p>
      </footer>
    </div>
  );
}

export default Landing;


import { Link } from "react-router-dom";
import PublicNav from "../components/PublicNav";

function About() {
  return (
    <div className="about-page">
      <header className="landing-header">
        <PublicNav />
      </header>

      <header className="about-hero">
        <img
          src="/codesensei_logo.png"
          alt="CodeSensei"
          className="about-hero-logo"
        />
        <h1 className="about-hero-title">About CodeSensei</h1>
        <p className="about-hero-subtitle">
          AI-powered inline code review that lives directly inside your
          workflow—faster, smarter, and laser-focused on the code you care
          about.
        </p>
      </header>

      <main className="about-content">
        <section className="about-section" aria-labelledby="about-what">
          <h2 id="about-what">What is CodeSensei?</h2>
          <p>
            CodeSensei is a production-grade AI code review workspace that lets
            you upload or write code, highlight specific blocks—or the whole
            file—and launch inline conversations that stay anchored to the
            lines you select. Powered by AWS Bedrock and Claude, it delivers
            contextual analysis, improvement suggestions, refactoring help, and
            diff-based patches directly within a Monaco editor experience.
          </p>
        </section>

        <section className="about-section" aria-labelledby="about-why">
          <h2 id="about-why">Why CodeSensei?</h2>
          <p>
            Most AI assistants sit in a separate chat window. CodeSensei brings
            AI directly <em>into</em> your code flow so reviews feel natural.
            Threads stay anchored to code, so context is never lost, and you get
            precise guidance without jumping between tools or losing your place.
          </p>
        </section>

        <section className="about-section" aria-labelledby="about-features">
          <h2 id="about-features">Key Capabilities</h2>
          <ul className="about-features-list">
            <li>
              <strong>Inline Threads</strong> – Start AI conversations tied to a
              selected block or the entire file.
            </li>
            <li>
              <strong>AI-Powered Insight</strong> – Catch bugs, surface security
              gaps, and get refactoring guidance with real code context.
            </li>
            <li>
              <strong>Diff Review & Apply Patch</strong> – Compare AI
              suggestions side-by-side and apply them with one click—auto-saved.
            </li>
            <li>
              <strong>Smart Anchoring</strong> – Conversations follow the code
              as it changes, warning you when context drifts.
            </li>
            <li>
              <strong>Language Awareness</strong> – Monaco-powered highlighting
              with manual overrides feeds the AI the right context.
            </li>
            <li>
              <strong>Persistent Sessions</strong> – Reopen files with full
              history of threads, messages, and patches ready to continue.
            </li>
          </ul>
        </section>

        <section className="about-cta" aria-labelledby="about-cta-heading">
          <h2 id="about-cta-heading">Ready to level up your code review?</h2>
          <div className="about-cta-buttons">
            <Link to="/signup" className="btn btn-primary">
              Get Started Free
            </Link>
            <Link to="/" className="btn btn-secondary">
              Back to Home
            </Link>
          </div>
        </section>
      </main>

      <footer className="about-footer">
        <p>
          Built with ❤️ by Yahav Corcos ·{" "}
          <Link to="/" className="about-footer-link">
            Visit CodeSensei
          </Link>
        </p>
      </footer>
    </div>
  );
}

export default About;


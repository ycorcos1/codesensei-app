import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { APIError } from "../utils/api";

const INITIAL_FORM = {
  username: "",
  password: "",
};

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState(INITIAL_FORM);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errorMessage) {
      setErrorMessage("");
    }
  };

  const validateForm = () => {
    if (!form.username.trim() || !form.password.trim()) {
      setErrorMessage("Username and password are required.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      await login({
        username: form.username.trim().toLowerCase(),
        password: form.password,
      });

      navigate("/dashboard", { replace: true });
    } catch (error) {
      if (error instanceof APIError) {
        if (error.statusCode === 429) {
          setErrorMessage(
            "Too many login attempts. Please try again in a minute."
          );
        } else {
          setErrorMessage(error.message || "Invalid credentials.");
        }
      } else {
        setErrorMessage("Unable to log in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card-nav">
          <Link to="/dashboard" className="auth-back-link">
            Back to Dashboard
          </Link>
        </div>
        <h1 className="auth-title">Log In</h1>

        {errorMessage && (
          <div className="auth-error-banner">{errorMessage}</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{" "}
          <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

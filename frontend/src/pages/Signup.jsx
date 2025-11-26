import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APIError } from '../utils/api';

const INITIAL_FORM = {
  name: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
};

const PASSWORD_RULES = [
  {
    key: 'length',
    label: 'Min 8 characters',
    test: (value) => value.length >= 8,
  },
  {
    key: 'uppercase',
    label: '1 uppercase letter',
    test: (value) => /[A-Z]/.test(value),
  },
  {
    key: 'number',
    label: '1 number',
    test: (value) => /[0-9]/.test(value),
  },
  {
    key: 'special',
    label: '1 special character',
    test: (value) => /[!@#$%^&*(),.?":{}|<>]/.test(value),
  },
];

function evaluatePassword(value) {
  const results = PASSWORD_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    met: rule.test(value),
  }));

  const metCount = results.filter((result) => result.met).length;
  const strength = metCount <= 2 ? 'weak' : metCount === 3 ? 'medium' : 'strong';

  return {
    results,
    strength,
    meetsAll: metCount === PASSWORD_RULES.length,
  };
}

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const evaluation = useMemo(
    () => evaluatePassword(form.password),
    [form.password],
  );

  const validators = useMemo(
    () => ({
      name: () => (form.name.trim() ? '' : 'Name is required.'),
      email: () => {
        if (!form.email.trim()) {
          return 'Email is required.';
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(form.email.trim())
          ? ''
          : 'Enter a valid email address.';
      },
      username: () => {
        if (!form.username.trim()) {
          return 'Username is required.';
        }
        return /^[a-zA-Z0-9]{3,20}$/.test(form.username.trim())
          ? ''
          : 'Username must be 3-20 alphanumeric characters.';
      },
      password: () =>
        evaluation.meetsAll ? '' : 'Password must meet all requirements.',
      confirmPassword: () => {
        if (!form.confirmPassword) {
          return 'Please confirm your password.';
        }
        return form.confirmPassword === form.password
          ? ''
          : 'Passwords do not match.';
      },
    }),
    [form, evaluation.meetsAll],
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }

    if (apiError) {
      setApiError('');
    }
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    validateField(name);
  };

  const validateField = (name) => {
    const validator = validators[name];
    if (!validator) {
      return '';
    }

    const message = validator();
    setErrors((prev) => ({ ...prev, [name]: message }));
    return message;
  };

  const validateForm = () => {
    const fieldNames = Object.keys(validators);
    const nextErrors = {};

    fieldNames.forEach((field) => {
      const message = validators[field]();
      if (message) {
        nextErrors[field] = message;
      }
    });

    setErrors(nextErrors);
    return fieldNames.every((field) => !nextErrors[field]);
  };

  const isReady = useMemo(() => {
    const hasValues = Object.values(form).every((value) => value.trim().length);
    const noErrors = Object.values(errors).every((message) => !message);
    const passwordsMatch = form.password === form.confirmPassword;

    return (
      hasValues &&
      evaluation.meetsAll &&
      passwordsMatch &&
      noErrors
    );
  }, [form, errors, evaluation.meetsAll]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setApiError('');

    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      navigate('/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof APIError) {
        if (error.field) {
          setErrors((prev) => ({ ...prev, [error.field]: error.message }));
          setTouched((prev) => ({ ...prev, [error.field]: true }));
        } else {
          setApiError(error.message);
        }
      } else {
        setApiError('Something went wrong. Please try again.');
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
        <h1 className="auth-title">Create Account</h1>

        {apiError && <div className="auth-error-banner">{apiError}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              onBlur={handleBlur}
              className={errors.name && touched.name ? 'error' : ''}
              autoComplete="name"
            />
            {errors.name && touched.name && (
              <span className="field-error">{errors.name}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              onBlur={handleBlur}
              className={errors.email && touched.email ? 'error' : ''}
              autoComplete="email"
            />
            {errors.email && touched.email && (
              <span className="field-error">{errors.email}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={form.username}
              onChange={handleChange}
              onBlur={handleBlur}
              className={errors.username && touched.username ? 'error' : ''}
              autoComplete="username"
            />
            {errors.username && touched.username && (
              <span className="field-error">{errors.username}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              onBlur={handleBlur}
              className={errors.password && touched.password ? 'error' : ''}
              autoComplete="new-password"
            />

            <div className="password-requirements" aria-live="polite">
              <div
                className={`password-strength password-strength-${evaluation.strength}`}
              >
                <div className="password-strength-bar" />
              </div>
              <ul className="requirements-list">
                {evaluation.results.map((result) => (
                  <li
                    key={result.key}
                    className={result.met ? 'met' : ''}
                    aria-checked={result.met}
                  >
                    {result.label}
                  </li>
                ))}
              </ul>
            </div>

            {errors.password && touched.password && (
              <span className="field-error">{errors.password}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              onBlur={handleBlur}
              className={
                errors.confirmPassword && touched.confirmPassword ? 'error' : ''
              }
              autoComplete="new-password"
            />
            {errors.confirmPassword && touched.confirmPassword && (
              <span className="field-error">{errors.confirmPassword}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isReady || submitting}
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}


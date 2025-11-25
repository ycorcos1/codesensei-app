import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, APIError } from '../utils/api';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'danger', label: 'Danger Zone', danger: true },
];

const PASSWORD_REQUIREMENTS = [
  {
    id: 'length',
    label: 'Min 8 characters',
    validate: (password) => password.length >= 8,
  },
  {
    id: 'uppercase',
    label: '1 uppercase letter',
    validate: (password) => /[A-Z]/.test(password),
  },
  {
    id: 'number',
    label: '1 number',
    validate: (password) => /[0-9]/.test(password),
  },
  {
    id: 'special',
    label: '1 special character',
    validate: (password) => /[^A-Za-z0-9]/.test(password),
  },
];

function getPasswordStrength(password) {
  const score = PASSWORD_REQUIREMENTS.reduce(
    (acc, requirement) => acc + (requirement.validate(password) ? 1 : 0),
    0,
  );

  if (!password || score <= 1) {
    return 'weak';
  }

  if (score <= 3) {
    return 'medium';
  }

  return 'strong';
}

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState('profile');

  const [profileForm, setProfileForm] = useState({
    name: '',
    username: '',
    email: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileFieldErrors, setProfileFieldErrors] = useState({});

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const passwordStrength = useMemo(
    () => getPasswordStrength(passwordForm.newPassword),
    [passwordForm.newPassword],
  );

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
      });
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      try {
        const response = await api.getProfile();
        if (response?.user && isMounted) {
          updateUser(response.user);
        }
      } catch (err) {
        if (isMounted) {
          setProfileError((prev) =>
            prev || 'Failed to refresh profile details. Showing cached values.',
          );
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [updateUser]);

  const isProfileDirty = useMemo(() => {
    if (!user) {
      return false;
    }

    return (
      profileForm.name !== (user.name || '') ||
      profileForm.username !== (user.username || '') ||
      profileForm.email !== (user.email || '')
    );
  }, [profileForm, user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleProfileChange = (field) => (event) => {
    const { value } = event.target;
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileFieldErrors((prev) => ({ ...prev, [field]: '' }));
    setProfileError('');
    setProfileSuccess('');
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();

    if (!isProfileDirty) {
      return;
    }

    setProfileLoading(true);
    setProfileSuccess('');
    setProfileError('');
    setProfileFieldErrors({});

    try {
      const response = await api.updateProfile({
        name: profileForm.name,
        username: profileForm.username,
        email: profileForm.email,
      });

      if (response?.user) {
        updateUser(response.user);
        setProfileSuccess('Profile updated successfully');
      }
    } catch (err) {
      if (err instanceof APIError) {
        if (err.field) {
          setProfileFieldErrors({ [err.field]: err.message });
        } else {
          setProfileError(err.message || 'Failed to update profile.');
        }
      } else {
        setProfileError('Failed to update profile. Please try again.');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = (field) => (event) => {
    const { value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
    setPasswordFieldErrors((prev) => ({ ...prev, [field]: '' }));
    setPasswordSuccess('');
    setPasswordError('');
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordFieldErrors((prev) => ({
        ...prev,
        confirmPassword: 'Passwords do not match.',
      }));
      return;
    }

    setPasswordLoading(true);
    setPasswordSuccess('');
    setPasswordError('');
    setPasswordFieldErrors({});

    try {
      await api.changePassword({
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      });

      setPasswordSuccess('Password updated successfully');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      if (err instanceof APIError) {
        if (err.field) {
          const fieldMap = {
            current_password: 'currentPassword',
            new_password: 'newPassword',
          };
          const field = fieldMap[err.field] || err.field;
          setPasswordFieldErrors((prev) => ({ ...prev, [field]: err.message }));
        } else {
          setPasswordError(err.message || 'Failed to update password.');
        }
      } else {
        setPasswordError('Failed to update password. Please try again.');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError('');

    try {
      await api.deleteAccount({ password: deletePassword });
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof APIError) {
        setDeleteError(err.message || 'Failed to delete account.');
      } else {
        setDeleteError('Failed to delete account. Please try again.');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <nav className="dashboard-nav">
        <div className="dashboard-brand">
          <img 
            src="/codesensei_logo.png" 
            alt="CodeSensei" 
            className="dashboard-logo"
          />
        </div>
        <div className="dashboard-nav-actions">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
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

      <div className="settings-layout">
        <aside className="settings-sidebar">
          <nav
            className="settings-sidebar-nav"
            role="navigation"
            aria-label="Settings sections"
          >
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-sidebar-item ${
                  activeSection === section.id ? 'active' : ''
                } ${section.danger ? 'settings-sidebar-item-danger' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-content">
          {activeSection === 'profile' && (
            <section className="settings-section" id="profile">
              <h2 className="settings-section-title">Profile</h2>
              <p className="settings-section-description">
                Manage your account information.
              </p>

              {profileSuccess ? (
                <div className="settings-success-message" role="status">
                  {profileSuccess}
                </div>
              ) : null}

              {profileError ? (
                <div className="settings-error-message" role="alert">
                  {profileError}
                </div>
              ) : null}

              <form className="settings-form" onSubmit={handleProfileSubmit}>
                <div className="settings-form-row">
                  <label htmlFor="settings-name">Display Name</label>
                  <input
                    id="settings-name"
                    type="text"
                    value={profileForm.name}
                    onChange={handleProfileChange('name')}
                    disabled={profileLoading}
                    className={profileFieldErrors.name ? 'error' : ''}
                  />
                  {profileFieldErrors.name ? (
                    <span className="field-error">{profileFieldErrors.name}</span>
                  ) : null}
                </div>

                <div className="settings-form-row">
                  <label htmlFor="settings-username">Username</label>
                  <input
                    id="settings-username"
                    type="text"
                    value={profileForm.username}
                    onChange={handleProfileChange('username')}
                    disabled={profileLoading}
                    className={profileFieldErrors.username ? 'error' : ''}
                  />
                  {profileFieldErrors.username ? (
                    <span className="field-error">
                      {profileFieldErrors.username}
                    </span>
                  ) : null}
                </div>

                <div className="settings-form-row">
                  <label htmlFor="settings-email">Email</label>
                  <input
                    id="settings-email"
                    type="email"
                    value={profileForm.email}
                    onChange={handleProfileChange('email')}
                    disabled={profileLoading}
                    className={profileFieldErrors.email ? 'error' : ''}
                  />
                  {profileFieldErrors.email ? (
                    <span className="field-error">{profileFieldErrors.email}</span>
                  ) : null}
                </div>

                <div className="settings-form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={profileLoading || !isProfileDirty}
                  >
                    {profileLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeSection === 'security' && (
            <section className="settings-section" id="security">
              <h2 className="settings-section-title">Change Password</h2>
              <p className="settings-section-description">
                Update your password to keep your account secure.
              </p>

              {passwordSuccess ? (
                <div className="settings-success-message" role="status">
                  {passwordSuccess}
                </div>
              ) : null}

              {passwordError ? (
                <div className="settings-error-message" role="alert">
                  {passwordError}
                </div>
              ) : null}

              <form className="settings-form" onSubmit={handlePasswordSubmit}>
                <div className="settings-form-row">
                  <label htmlFor="settings-current-password">Current Password</label>
                  <input
                    id="settings-current-password"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordChange('currentPassword')}
                    disabled={passwordLoading}
                    className={passwordFieldErrors.currentPassword ? 'error' : ''}
                  />
                  {passwordFieldErrors.currentPassword ? (
                    <span className="field-error">
                      {passwordFieldErrors.currentPassword}
                    </span>
                  ) : null}
                </div>

                <div className="settings-form-row">
                  <label htmlFor="settings-new-password">New Password</label>
                  <input
                    id="settings-new-password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange('newPassword')}
                    disabled={passwordLoading}
                    className={passwordFieldErrors.newPassword ? 'error' : ''}
                  />
                  {passwordForm.newPassword ? (
                    <div className="password-requirements">
                      <div
                        className={`password-strength password-strength-${passwordStrength}`}
                      >
                        <div className="password-strength-bar" />
                      </div>
                      <ul className="requirements-list">
                        {PASSWORD_REQUIREMENTS.map((requirement) => (
                          <li
                            key={requirement.id}
                            className={
                              requirement.validate(passwordForm.newPassword)
                                ? 'met'
                                : ''
                            }
                          >
                            {requirement.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {passwordFieldErrors.newPassword ? (
                    <span className="field-error">
                      {passwordFieldErrors.newPassword}
                    </span>
                  ) : null}
                </div>

                <div className="settings-form-row">
                  <label htmlFor="settings-confirm-password">Confirm New Password</label>
                  <input
                    id="settings-confirm-password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange('confirmPassword')}
                    disabled={passwordLoading}
                    className={passwordFieldErrors.confirmPassword ? 'error' : ''}
                  />
                  {passwordFieldErrors.confirmPassword ? (
                    <span className="field-error">
                      {passwordFieldErrors.confirmPassword}
                    </span>
                  ) : null}
                </div>

                <div className="settings-form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      passwordLoading ||
                      !passwordForm.currentPassword ||
                      !passwordForm.newPassword ||
                      !passwordForm.confirmPassword
                    }
                  >
                    {passwordLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeSection === 'preferences' && (
            <section className="settings-section" id="preferences">
              <h2 className="settings-section-title">Preferences</h2>
              <p className="settings-section-description">
                Customize your CodeSensei experience.
              </p>

              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Theme</span>
                  <span>Choose between light and dark themes.</span>
                </div>
                <span className="settings-toggle-disabled">
                  Dark theme only in v1
                </span>
              </div>
            </section>
          )}

          {activeSection === 'danger' && (
            <section className="settings-section settings-danger-zone" id="danger">
              <h2 className="settings-section-title">Danger Zone</h2>
              <p>
                Once you delete your account, there is no going back. All your
                sessions, threads, and conversation history will be permanently
                deleted.
              </p>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete Account
              </button>
            </section>
          )}
      </main>
      </div>

      {showDeleteModal ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                setShowDeleteModal(false);
                setDeletePassword('');
                setDeleteError('');
              }}
              aria-label="Close modal"
              disabled={deleteLoading}
            >
              ×
            </button>

            <h2 className="modal-title">Delete Account</h2>

            <div className="delete-modal-warning">
              <p>
                This will permanently delete your account, all sessions, and
                conversation history. This action cannot be undone.
              </p>
            </div>

            {deleteError ? (
              <div className="settings-error-message" role="alert">
                {deleteError}
              </div>
            ) : null}

            <div className="settings-form">
              <div className="settings-form-row">
                <label htmlFor="settings-delete-password">
                  Enter your password to confirm
                </label>
                <input
                  id="settings-delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  disabled={deleteLoading}
                  placeholder="Your password"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !deletePassword}
              >
                {deleteLoading ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

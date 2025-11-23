import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { api, APIError } from '../utils/api';

const AuthContext = createContext(null);
const LOCAL_STORAGE_KEY = 'codesensei_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!stored) {
        return null;
      }
      const parsed = JSON.parse(stored);
      if (parsed?.id) {
        return parsed;
      }
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return null;
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return null;
    }
  });
  const loading = false;

  const persistUser = useCallback((userData) => {
    setUser(userData);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(userData));
  }, []);

  const clearUser = useCallback(() => {
    setUser(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }, []);

  const signup = useCallback(
    async ({ name, email, username, password, confirmPassword }) => {
      const response = await api.signup({
        name,
        email,
        username,
        password,
        confirm_password: confirmPassword,
      });

      if (!response?.user) {
        throw new APIError(
          'INVALID_RESPONSE',
          'Unexpected response from server. Please try again.',
        );
      }

      persistUser(response.user);
      return response.user;
    },
    [persistUser],
  );

  const login = useCallback(
    async ({ username, password }) => {
      const response = await api.login({
        username,
        password,
      });

      if (!response?.user) {
        throw new APIError(
          'INVALID_RESPONSE',
          'Unexpected response from server. Please try again.',
        );
      }

      persistUser(response.user);
      return response.user;
    },
    [persistUser],
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    clearUser();
  }, [clearUser]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user?.id),
      loading,
      signup,
      login,
      logout,
    }),
    [user, loading, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


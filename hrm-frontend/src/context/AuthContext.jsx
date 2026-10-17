import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getCurrentUser = useCallback(async (options = {}) => {
    const token = localStorage.getItem('hrms_access_token');
    if (!token) {
      setUser(null);
      return null;
    }

    try {
      const response = await api.get('/user', options);
      const currentUser = response.data;
      if (!currentUser || typeof currentUser !== 'object' || !currentUser.id) {
        throw new Error('Invalid user response from API');
      }
      setUser(currentUser);
      return currentUser;
    } catch (err) {
      if (err.name === 'CanceledError') throw err;
      setUser(null);
      localStorage.removeItem('hrms_access_token');
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser({ signal: controller.signal })
      .catch((err) => {
        if (err.name !== 'CanceledError') console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [getCurrentUser]);

  const login = async (credentials) => {
    const response = await api.post('/login', credentials);
    const payload = response.data;
    const accessToken = payload?.access_token;
    const authenticatedUser = payload?.user;

    if (!accessToken || !authenticatedUser?.id) {
      throw new Error('The server returned an invalid login response.');
    }

    localStorage.setItem('hrms_access_token', accessToken);
    setUser(authenticatedUser);
    return authenticatedUser;
  };

  const logout = async () => {
    try {
      if (localStorage.getItem('hrms_access_token')) await api.post('/logout');
    } finally {
      localStorage.removeItem('hrms_access_token');
      setUser(null);
    }
  };

  const hasRole = (role) => user?.roles?.includes(role) || false;
  const hasAnyRole = (roles) => user?.roles?.some((role) => roles.includes(role)) || false;
  const hasPermission = (permission) => user?.permissions?.includes(permission) || false;

  const getPrimaryRole = () => {
    if (!user) return null;
    const roles = Array.isArray(user.roles) ? user.roles : Object.values(user.roles || {});
    return roles[0] || 'No Role';
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      hasRole,
      hasAnyRole,
      hasPermission,
      getPrimaryRole,
      getCurrentUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

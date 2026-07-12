/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { adminLogin, fetchProfile } from '../lib/api';

const AdminAuthContext = createContext(null);
const ADMIN_TOKEN_KEY = 'admin_auth_token';

export function AdminProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const storeToken = useCallback((value) => {
    setToken(value);
    try {
      localStorage.setItem(ADMIN_TOKEN_KEY, value);
    } catch (err) {
      console.warn('Failed to store admin token', err);
    }
  }, []);

  const clearToken = useCallback(() => {
    setToken(null);
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch (err) {
      console.warn('Failed to clear admin token', err);
    }
  }, []);

  const boot = useCallback(async () => {
    try {
      const stored = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!stored) {
        setLoading(false);
        return;
      }
      const profile = await fetchProfile(stored);
      if (!profile || profile.role !== 'ADMIN') {
        clearToken();
        setAdmin(null);
      } else {
        setAdmin(profile);
        setToken(stored);
      }
    } catch {
      clearToken();
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, [clearToken]);

  useEffect(() => {
    boot();
  }, [boot]);

  const login = useCallback(
    async (email, password) => {
      setError(null);
      setLoading(true);
      try {
        const result = await adminLogin({ email, password });
        if (!result?.token) {
          setError('Login failed');
          setLoading(false);
          return { success: false, error: 'Login failed' };
        }
        storeToken(result.token);
        setAdmin(result.user);
        setLoading(false);
        return { success: true };
      } catch (err) {
        const msg = err?.message || 'Login failed';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [storeToken],
  );

  const logout = useCallback(() => {
    clearToken();
    setAdmin(null);
  }, [clearToken]);

  const value = {
    admin,
    token,
    isAuthenticated: !!admin,
    loading,
    error,
    login,
    logout,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminProvider');
  }
  return context;
}

export default AdminAuthContext;

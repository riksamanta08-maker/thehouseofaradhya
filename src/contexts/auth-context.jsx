/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  fetchMyOrders,
  fetchProfile,
  signIn,
  signInWithGoogle as signInWithGoogleApi,
  signInWithFirebasePhone as signInWithFirebasePhoneApi,
  signUp,
  updateProfile as updateProfileApi,
  updatePassword as updatePasswordApi,
} from '../lib/api';
import {
  checkFirebaseGoogleAvailability,
  isFirebaseGoogleConfigured,
  signInWithGooglePopup,
} from '../lib/firebase';
import { clearMetaAdvancedMatching } from '../lib/metaPixel';

const AuthContext = createContext(null);

const TOKEN_KEY = 'customer_auth_token';

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [canUseGoogleAuth, setCanUseGoogleAuth] = useState(
    () => isFirebaseGoogleConfigured() || typeof window !== 'undefined',
  );

  const getStoredToken = useCallback(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }, []);

  const storeToken = useCallback((accessToken) => {
    try {
      localStorage.setItem(TOKEN_KEY, accessToken);
    } catch (e) {
      console.warn('Failed to store auth token', e);
    }
  }, []);

  const clearToken = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.warn('Failed to clear auth token', e);
    }
  }, []);

  const fetchCustomer = useCallback(
    async (token) => {
      if (!token) {
        setCustomer(null);
        setOrders([]);
        setLoading(false);
        return null;
      }

      try {
        const profile = await fetchProfile(token);
        const orderData = await fetchMyOrders(token).catch(() => []);
        setCustomer(profile ?? null);
        setOrders(orderData ?? []);
        setLoading(false);
        return profile;
      } catch (e) {
        console.error('Failed to fetch customer profile', e);
        clearToken();
        setCustomer(null);
        setOrders([]);
        setLoading(false);
        return null;
      }
    },
    [clearToken],
  );

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      fetchCustomer(token);
    } else {
      setLoading(false);
    }
  }, [getStoredToken, fetchCustomer]);

  useEffect(() => {
    let active = true;

    if (isFirebaseGoogleConfigured()) {
      setCanUseGoogleAuth(true);
      return undefined;
    }

    checkFirebaseGoogleAvailability().then((available) => {
      if (active) {
        setCanUseGoogleAuth(available);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (email, password) => {
      setError(null);
      setLoading(true);
      try {
        const normalizedEmail = String(email ?? '').trim();
        const result = await signIn({ email: normalizedEmail, password });
        const token = result?.token;

        if (!token) {
          setError('Login failed. Please try again.');
          setLoading(false);
          return { success: false, error: 'Login failed' };
        }

        storeToken(token);
        const customerData = await fetchCustomer(token);
        if (!customerData) {
          const msg = 'Unable to load your account details. Please try again.';
          setError(msg);
          return { success: false, error: msg };
        }
        return { success: true };
      } catch (e) {
        const msg = e?.message || 'Login failed';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
    },
    [storeToken, fetchCustomer],
  );

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const googleAuth = await signInWithGooglePopup();
      const result = await signInWithGoogleApi({
        idToken: googleAuth.idToken,
        name: googleAuth.name || undefined,
      });
      const token = result?.token;

      if (!token) {
        const msg = 'Google sign-in failed. Please try again.';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }

      storeToken(token);
      const customerData = await fetchCustomer(token);
      if (!customerData) {
        const msg = 'Unable to load your account details. Please try again.';
        setError(msg);
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (e) {
      const firebaseCode = e?.code || '';
      const msg =
        firebaseCode === 'auth/popup-closed-by-user'
          ? 'Google sign-in cancelled.'
          : firebaseCode === 'auth/popup-blocked'
            ? 'Popup blocked. Please allow popups and try again.'
            : firebaseCode === 'auth/cancelled-popup-request'
              ? 'Google sign-in was interrupted. Please try again.'
              : firebaseCode === 'auth/unauthorized-domain'
                ? 'This website domain is not yet authorized for Google sign-in in Firebase.'
              : e?.message || 'Google sign-in failed';
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  }, [storeToken, fetchCustomer]);

  const loginWithFirebasePhone = useCallback(async (idToken, name) => {
    setError(null);
    setLoading(true);

    try {
      const result = await signInWithFirebasePhoneApi({
        idToken,
        name: name || undefined,
      });
      const token = result?.token;

      if (!token) {
        const msg = 'Phone sign-in failed. Please try again.';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }

      storeToken(token);
      const customerData = await fetchCustomer(token);
      if (!customerData) {
        const msg = 'Unable to load your account details. Please try again.';
        setError(msg);
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (e) {
      const msg = e?.message || 'Phone sign-in failed';
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  }, [storeToken, fetchCustomer]);

  const register = useCallback(async ({ email, password, firstName, lastName }) => {
    setError(null);
    setLoading(true);
    try {
      const normalizedEmail = String(email ?? '').trim();
      const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
      await signUp({ email: normalizedEmail, password, name: fullName || undefined });
      setLoading(false);
      return { success: true };
    } catch (e) {
      const msg = e?.message || 'Registration failed';
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    clearToken();
    clearMetaAdvancedMatching();
    setCustomer(null);
    setOrders([]);
    setError(null);
  }, [clearToken]);

  const updateCustomerProfile = useCallback(
    async (updates) => {
      const token = getStoredToken();
      if (!token) {
        return { success: false, error: 'You are not logged in.' };
      }

      try {
        const updated = await updateProfileApi(token, updates);
        setCustomer(updated ?? null);
        return { success: true, data: updated };
      } catch (e) {
        const msg = e?.message || 'Unable to update profile.';
        return { success: false, error: msg };
      }
    },
    [getStoredToken],
  );

  const changeCustomerPassword = useCallback(
    async ({ currentPassword, newPassword }) => {
      const token = getStoredToken();
      if (!token) {
        return { success: false, error: 'You are not logged in.' };
      }

      try {
        const response = await updatePasswordApi(token, { currentPassword, newPassword });
        return { success: true, data: response };
      } catch (e) {
        const msg = e?.message || 'Unable to update password.';
        return { success: false, error: msg };
      }
    },
    [getStoredToken],
  );

  const value = {
    customer,
    orders,
    isAuthenticated: !!customer,
    loading,
    error,
    login,
    loginWithGoogle,
    loginWithFirebasePhone,
    register,
    logout,
    updateCustomerProfile,
    changeCustomerPassword,
    getAuthToken: getStoredToken,
    refreshCustomer: () => fetchCustomer(getStoredToken()),
    canUseGoogleAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

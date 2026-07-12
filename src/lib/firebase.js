import { initializeApp, getApp, getApps } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const normalizeValue = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeFirebaseConfig = (config = {}) => {
  const projectId = normalizeValue(config.projectId);
  const normalized = {
    apiKey: normalizeValue(config.apiKey),
    authDomain:
      normalizeValue(config.authDomain) ||
      (projectId ? `${projectId}.firebaseapp.com` : ''),
    projectId,
    storageBucket: normalizeValue(config.storageBucket),
    appId: normalizeValue(config.appId),
    messagingSenderId: normalizeValue(config.messagingSenderId),
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => Boolean(value)),
  );
};

const hasRequiredFirebaseConfig = (config) =>
  Boolean(config.apiKey && config.authDomain && config.projectId);

const resolveRuntimeConfigUrl = () => {
  const apiBase = normalizeValue(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '');
  return apiBase ? `${apiBase}/api/users/auth-config` : '/api/users/auth-config';
};

let firebaseConfig = normalizeFirebaseConfig({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
});

let firebaseConfigPromise = null;

const loadRuntimeFirebaseConfig = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Google sign-in is only available in the browser.');
  }

  const response = await fetch(resolveRuntimeConfigUrl(), {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        payload?.message ||
        'Unable to load Google sign-in configuration.',
    );
  }

  const runtimeConfig = normalizeFirebaseConfig(payload?.data || payload || {});
  if (!hasRequiredFirebaseConfig(runtimeConfig)) {
    throw new Error('Google sign-in is not configured. Please contact support.');
  }

  return runtimeConfig;
};

export const isFirebaseGoogleConfigured = () =>
  hasRequiredFirebaseConfig(firebaseConfig);

export const ensureFirebaseGoogleConfig = async () => {
  if (hasRequiredFirebaseConfig(firebaseConfig)) {
    return firebaseConfig;
  }

  if (!firebaseConfigPromise) {
    firebaseConfigPromise = loadRuntimeFirebaseConfig()
      .then((runtimeConfig) => {
        firebaseConfig = runtimeConfig;
        return firebaseConfig;
      })
      .catch((error) => {
        firebaseConfigPromise = null;
        throw error;
      });
  }

  return firebaseConfigPromise;
};

export const checkFirebaseGoogleAvailability = async () => {
  try {
    await ensureFirebaseGoogleConfig();
    return true;
  } catch {
    return false;
  }
};

const getFirebaseApp = async () => {
  const resolvedConfig = await ensureFirebaseGoogleConfig();
  return getApps().length ? getApp() : initializeApp(resolvedConfig);
};

export const signInWithGooglePopup = async () => {
  const app = await getFirebaseApp();
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken(true);

  return {
    idToken,
    email: result.user.email || '',
    name: result.user.displayName || '',
  };
};

export const setupRecaptcha = async (containerId) => {
  const app = await getFirebaseApp();
  const auth = getAuth(app);
  
  if (typeof window !== 'undefined') {
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (e) {
        console.warn('Failed to clear recaptchaVerifier', e);
      }
    }

    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
    });

    return window.recaptchaVerifier;
  }
  return null;
};

export const signInWithPhone = async (phoneNumber, appVerifier) => {
  const app = await getFirebaseApp();
  const auth = getAuth(app);
  
  return signInWithPhoneNumber(auth, phoneNumber, appVerifier);
};

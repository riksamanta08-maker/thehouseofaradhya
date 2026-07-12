const META_PIXEL_SCRIPT_ID = 'aradhya-meta-pixel-script';
const META_PIXEL_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
const PURCHASE_STORAGE_KEY = 'aradhya-meta-pixel-purchases-v1';
const ADVANCED_MATCHING_STORAGE_KEY = 'aradhya-meta-pixel-advanced-matching-v1';
const META_TEST_MODE_STORAGE_KEY = 'aradhya-meta-pixel-test-mode-v1';
const META_TEST_CODE_STORAGE_KEY = 'aradhya-meta-pixel-test-code-v1';
const MAX_STORED_PURCHASE_IDS = 50;
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '839123811919855';
const PURCHASE_RUNTIME_TRACKED_KEY = '__aradhyaMetaPixelTrackedPurchases';
const PURCHASE_RUNTIME_PENDING_KEY = '__aradhyaMetaPixelPendingPurchases';
const DEFAULT_ALLOWED_META_HOSTS = ['thehouseofaradhya.com', 'www.thehouseofaradhya.com'];

let lastTrackedPath = null;
let lastAdvancedMatchingSignature = null;
let pixelInitialized = false;
let advancedMatchingSignature = null;

function canUseMetaPixel() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    Boolean(PIXEL_ID) &&
    isAllowedMetaHostname()
  );
}

function getAllowedMetaHostnames() {
  const configuredHosts = String(import.meta.env.VITE_META_PIXEL_ALLOWED_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (configuredHosts.length > 0) {
    return configuredHosts;
  }

  return DEFAULT_ALLOWED_META_HOSTS;
}

function isAllowedMetaHostname() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  if (!hostname) {
    return false;
  }

  if (['localhost', '127.0.0.1'].includes(hostname)) {
    return true;
  }

  return getAllowedMetaHostnames().includes(hostname);
}

function normalizeString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeQuantity(value) {
  const parsed = normalizeNumber(value, 1);
  return Math.max(Math.floor(parsed), 1);
}

function isTruthyToken(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'debug'].includes(normalized);
}

function isFalsyToken(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['0', 'false', 'no', 'off'].includes(normalized);
}

function getUrlSearchParams() {
  if (!canUseMetaPixel()) {
    return null;
  }

  try {
    return new URLSearchParams(window.location.search || '');
  } catch {
    return null;
  }
}

function getDebugEvents() {
  if (!Array.isArray(window.__metaPixelDebugEvents)) {
    window.__metaPixelDebugEvents = [];
  }

  return window.__metaPixelDebugEvents;
}

function logMetaPixel(message, detail = null) {
  if (detail !== null && detail !== undefined) {
    console.info(`[Meta Pixel] ${message}`, detail);
    return;
  }

  console.info(`[Meta Pixel] ${message}`);
}

function hasBaseInitializationMarker() {
  return canUseMetaPixel() && window.__aradhyaMetaPixelBaseInitialized === true;
}

function markBaseInitialized() {
  if (!canUseMetaPixel()) {
    return;
  }

  window.__aradhyaMetaPixelBaseInitialized = true;
  window.__aradhyaMetaPixelId = PIXEL_ID;
  pixelInitialized = true;
}

function recordDebugEvent(type, detail = {}) {
  if (!canUseMetaPixel()) {
    return;
  }

  const entry = {
    type,
    detail,
    url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    timestamp: new Date().toISOString(),
  };

  getDebugEvents().push(entry);

  if (getDebugEvents().length > 200) {
    getDebugEvents().shift();
  }
}

function getMetaPixelFn() {
  if (typeof window.fbq === 'function') {
    return window.fbq;
  }

  if (typeof window._fbq === 'function') {
    return window._fbq;
  }

  return null;
}

function isMetaTestModeEnabled() {
  if (!canUseMetaPixel() || typeof window.sessionStorage === 'undefined') {
    return false;
  }

  const params = getUrlSearchParams();
  const queryValue = params?.get('meta_test');

  if (queryValue !== null) {
    const enabled = isTruthyToken(queryValue) && !isFalsyToken(queryValue);

    try {
      if (enabled) {
        window.sessionStorage.setItem(META_TEST_MODE_STORAGE_KEY, '1');
      } else {
        window.sessionStorage.removeItem(META_TEST_MODE_STORAGE_KEY);
      }
    } catch {
      // Ignore session storage failures in test mode.
    }

    return enabled;
  }

  try {
    return window.sessionStorage.getItem(META_TEST_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function getMetaTestCode() {
  if (!canUseMetaPixel() || typeof window.sessionStorage === 'undefined') {
    return null;
  }

  const params = getUrlSearchParams();
  const queryValue =
    normalizeString(params?.get('meta_test_code')) ||
    normalizeString(params?.get('test_event_code'));

  if (queryValue !== null) {
    try {
      window.sessionStorage.setItem(META_TEST_CODE_STORAGE_KEY, queryValue);
    } catch {
      // Ignore session storage failures in test mode.
    }

    return queryValue;
  }

  try {
    return normalizeString(window.sessionStorage.getItem(META_TEST_CODE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function syncMetaDebugQueryParams() {
  if (!canUseMetaPixel()) {
    return false;
  }

  const params = getUrlSearchParams();
  if (!params) {
    return false;
  }

  let changed = false;

  if (isMetaTestModeEnabled() && params.get('meta_test') !== '1') {
    params.set('meta_test', '1');
    changed = true;
  }

  const testCode = getMetaTestCode();
  if (testCode && params.get('meta_test_code') !== testCode) {
    params.set('meta_test_code', testCode);
    changed = true;
  }

  if (!changed) {
    return false;
  }

  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
  window.history.replaceState(window.history.state, '', nextUrl);
  return true;
}

export function appendMetaDebugParams(path) {
  const target = String(path || '').trim();
  if (!target || !canUseMetaPixel()) {
    return target;
  }

  const isAbsolute = /^https?:\/\//i.test(target);
  const base = isAbsolute ? undefined : window.location.origin;
  const url = new URL(target, base);

  if (isMetaTestModeEnabled()) {
    url.searchParams.set('meta_test', '1');
  }

  const testCode = getMetaTestCode();
  if (testCode) {
    url.searchParams.set('meta_test_code', testCode);
  }

  if (isAbsolute) {
    return url.toString();
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function ensureMetaPixelSnippet() {
  if (!canUseMetaPixel()) {
    return null;
  }

  let n = null;
  let t = null;
  let s = null;

  if (!getMetaPixelFn()) {
    if (!window.fbq) {
      n = window.fbq = function metaPixelStub() {
        if (n.callMethod) {
          n.callMethod.apply(n, arguments);
          return;
        }

        n.queue.push(arguments);
      };

      if (!window._fbq) {
        window._fbq = n;
      }

      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
    }

    recordDebugEvent('stub_ready', { pixelId: PIXEL_ID });
    logMetaPixel('fbq stub ready', { pixelId: PIXEL_ID });
  }

  if (!document.getElementById(META_PIXEL_SCRIPT_ID)) {
    t = document.createElement('script');
    t.id = META_PIXEL_SCRIPT_ID;
    t.async = true;
    t.src = META_PIXEL_SCRIPT_SRC;
    t.onload = () => {
      recordDebugEvent('script_loaded', { pixelId: PIXEL_ID });
      logMetaPixel('Pixel script loaded', { pixelId: PIXEL_ID });
    };
    t.onerror = () => {
      recordDebugEvent('script_failed', { pixelId: PIXEL_ID });
      logMetaPixel('Pixel script failed to load', { pixelId: PIXEL_ID });
    };
    s = document.getElementsByTagName('script')[0];

    if (s?.parentNode) {
      s.parentNode.insertBefore(t, s);
    } else {
      document.head.appendChild(t);
    }

    recordDebugEvent('script_injected', { pixelId: PIXEL_ID });
    logMetaPixel('Injecting pixel script', { pixelId: PIXEL_ID });
  }

  return getMetaPixelFn();
}

function initializeMetaPixelBase() {
  const fbq = ensureMetaPixelSnippet();
  if (!fbq) {
    return null;
  }

  if (!pixelInitialized && hasBaseInitializationMarker()) {
    pixelInitialized = true;
    recordDebugEvent('init_reused', { pixelId: PIXEL_ID });
    logMetaPixel('Pixel init reused from head snippet', { pixelId: PIXEL_ID });
    return fbq;
  }

  if (!pixelInitialized) {
    const advancedMatchingData =
      (window.__aradhyaMetaPixelAdvancedMatchingData &&
      typeof window.__aradhyaMetaPixelAdvancedMatchingData === 'object'
        ? window.__aradhyaMetaPixelAdvancedMatchingData
        : null) || readAdvancedMatchingFromStorage();

    if (advancedMatchingData && Object.keys(advancedMatchingData).length > 0) {
      fbq('init', PIXEL_ID, advancedMatchingData);
      recordDebugEvent('init', { pixelId: PIXEL_ID, advancedMatching: true });
      logMetaPixel('Pixel initialized with advanced matching', {
        pixelId: PIXEL_ID,
        userDataKeys: Object.keys(advancedMatchingData),
      });
    } else {
      fbq('init', PIXEL_ID);
      recordDebugEvent('init', { pixelId: PIXEL_ID, advancedMatching: false });
      logMetaPixel('Pixel initialized', { pixelId: PIXEL_ID });
    }

    markBaseInitialized();
  }

  return fbq;
}

function sendMetaPixelEvent(method, eventName, payload = undefined, options = undefined) {
  if (!canUseMetaPixel()) {
    return false;
  }

  const fbq = initializeMetaPixelBase();
  if (!fbq) {
    return false;
  }

  const normalizedPayload = payload && typeof payload === 'object' ? payload : undefined;
  const normalizedOptions = options && typeof options === 'object' ? options : undefined;
  recordDebugEvent('event_firing', {
    method,
    eventName,
    payload: normalizedPayload || null,
    options: normalizedOptions || null,
    pixelId: PIXEL_ID,
  });
  logMetaPixel(`${eventName} firing`, normalizedPayload || null);

  if (normalizedPayload && normalizedOptions) {
    fbq(method, eventName, normalizedPayload, normalizedOptions);
  } else if (normalizedPayload) {
    fbq(method, eventName, normalizedPayload);
  } else if (normalizedOptions) {
    fbq(method, eventName, undefined, normalizedOptions);
  } else {
    fbq(method, eventName);
  }

  recordDebugEvent('event_called', {
    method,
    eventName,
    payload: normalizedPayload || null,
    options: normalizedOptions || null,
    pixelId: PIXEL_ID,
  });
  logMetaPixel(`${eventName} fbq called`, normalizedPayload || null);
  return true;
}

function normalizeEmail(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeCountryCode(value) {
  const normalized = normalizeString(value)?.toLowerCase() || null;
  if (!normalized) {
    return null;
  }

  if (['in', 'india'].includes(normalized)) {
    return 'IN';
  }

  return normalized.toUpperCase();
}

function normalizePhone(value, country = null) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const digitsOnly = normalized.replace(/\D/g, '');
  if (!digitsOnly) {
    return null;
  }

  const normalizedCountry = normalizeCountryCode(country);
  if (normalizedCountry === 'IN' || normalizedCountry === null) {
    if (digitsOnly.length === 10) {
      return `91${digitsOnly}`;
    }

    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      return `91${digitsOnly.slice(1)}`;
    }

    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      return digitsOnly;
    }
  }

  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    return digitsOnly;
  }

  return null;
}

async function hashValue(value) {
  if (!value) {
    return null;
  }

  if (
    typeof window === 'undefined' ||
    !window.crypto ||
    !window.crypto.subtle ||
    typeof TextEncoder === 'undefined'
  ) {
    return value;
  }

  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildMetaContent(item = {}) {
  const id =
    normalizeString(item.productId) ||
    normalizeString(item.sku) ||
    normalizeString(item.id) ||
    normalizeString(item.slug) ||
    normalizeString(item.handle) ||
    normalizeString(item.name) ||
    'unknown-item';

  const quantity = normalizeQuantity(item.quantity);
  const content = {
    id,
    quantity,
  };

  const price = normalizeNumber(item.price, NaN);
  if (Number.isFinite(price) && price >= 0) {
    content.item_price = price;
  }

  const size = normalizeString(item.size);
  if (size) {
    content.size = size;
  }

  return {
    id,
    name: normalizeString(item.name) || 'Product',
    quantity,
    size,
    content,
  };
}

function buildEventPayload(items, basePayload = {}) {
  const normalizedItems = (Array.isArray(items) ? items : [items])
    .map((item) => buildMetaContent(item))
    .filter(Boolean);

  if (!normalizedItems.length) {
    return null;
  }

  const uniqueIds = Array.from(new Set(normalizedItems.map((item) => item.id)));
  const names = normalizedItems.map((item) => item.name);
  const sizes = normalizedItems.map((item) => item.size).filter(Boolean);
  const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);

  const payload = {
    content_name: names.length === 1 ? names[0] : names.slice(0, 5).join(', '),
    content_ids: uniqueIds,
    contents: normalizedItems.map((item) => item.content),
    content_type: 'product',
    num_items: totalQuantity,
    ...basePayload,
  };

  const customData = {
    ...(basePayload.custom_data && typeof basePayload.custom_data === 'object'
      ? basePayload.custom_data
      : {}),
  };

  if (sizes.length === 1) {
    customData.size = sizes[0];
  } else if (sizes.length > 1) {
    customData.sizes = sizes;
  }

  if (Object.keys(customData).length > 0) {
    payload.custom_data = customData;
  }

  return payload;
}

function getTrackedPurchaseIds() {
  if (!canUseMetaPixel()) {
    return [];
  }

  const purchaseIds = new Set();
  getPurchaseRegistry(PURCHASE_RUNTIME_TRACKED_KEY).forEach((entry) => {
    if (entry) {
      purchaseIds.add(entry);
    }
  });

  readTrackedPurchaseIdsFromStorage(window.sessionStorage).forEach((entry) => purchaseIds.add(entry));
  readTrackedPurchaseIdsFromStorage(window.localStorage).forEach((entry) => purchaseIds.add(entry));

  return Array.from(purchaseIds).slice(0, MAX_STORED_PURCHASE_IDS);
}

function readAdvancedMatchingFromStorage() {
  if (!canUseMetaPixel() || typeof window.sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ADVANCED_MATCHING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const normalized = Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, normalizeString(value)])
        .filter(([, value]) => Boolean(value)),
    );

    return Object.keys(normalized).length ? normalized : null;
  } catch {
    return null;
  }
}

function writeAdvancedMatchingToStorage(userData) {
  if (
    !canUseMetaPixel() ||
    typeof window.sessionStorage === 'undefined' ||
    !userData ||
    typeof userData !== 'object'
  ) {
    return;
  }

  try {
    window.sessionStorage.setItem(ADVANCED_MATCHING_STORAGE_KEY, JSON.stringify(userData));
  } catch {
    // Ignore storage failures for advanced matching.
  }
}

export function clearMetaAdvancedMatching() {
  if (!canUseMetaPixel() || typeof window.sessionStorage === 'undefined') {
    return false;
  }

  try {
    window.sessionStorage.removeItem(ADVANCED_MATCHING_STORAGE_KEY);
    delete window.__aradhyaMetaPixelAdvancedMatchingData;
    advancedMatchingSignature = null;
    lastAdvancedMatchingSignature = null;
    return true;
  } catch {
    return false;
  }
}

function getPurchaseRegistry(key) {
  if (!canUseMetaPixel()) {
    return new Set();
  }

  const registry = window[key];
  if (registry instanceof Set) {
    return registry;
  }

  const nextRegistry = new Set(Array.isArray(registry) ? registry : []);
  window[key] = nextRegistry;
  return nextRegistry;
}

function readTrackedPurchaseIdsFromStorage(storage) {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(PURCHASE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((entry) => normalizeString(entry)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function writeTrackedPurchaseIdsToStorage(storage, orderId) {
  if (!storage || !orderId) {
    return;
  }

  const nextIds = [
    orderId,
    ...readTrackedPurchaseIdsFromStorage(storage).filter((entry) => entry !== orderId),
  ].slice(0, MAX_STORED_PURCHASE_IDS);

  try {
    storage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify(nextIds));
  } catch {
    // Ignore storage failures and still allow event delivery.
  }
}

function markPurchasePending(orderId) {
  if (!orderId || !canUseMetaPixel()) {
    return;
  }

  getPurchaseRegistry(PURCHASE_RUNTIME_PENDING_KEY).add(orderId);
}

function clearPendingPurchase(orderId) {
  if (!orderId || !canUseMetaPixel()) {
    return;
  }

  getPurchaseRegistry(PURCHASE_RUNTIME_PENDING_KEY).delete(orderId);
}

function markPurchaseTracked(orderId) {
  if (!orderId || !canUseMetaPixel()) {
    return;
  }

  clearPendingPurchase(orderId);
  getPurchaseRegistry(PURCHASE_RUNTIME_TRACKED_KEY).add(orderId);
  writeTrackedPurchaseIdsToStorage(window.sessionStorage, orderId);
  writeTrackedPurchaseIdsToStorage(window.localStorage, orderId);
}

function hasTrackedPurchase(orderId) {
  if (!orderId) {
    return false;
  }

  return (
    getPurchaseRegistry(PURCHASE_RUNTIME_PENDING_KEY).has(orderId) ||
    getTrackedPurchaseIds().includes(orderId)
  );
}

function getNameParts(fullName) {
  const normalized = normalizeString(fullName);
  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const [firstName, ...rest] = normalized.split(/\s+/);
  return {
    firstName: firstName || null,
    lastName: rest.length ? rest.join(' ') : null,
  };
}

async function buildAdvancedMatchingData({ customer = null, shipping = null } = {}) {
  const customerId =
    normalizeString(customer?.id) ||
    normalizeString(customer?._id) ||
    normalizeString(customer?.userId) ||
    null;
  const email = normalizeEmail(customer?.email) || normalizeEmail(shipping?.email);
  const country =
    normalizeCountryCode(customer?.country) ||
    normalizeCountryCode(shipping?.country) ||
    'IN';
  const phone =
    normalizePhone(customer?.phone, country) ||
    normalizePhone(shipping?.phone, country);
  const nameParts = getNameParts(customer?.name || shipping?.fullName);

  const normalizedData = {
    em: email,
    ph: phone,
    external_id: normalizeString(customerId),
    fn: normalizeString(nameParts.firstName)?.toLowerCase() || null,
    ln: normalizeString(nameParts.lastName)?.toLowerCase() || null,
    ct: normalizeString(shipping?.city)?.toLowerCase() || null,
    st: normalizeString(shipping?.state)?.toLowerCase() || null,
    zp: normalizeString(shipping?.postalCode),
    country: normalizeString(shipping?.country)?.toLowerCase() || null,
  };

  const hashedEntries = await Promise.all(
    Object.entries(normalizedData).map(async ([key, value]) => [key, await hashValue(value)]),
  );

  const userData = Object.fromEntries(hashedEntries);
  return Object.fromEntries(
    Object.entries(userData).filter(([, value]) => Boolean(value)),
  );
}

export function ensureMetaPixelReady() {
  return Boolean(initializeMetaPixelBase());
}

export function trackMetaPageView({ pathname, search = '' } = {}) {
  if (!canUseMetaPixel()) {
    return false;
  }

  const pagePath = pathname || window.location.pathname;
  const pageSearch = typeof search === 'string' ? search : window.location.search;
  const currentPath = `${pagePath}${pageSearch}`;

  if (currentPath === lastTrackedPath) {
    return false;
  }

  lastTrackedPath = currentPath;
  return sendMetaPixelEvent('track', 'PageView');
}

export async function applyMetaAdvancedMatching(input = {}) {
  const userData = await buildAdvancedMatchingData(input);

  if (!Object.keys(userData).length) {
    return false;
  }

  const signature = JSON.stringify(userData);
  if (signature === lastAdvancedMatchingSignature || signature === advancedMatchingSignature) {
    return false;
  }

  const fbq = initializeMetaPixelBase();
  if (!fbq) {
    return false;
  }

  advancedMatchingSignature = signature;
  lastAdvancedMatchingSignature = signature;
  window.__aradhyaMetaPixelAdvancedMatchingData = userData;
  writeAdvancedMatchingToStorage(userData);

  recordDebugEvent('advanced_matching_prepared', { pixelId: PIXEL_ID, userData });
  logMetaPixel('Advanced matching prepared', userData);

  fbq('init', PIXEL_ID, userData);
  recordDebugEvent('advanced_matching_applied', { pixelId: PIXEL_ID, userData });
  logMetaPixel('Advanced matching applied', userData);
  return true;
}

export function trackMetaAddToCart(items, { value, currency = 'INR' } = {}) {
  const numericValue = normalizeNumber(value, NaN);
  const payload = buildEventPayload(items, {
    value: Number.isFinite(numericValue) ? numericValue : 0,
    currency: normalizeString(currency) || 'INR',
  });

  if (!payload) {
    return false;
  }

  return sendMetaPixelEvent('track', 'AddToCart', payload);
}

export function trackMetaInitiateCheckout(items, { value, currency = 'INR' } = {}) {
  const numericValue = normalizeNumber(value, NaN);
  const payload = buildEventPayload(items, {
    value: Number.isFinite(numericValue) ? numericValue : 0,
    currency: normalizeString(currency) || 'INR',
  });

  if (!payload) {
    return false;
  }

  return sendMetaPixelEvent('track', 'InitiateCheckout', payload);
}

export function trackMetaPurchase({
  orderId,
  eventId,
  value,
  currency = 'INR',
  items,
} = {}) {
  const normalizedOrderId = normalizeString(orderId);
  if (normalizedOrderId && hasTrackedPurchase(normalizedOrderId)) {
    recordDebugEvent('purchase_skipped_duplicate', { orderId: normalizedOrderId });
    logMetaPixel('Purchase skipped: duplicate', { orderId: normalizedOrderId });
    return false;
  }

  if (canUseMetaPixel() && window.location.pathname !== '/checkout/success') {
    recordDebugEvent('purchase_skipped_wrong_page', {
      orderId: normalizedOrderId,
      pathname: window.location.pathname,
    });
    logMetaPixel('Purchase skipped: wrong page', { orderId: normalizedOrderId, pathname: window.location.pathname });
    return false;
  }

  const numericValue = normalizeNumber(value, NaN);
  const payload = buildEventPayload(items, {
    value: Number.isFinite(numericValue) ? numericValue : 0,
    currency: normalizeString(currency) || 'INR',
    custom_data: normalizedOrderId
      ? {
          order_id: normalizedOrderId,
          transaction_id: normalizedOrderId,
        }
      : {},
  });

  if (!payload) {
    return false;
  }

  if (normalizedOrderId) {
    markPurchasePending(normalizedOrderId);
  }

  const sent = sendMetaPixelEvent(
    'track',
    'Purchase',
    payload,
    eventId ? { eventID: eventId } : undefined,
  );
  if (sent && normalizedOrderId && canUseMetaPixel()) {
    markPurchaseTracked(normalizedOrderId);
  } else if (normalizedOrderId) {
    clearPendingPurchase(normalizedOrderId);
  }
  return sent;
}

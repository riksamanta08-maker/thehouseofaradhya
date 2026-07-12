const DEFAULT_MEASUREMENT_ID = 'G-ES9FQ2785T';
const PURCHASE_STORAGE_KEY = 'aradhya-ga4-purchases-v1';
const PENDING_EVENTS_STORAGE_KEY = 'aradhya-ga4-pending-events-v1';
const DEBUG_MODE_STORAGE_KEY = 'aradhya-ga4-debug-mode-v1';
const MAX_STORED_PURCHASE_IDS = 50;
const MAX_PENDING_EVENTS = 20;

const measurementId =
  import.meta.env.VITE_GA_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;

let initialized = false;

function canUseAnalytics() {
  return (
    Boolean(measurementId) &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

function getUrlSearchParams() {
  if (!canUseAnalytics()) {
    return null;
  }

  try {
    return new URLSearchParams(window.location.search || '');
  } catch {
    return null;
  }
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

function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
}

function gtag() {
  ensureDataLayer();
  window.dataLayer.push(arguments);
}

function getDebugEvents() {
  if (!Array.isArray(window.__ga4DebugEvents)) {
    window.__ga4DebugEvents = [];
  }

  return window.__ga4DebugEvents;
}

function recordDebugEvent(type, detail = {}) {
  if (!canUseAnalytics()) {
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

function logAnalytics(message, detail = null) {
  if (detail !== null && detail !== undefined) {
    console.info(`[GA4] ${message}`, detail);
    return;
  }

  console.info(`[GA4] ${message}`);
}

function isAnalyticsDebugModeEnabled() {
  if (!canUseAnalytics() || typeof window.sessionStorage === 'undefined') {
    return false;
  }

  const params = getUrlSearchParams();
  const queryValue = params?.get('ga_debug') ?? params?.get('meta_test');

  if (queryValue !== null) {
    const enabled = isTruthyToken(queryValue) && !isFalsyToken(queryValue);

    try {
      if (enabled) {
        window.sessionStorage.setItem(DEBUG_MODE_STORAGE_KEY, '1');
      } else {
        window.sessionStorage.removeItem(DEBUG_MODE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures for debug mode.
    }

    return enabled;
  }

  try {
    return window.sessionStorage.getItem(DEBUG_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function buildAnalyticsItems(items) {
  return (Array.isArray(items) ? items : [items])
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const itemId =
        normalizeString(item.productId) ||
        normalizeString(item.sku) ||
        normalizeString(item.id) ||
        normalizeString(item.slug) ||
        normalizeString(item.handle) ||
        normalizeString(item.name) ||
        `item-${index + 1}`;
      const itemName =
        normalizeString(item.name) ||
        normalizeString(item.title) ||
        normalizeString(item.productName) ||
        itemId;
      const variant =
        normalizeString(item.size) ||
        normalizeString(item.variantTitle) ||
        normalizeString(item.variant);

      const analyticsItem = {
        item_id: itemId,
        item_name: itemName,
        price: normalizeNumber(item.price ?? item.unitPrice ?? item.amount, 0),
        quantity: normalizeQuantity(item.quantity),
      };

      if (variant) {
        analyticsItem.item_variant = variant;
      }

      return analyticsItem;
    })
    .filter(Boolean);
}

function getTrackedPurchaseIds() {
  if (!canUseAnalytics() || typeof window.sessionStorage === 'undefined') {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(PURCHASE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasTrackedPurchase(transactionId) {
  if (!transactionId) {
    return false;
  }

  return getTrackedPurchaseIds().includes(transactionId);
}

function markPurchaseTracked(transactionId) {
  if (!transactionId || !canUseAnalytics() || typeof window.sessionStorage === 'undefined') {
    return;
  }

  const nextIds = [
    transactionId,
    ...getTrackedPurchaseIds().filter((entry) => entry !== transactionId),
  ].slice(0, MAX_STORED_PURCHASE_IDS);

  try {
    window.sessionStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify(nextIds));
  } catch {
    // Ignore storage failures and still allow event delivery.
  }
}

function readPendingEvents() {
  if (!canUseAnalytics() || typeof window.sessionStorage === 'undefined') {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_EVENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingEvents(events) {
  if (!canUseAnalytics() || typeof window.sessionStorage === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      PENDING_EVENTS_STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_PENDING_EVENTS)),
    );
  } catch {
    // Ignore storage failures for queued analytics events.
  }
}

function queuePendingEvent(eventName, params) {
  const nextEvents = [
    ...readPendingEvents(),
    {
      eventName,
      params,
      queuedAt: new Date().toISOString(),
    },
  ];

  writePendingEvents(nextEvents);
  recordDebugEvent('event_queued', { eventName, params });
  logAnalytics(`${eventName} queued for next page`, params);
}

function buildEventParams(eventName, params = {}) {
  const eventParams = {
    transport_type: 'beacon',
    ...params,
  };

  if (isAnalyticsDebugModeEnabled()) {
    eventParams.debug_mode = true;
  }

  recordDebugEvent('event_firing', { eventName, params: eventParams });
  logAnalytics(`${eventName} firing`, eventParams);
  return eventParams;
}

function sendAnalyticsEvent(eventName, params = {}) {
  if (!canUseAnalytics()) {
    return false;
  }

  initializeAnalytics();
  const eventParams = buildEventParams(eventName, params);
  window.gtag('event', eventName, eventParams);
  recordDebugEvent('event_called', { eventName, params: eventParams });
  logAnalytics(`${eventName} gtag called`, eventParams);
  return true;
}

function sendPageViewConfig({ pageTitle, pagePath, pageLocation }) {
  if (!canUseAnalytics()) {
    return false;
  }

  initializeAnalytics();
  const params = {
    page_title: pageTitle,
    page_path: pagePath,
    page_location: pageLocation,
  };

  if (isAnalyticsDebugModeEnabled()) {
    params.debug_mode = true;
  }

  window.gtag('config', measurementId, params);
  recordDebugEvent('page_view_config_called', params);
  logAnalytics('page_view config called', params);
  return true;
}

export function initializeAnalytics() {
  if (!canUseAnalytics() || initialized) {
    return false;
  }

  window.gtag = window.gtag || gtag;

  if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.dataset.gaId = measurementId;
    document.head.appendChild(script);
    window.gtag('js', new Date());
  }

  window.gtag('config', measurementId);

  initialized = true;
  return true;
}

export function flushPendingAnalyticsEvents() {
  const pendingEvents = readPendingEvents();
  if (!pendingEvents.length) {
    return false;
  }

  writePendingEvents([]);

  pendingEvents.forEach((entry) => {
    if (!entry?.eventName || !entry?.params) {
      return;
    }

    sendAnalyticsEvent(entry.eventName, entry.params);
  });

  return true;
}

export function trackPageView({ pathname, search = '' }) {
  if (!canUseAnalytics()) {
    return false;
  }

  initializeAnalytics();

  const pagePath = `${pathname}${search}`;
  return sendPageViewConfig({
    pageTitle: document.title,
    pagePath,
    pageLocation: window.location.href,
  });
}

export function trackAddToCart(
  items,
  { value, currency = 'INR' } = {},
  { deferUntilNextPage = false } = {},
) {
  const analyticsItems = buildAnalyticsItems(items);
  if (!analyticsItems.length) {
    return false;
  }

  const params = {
    currency: normalizeString(currency) || 'INR',
    value: normalizeNumber(value, 0),
    items: analyticsItems,
  };

  if (deferUntilNextPage) {
    queuePendingEvent('add_to_cart', params);
    return true;
  }

  return sendAnalyticsEvent('add_to_cart', params);
}

export function trackBeginCheckout(
  items,
  { value, currency = 'INR' } = {},
  { deferUntilNextPage = false } = {},
) {
  const analyticsItems = buildAnalyticsItems(items);
  if (!analyticsItems.length) {
    return false;
  }

  const params = {
    currency: normalizeString(currency) || 'INR',
    value: normalizeNumber(value, 0),
    items: analyticsItems,
  };

  if (deferUntilNextPage) {
    queuePendingEvent('begin_checkout', params);
    return true;
  }

  return sendAnalyticsEvent('begin_checkout', params);
}

export function trackPurchase({
  transactionId,
  value,
  currency = 'INR',
  items,
} = {}) {
  const normalizedTransactionId = normalizeString(transactionId);
  const analyticsItems = buildAnalyticsItems(items);

  if (!normalizedTransactionId || !analyticsItems.length) {
    return false;
  }

  if (hasTrackedPurchase(normalizedTransactionId)) {
    recordDebugEvent('purchase_skipped_duplicate', { transactionId: normalizedTransactionId });
    logAnalytics('purchase skipped: duplicate', { transactionId: normalizedTransactionId });
    return false;
  }

  const sent = sendAnalyticsEvent('purchase', {
    transaction_id: normalizedTransactionId,
    value: normalizeNumber(value, 0),
    currency: normalizeString(currency) || 'INR',
    items: analyticsItems,
  });

  if (sent) {
    markPurchaseTracked(normalizedTransactionId);
  }

  return sent;
}

export function getAnalyticsMeasurementId() {
  return measurementId;
}

const CHECKOUT_DRAFT_KEY = 'aradhya-checkout-draft-v1';
const CHECKOUT_ADDRESSES_KEY = 'aradhya-checkout-addresses-v1';

const readJson = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
};

export const getCheckoutDraft = () => readJson(CHECKOUT_DRAFT_KEY, null);

export const setCheckoutDraft = (draft) => {
  if (!draft || typeof draft !== 'object') return;
  writeJson(CHECKOUT_DRAFT_KEY, draft);
};

export const clearCheckoutDraft = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    // ignore storage failures
  }
};

export const getSavedCheckoutAddresses = () => {
  const items = readJson(CHECKOUT_ADDRESSES_KEY, []);
  return Array.isArray(items) ? items : [];
};

export const setSavedCheckoutAddresses = (items) => {
  writeJson(
    CHECKOUT_ADDRESSES_KEY,
    Array.isArray(items) ? items : [],
  );
};

const normalizeToken = (value) => String(value ?? '').trim().toLowerCase();

const buildAddressFingerprint = (address) => {
  if (!address || typeof address !== 'object') return '';
  return [
    normalizeToken(address.fullName),
    normalizeToken(address.phone),
    normalizeToken(address.address),
    normalizeToken(address.city),
    normalizeToken(address.state),
    normalizeToken(address.postalCode),
  ].join('|');
};

export const upsertCheckoutAddress = (currentItems, addressInput) => {
  const list = Array.isArray(currentItems) ? [...currentItems] : [];
  const now = new Date().toISOString();
  const address = {
    id: addressInput?.id || `addr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: String(addressInput?.label || 'Home').trim() || 'Home',
    fullName: String(addressInput?.fullName || '').trim(),
    email: String(addressInput?.email || '').trim(),
    phone: String(addressInput?.phone || '').trim(),
    address: String(addressInput?.address || '').trim(),
    city: String(addressInput?.city || '').trim(),
    state: String(addressInput?.state || '').trim(),
    postalCode: String(addressInput?.postalCode || '').trim(),
    isDefault: Boolean(addressInput?.isDefault),
    updatedAt: now,
  };

  const fingerprint = buildAddressFingerprint(address);
  const index = list.findIndex(
    (entry) =>
      entry?.id === address.id || buildAddressFingerprint(entry) === fingerprint,
  );

  if (index === -1) {
    list.unshift(address);
  } else {
    list[index] = { ...list[index], ...address };
  }

  if (address.isDefault) {
    return list.map((entry) =>
      entry.id === address.id ? { ...entry, isDefault: true } : { ...entry, isDefault: false },
    );
  }
  return list;
};

export const getEmptyShippingAddress = (customer = null) => ({
  id: '',
  label: 'Home',
  fullName: String(customer?.name || '').trim(),
  email: String(customer?.email || '').trim(),
  phone: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  isDefault: false,
});


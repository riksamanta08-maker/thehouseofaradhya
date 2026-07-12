const DEFAULT_OWNER_ADMIN_EMAIL = 'admin@local.test';
const DEFAULT_OWNER_CONTROL_PATH = '/as-owner-vault/status-console';

export const OWNER_ADMIN_EMAIL =
  String(import.meta.env.VITE_OWNER_ADMIN_EMAIL || DEFAULT_OWNER_ADMIN_EMAIL)
    .trim()
    .toLowerCase();

export const isOwnerAdmin = (admin) =>
  String(admin?.email || '').trim().toLowerCase() === OWNER_ADMIN_EMAIL;

export const OWNER_CONTROL_PATH =
  String(import.meta.env.VITE_OWNER_CONTROL_PATH || DEFAULT_OWNER_CONTROL_PATH)
    .trim()
    .replace(/\/+$/, '') || DEFAULT_OWNER_CONTROL_PATH;

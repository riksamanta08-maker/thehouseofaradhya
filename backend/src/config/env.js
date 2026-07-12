const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const envFiles = [
  process.env.HOME ? path.join(process.env.HOME, 'uploads', '.env') : null,
  path.resolve(process.cwd(), '..', 'uploads', '.env'),
  path.resolve(process.cwd(), 'uploads', '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
].filter(Boolean);

envFiles.forEach((envFile) => {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false, quiet: true });
  }
});

envFiles.forEach((envFile) => {
  if (!fs.existsSync(envFile)) return;
  const parsed = dotenv.config({ path: envFile, override: false, quiet: true }).parsed || {};
  ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD'].forEach((key) => {
    if (parsed[key]) {
      process.env[key] = parsed[key];
    }
  });
});

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const env = {
  port: Number(process.env.PORT || 5001),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret',
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: process.env.FRONTEND_URL,
  ownerAdminEmail: String(process.env.OWNER_ADMIN_EMAIL || 'admin@local.test').trim().toLowerCase(),
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || 'marvelle',
  shiprocketToken: process.env.SHIPROCKET_TOKEN,
  shiprocketEmail: process.env.SHIPROCKET_EMAIL,
  shiprocketPassword: process.env.SHIPROCKET_PASSWORD,
  shiprocketPickupLocation: String(process.env.SHIPROCKET_PICKUP_LOCATION || '').trim(),
  shiprocketPickupPincode: process.env.SHIPROCKET_PICKUP_PINCODE || '711303',
  shiprocketDefaultCountry: process.env.SHIPROCKET_DEFAULT_COUNTRY || 'India',
  shiprocketDefaultWeight: toNumber(process.env.SHIPROCKET_DEFAULT_WEIGHT, 0.5),
  shiprocketDefaultLength: toNumber(process.env.SHIPROCKET_DEFAULT_LENGTH, 10),
  shiprocketDefaultBreadth: toNumber(process.env.SHIPROCKET_DEFAULT_BREADTH, 10),
  shiprocketDefaultHeight: toNumber(process.env.SHIPROCKET_DEFAULT_HEIGHT, 10),
  metaCapiEnabled: toBoolean(process.env.META_CAPI_ENABLED, false),
  metaCapiPixelId: String(process.env.META_CAPI_PIXEL_ID || "").trim(),
  metaCapiAccessToken: String(process.env.META_CAPI_ACCESS_TOKEN || "").trim(),
  metaCapiTestEventCode: String(process.env.META_CAPI_TEST_EVENT_CODE || "").trim(),
  metaCapiApiVersion: String(process.env.META_CAPI_API_VERSION || "v22.0").trim() || "v22.0",
};

module.exports = { env };

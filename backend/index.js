const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('node:path');
const fs = require('node:fs');
const { PassThrough } = require('node:stream');
const dotenv = require('dotenv');

const envFiles = [
  process.env.HOME ? path.join(process.env.HOME, 'uploads', '.env') : null,
  path.resolve(process.cwd(), '..', 'uploads', '.env'),
  path.resolve(process.cwd(), 'uploads', '.env'),
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
].filter(Boolean);

envFiles.forEach((envPath) => {
  dotenv.config({ path: envPath, override: false, quiet: true });
});

const { env } = require('./src/config');
const { errorHandler } = require('./src/middleware/error');
const userRoutes = require('./src/routes/user.routes');
const productRoutes = require('./src/routes/product.routes');
const adminRoutes = require('./src/routes/admin.routes');
const collectionRoutes = require('./src/routes/collection.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const reviewRoutes = require('./src/routes/review.routes');
const orderRoutes = require('./src/routes/order.routes');
const shiprocketRoutes = require('./src/routes/shiprocket.routes');
const checkoutRoutes = require('./src/routes/checkout.routes');
const discountRoutes = require('./src/routes/discount.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const { getUploadsDir, canUseDir } = require('./src/utils/uploads');
const { hasHostingerConfig, downloadHostingerUpload } = require('./src/utils/hostingerStorage');

const app = express();
app.disable('x-powered-by');

const normalizeOrigin = (value) =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';

const parseOrigins = (value) =>
  String(value || '')
    .split(/[,\s]+/)
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extraOrigins = parseOrigins(process.env.FRONTEND_URLS);
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const allowedOrigins = [
  env.frontendUrl,
  ...extraOrigins,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  vercelUrl,
]
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);
const allowedOriginSet = new Set(allowedOrigins);

const allowVercelPreview = ['1', 'true', 'yes'].includes(
  String(process.env.ALLOW_VERCEL_PREVIEW || '').toLowerCase(),
);
const vercelProjectName =
  process.env.FRONTEND_VERCEL_PROJECT_NAME || process.env.VERCEL_PROJECT_NAME;
const vercelOriginRegex =
  allowVercelPreview && vercelProjectName
    ? new RegExp(
      `^https://${escapeRegex(
        vercelProjectName,
      )}(?:-[a-z0-9-]+)?\\.vercel\\.app$`,
      'i',
    )
    : null;

const isLocalDevOrigin = (origin = '') => {
  if (typeof origin !== 'string') return false;
  return origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
};

const isVercelPreviewOrigin = (origin = '') => {
  if (!vercelOriginRegex) return false;
  return vercelOriginRegex.test(origin);
};

const isVercelHostOrigin = (origin = '') =>
  /^https?:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin || '');

const isHostingerSiteOrigin = (origin = '') =>
  /^https?:\/\/[a-z0-9-]+\.hostingersite\.com$/i.test(origin || '');

const getRequestHost = (req) => {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  return forwardedHost || String(req.headers.host || '').trim();
};

const isSameHostOrigin = (origin = '', req) => {
  try {
    const originUrl = new URL(origin);
    return originUrl.host === getRequestHost(req);
  } catch {
    return false;
  }
};

const createCorsOptions = (req) => ({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = normalizeOrigin(origin);
    if (
      allowedOriginSet.has(normalized) ||
      isSameHostOrigin(normalized, req) ||
      isLocalDevOrigin(normalized) ||
      isVercelPreviewOrigin(normalized) ||
      isVercelHostOrigin(normalized) ||
      isHostingerSiteOrigin(normalized)
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: Origin not allowed: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

app.use(cors((req, callback) => callback(null, createCorsOptions(req))));
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

const publicApiHits = new Map();
const PUBLIC_API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const PUBLIC_API_RATE_LIMIT_MAX = Number(process.env.PUBLIC_API_RATE_LIMIT_MAX) || 180;

const getClientIp = (req) => {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '');
  return forwardedFor.split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown';
};

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.headers.authorization) {
    return next();
  }

  const now = Date.now();
  const key = `${getClientIp(req)}:${req.method}`;
  const current = publicApiHits.get(key);
  const entry =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + PUBLIC_API_RATE_LIMIT_WINDOW_MS };

  entry.count += 1;
  publicApiHits.set(key, entry);

  if (publicApiHits.size > 2000) {
    for (const [hitKey, hit] of publicApiHits) {
      if (hit.resetAt <= now) publicApiHits.delete(hitKey);
    }
  }

  if (entry.count > PUBLIC_API_RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  return next();
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  if (req.path.startsWith('/api/products') || req.path.startsWith('/api/collections')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  } else if (req.path.startsWith('/api/reviews')) {
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  } else if (req.path === '/api/admin/site-settings') {
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  } else if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  }

  return next();
});
app.use(express.json({ limit: '1mb' }));

app.use('/uploads', express.static(getUploadsDir(), {
  index: false,
  maxAge: '30d',
}));

app.get('/uploads/:filename', async (req, res, next) => {
  if (!hasHostingerConfig()) return next();

  const filename = path.basename(String(req.params.filename || ''));
  if (!filename) return next();

  try {
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    res.type(path.extname(filename) || 'application/octet-stream');

    const stream = new PassThrough();
    stream.on('error', next);
    stream.pipe(res);

    const found = await downloadHostingerUpload(filename, stream);
    if (!found) {
      stream.destroy();
      if (!res.headersSent) return res.status(404).json({ error: 'Upload not found' });
      return undefined;
    }
    stream.end();
    return undefined;
  } catch (error) {
    if (!res.headersSent) return res.status(404).json({ error: 'Upload not found' });
    return res.destroy(error);
  }
});

const frontendDistPath = path.join(__dirname, '..', 'dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
const shouldServeFrontend =
  process.env.SERVE_FRONTEND !== 'false' && fs.existsSync(frontendIndexPath);

if (shouldServeFrontend) {
  app.use(express.static(frontendDistPath, {
    index: false,
    maxAge: '1y',
    immutable: true,
  }));
} else {
  app.get('/', (_req, res) => {
    res.status(200).json({ message: 'Marvelle API is running successfully.' });
  });
}

app.get('/api/health', (req, res) => {
  const logInfo = {
    timestamp: new Date().toISOString(),
    host: req.get('host'),
    path: req.originalUrl,
    env: process.env.NODE_ENV || 'development'
  };
  console.log(`[ROUTE LOG] GET /api/health`, logInfo);

  return res.json({
    ok: true,
    service: "backend",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    vercelProject: process.env.VERCEL_PROJECT_NAME || null,
    vercelUrl: process.env.VERCEL_URL || null,
    uploads: {
      mode: hasHostingerConfig() ? 'hostinger' : 'local',
      ready: canUseDir(getUploadsDir()),
      configured: hasHostingerConfig() || Boolean(process.env.UPLOADS_DIR),
    },
    shiprocketPickupLocationPresent: !!process.env.SHIPROCKET_PICKUP_LOCATION,
    shiprocketPickupPincodePresent: !!process.env.SHIPROCKET_PICKUP_PINCODE
  });
});

app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/shiprocket', shiprocketRoutes);
app.use('/api', checkoutRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/inventory', inventoryRoutes);

app.use((err, req, res, next) => {
  if (err && String(err.message || '').startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  return errorHandler(err, req, res, next);
});

if (shouldServeFrontend) {
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(frontendIndexPath);
  });
}

app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

const { warmUp } = require('./src/db/prismaClient');

if (require.main === module) {
  app.listen(env.port, () => {
    console.log(`Marvelle API ready on http://localhost:${env.port}`);
    warmUp();
  });
}

module.exports = app;

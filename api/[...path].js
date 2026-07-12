import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let cachedApp = null;

const loadApp = () => {
  if (cachedApp) return cachedApp;

  const mod = require('../backend/index.js');
  const app = mod?.default ?? mod;
  if (typeof app !== 'function') {
    throw new Error('Backend app export is invalid.');
  }

  cachedApp = app;
  return cachedApp;
};

export const config = {
  runtime: 'nodejs',
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  try {
    const app = loadApp();
    return app(req, res);
  } catch (error) {
    console.error('[api/[...path]] bootstrap failed', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'API bootstrap failed',
        message: error?.message || 'Unknown bootstrap error',
        stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
      });
    }
    return undefined;
  }
}

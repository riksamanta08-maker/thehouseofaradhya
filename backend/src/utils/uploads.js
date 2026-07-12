const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT_UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DEFAULT_UPLOADS_DIR = path.join(__dirname, '../../uploads');
const SERVERLESS_UPLOADS_DIR = path.join('/tmp', 'marvelle-uploads');

const normalizePath = (value) => String(value || '').trim().replace(/\\/g, '/');

const resolveUploadDir = (value) => {
  const normalized = normalizePath(value);
  if (!normalized) return [];
  if (path.isAbsolute(normalized)) return [normalized];

  return [
    process.env.HOME ? path.join(process.env.HOME, normalized) : '',
    path.join(process.cwd(), normalized),
  ].filter(Boolean);
};

const canUseDir = (dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
};

let cachedUploadsDir = null;

const getUploadsDir = () => {
  if (cachedUploadsDir) return cachedUploadsDir;

  const candidates = [
    ...resolveUploadDir(process.env.UPLOADS_DIR),
    ...resolveUploadDir(process.env.HOSTINGER_UPLOADS_DIR),
    process.env.HOME ? path.join(process.env.HOME, 'public_html', 'uploads') : '',
    process.env.HOME ? path.join(process.env.HOME, 'uploads') : '',
    ROOT_UPLOADS_DIR,
    DEFAULT_UPLOADS_DIR,
    path.join(os.tmpdir(), 'marvelle-uploads'),
    SERVERLESS_UPLOADS_DIR,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canUseDir(candidate)) {
      cachedUploadsDir = candidate;
      return cachedUploadsDir;
    }
  }

  cachedUploadsDir = DEFAULT_UPLOADS_DIR;
  return cachedUploadsDir;
};

module.exports = {
  getUploadsDir,
  canUseDir,
};

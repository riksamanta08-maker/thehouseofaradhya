const path = require('node:path');
const { Readable } = require('node:stream');
const ftp = require('basic-ftp');

const toBoolean = (value, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizePublicBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const normalizeRemoteDir = (value) => {
  const normalized = String(value || 'public_html/uploads')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '');
  if (!normalized) return '/public_html/uploads';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const normalizeFtpHost = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `ftp://${raw}`;
    return new URL(withProtocol).hostname;
  } catch {
    return raw.replace(/^ftp:\/\//i, '').replace(/\/.*$/, '');
  }
};

const getHostingerConfig = () => {
  const host = normalizeFtpHost(process.env.HOSTINGER_FTP_HOST);
  const user = String(process.env.HOSTINGER_FTP_USER || '').trim();
  const password = String(process.env.HOSTINGER_FTP_PASSWORD || '').trim();
  const publicBaseUrl = normalizePublicBaseUrl(
    process.env.HOSTINGER_UPLOADS_URL || process.env.FRONTEND_URL,
  );

  if (!host || !user || !password || !publicBaseUrl) return null;

  return {
    host,
    user,
    password,
    port: Number(process.env.HOSTINGER_FTP_PORT || 21),
    secure: toBoolean(process.env.HOSTINGER_FTP_SECURE, false),
    remoteDir: normalizeRemoteDir(process.env.HOSTINGER_UPLOADS_DIR),
    publicBaseUrl,
  };
};

const hasHostingerConfig = () => Boolean(getHostingerConfig());

const uploadBufferToHostinger = async (buffer, filename) => {
  const config = getHostingerConfig();
  if (!config) {
    throw new Error('Hostinger FTP storage is not configured.');
  }

  const client = new ftp.Client(30_000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port,
      secure: config.secure,
    });

    await client.ensureDir(config.remoteDir);
    await client.uploadFrom(Readable.from(buffer), filename);

    return {
      url: `${config.publicBaseUrl}/uploads/${encodeURIComponent(filename)}`,
      publicId: filename,
      storage: 'hostinger',
    };
  } finally {
    client.close();
  }
};

const deleteHostingerUpload = async (filename) => {
  const config = getHostingerConfig();
  if (!config || !filename) return false;

  const client = new ftp.Client(30_000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port,
      secure: config.secure,
    });

    const remotePath = `${config.remoteDir}/${path.basename(filename)}`;
    await client.remove(remotePath);
    return true;
  } catch (error) {
    if (String(error?.message || '').includes('No such file')) return false;
    throw error;
  } finally {
    client.close();
  }
};

const downloadHostingerUpload = async (filename, writable) => {
  const config = getHostingerConfig();
  if (!config || !filename) return false;

  const client = new ftp.Client(30_000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port,
      secure: config.secure,
    });

    const remotePath = `${config.remoteDir}/${path.basename(filename)}`;
    await client.downloadTo(writable, remotePath);
    return true;
  } finally {
    client.close();
  }
};

module.exports = {
  hasHostingerConfig,
  uploadBufferToHostinger,
  deleteHostingerUpload,
  downloadHostingerUpload,
};

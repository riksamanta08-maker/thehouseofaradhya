const { sendSuccess, sendError } = require('../utils/response');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { getUploadsDir } = require('../utils/uploads');
const { uploadBuffer, deleteImage, publicIdFromUrl } = require('../utils/cloudinary');
const {
  hasHostingerConfig,
  uploadBufferToHostinger,
  deleteHostingerUpload,
} = require('../utils/hostingerStorage');

const EXTENSIONS_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const safeBaseName = (filename = 'image') =>
  path
    .basename(String(filename), path.extname(String(filename)))
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';

const extensionForFile = (file) => {
  const byType = EXTENSIONS_BY_TYPE[String(file?.mimetype || '').toLowerCase()];
  if (byType) return byType;
  const ext = path.extname(String(file?.originalname || '')).toLowerCase();
  return ext || '.jpg';
};

const hasCloudinaryConfig = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );

const requiresHostingerStorage = () =>
  ['1', 'true', 'yes', 'on'].includes(
    String(process.env.HOSTINGER_UPLOADS_REQUIRED || '').trim().toLowerCase(),
  );

const filenameFromIdentifier = (identifier = '') => {
  const raw = String(identifier || '').trim();
  if (!raw) return '';

  try {
    const parsed = raw.startsWith('http') ? new URL(raw) : null;
    return path.basename(parsed ? parsed.pathname : raw);
  } catch {
    return path.basename(raw);
  }
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const verifyPublicImageUrl = async (url) => {
  if (!url || typeof fetch !== 'function') return;

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      if (response.ok) return;
      lastError = new Error(`Public image URL returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(750);
  }

  throw lastError || new Error('Public image URL could not be verified.');
};

const uploadSuccess = async (req, res) => {
  if (!req.file) {
    return sendError(res, 400, 'No file uploaded');
  }

  try {
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeBaseName(
      req.file.originalname,
    )}${extensionForFile(req.file)}`;

    if (hasHostingerConfig()) {
      try {
        const uploaded = await uploadBufferToHostinger(req.file.buffer, filename);
        await verifyPublicImageUrl(uploaded.url);

        res.status(201);
        return sendSuccess(res, {
          url: uploaded.url,
          publicId: uploaded.publicId,
          originalName: req.file.originalname,
          size: req.file.size,
          storage: uploaded.storage,
        });
      } catch (error) {
        console.error('[Upload] Hostinger upload failed:', error);
        if (requiresHostingerStorage() || !hasCloudinaryConfig()) {
          throw error;
        }
      }
    }

    if (hasCloudinaryConfig()) {
      const uploaded = await uploadBuffer(req.file.buffer, {
        public_id: path.basename(filename, path.extname(filename)),
      });

      res.status(201);
      return sendSuccess(res, {
        url: uploaded.url,
        publicId: uploaded.publicId,
        originalName: req.file.originalname,
        size: req.file.size,
        width: uploaded.width,
        height: uploaded.height,
        storage: 'cloudinary',
      });
    }

    const uploadsDir = getUploadsDir();
    const filePath = path.join(uploadsDir, filename);

    await fs.writeFile(filePath, req.file.buffer);

    res.status(201);
    return sendSuccess(res, {
      url: `/uploads/${filename}`,
      publicId: filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    console.error('[Upload] Image upload failed:', err);
    const detailMessage = err?.message || 'Unable to save image.';
    return sendError(res, 500, `Image upload failed: ${detailMessage}`, {
      code: err?.code || err?.name || 'UPLOAD_WRITE_FAILED',
      message: detailMessage,
    });
  }
};

const deleteUpload = async (req, res) => {
  const identifier = req.params.filename;
  const filename = filenameFromIdentifier(identifier);

  if (!filename) {
    return sendError(res, 400, 'Invalid image identifier');
  }

  try {
    if (hasHostingerConfig()) {
      const removed = await deleteHostingerUpload(filename);
      if (removed) return res.status(204).send();
    }

    if (hasCloudinaryConfig()) {
      const publicId = publicIdFromUrl(identifier) || identifier;
      if (publicId && !publicId.includes('/uploads/')) {
        await deleteImage(publicId);
        return res.status(204).send();
      }
    }

    await fs.unlink(path.join(getUploadsDir(), filename)).catch((err) => {
      if (err?.code !== 'ENOENT') throw err;
    });
    return res.status(204).send();
  } catch (err) {
    console.error('[Upload] Local delete failed:', err);
    return sendError(res, 500, 'Failed to delete image.');
  }
};

module.exports = {
  uploadSuccess,
  deleteUpload,
};

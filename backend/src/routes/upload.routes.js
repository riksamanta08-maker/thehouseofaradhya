const express = require('express');
const multer = require('multer');

const { uploadSuccess, deleteUpload } = require('../controllers/upload.controller');
const { protect, requireRole } = require('../middleware/auth');
const { sendError } = require('../utils/response');

const router = express.Router();

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(String(file.mimetype || '').toLowerCase())) {
      return cb(new Error('Only image files are allowed.'));
    }
    return cb(null, true);
  },
});

const uploadSingleImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 413, 'Image must be smaller than 10MB.');
    }
    if (err?.message === 'Only image files are allowed.') {
      return sendError(res, 400, err.message);
    }
    return next(err);
  });
};

router.post('/', protect, requireRole('ADMIN'), uploadSingleImage, uploadSuccess);
router.post('/user', protect, uploadSingleImage, uploadSuccess);
router.delete('/:filename', protect, requireRole('ADMIN'), deleteUpload);

module.exports = router;

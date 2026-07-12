const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary.
 * @param {Buffer} buffer – file contents
 * @param {object} [options] – extra Cloudinary upload options
 * @returns {Promise<{url: string, publicId: string, width: number, height: number}>}
 */
const uploadBuffer = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_FOLDER || 'marvelle',
        resource_type: 'image',
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });

/**
 * Delete an image from Cloudinary by public_id.
 * @param {string} publicId
 */
const deleteImage = (publicId) =>
  cloudinary.uploader.destroy(publicId);

/**
 * Extract the Cloudinary public_id from a secure_url.
 * Returns null if the URL doesn't match the expected pattern.
 */
const publicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const { pathname } = new URL(url);
    // Pattern: /image/upload/v12345/folder/filename.ext
    const match = pathname.match(/\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

module.exports = {
  cloudinary,
  uploadBuffer,
  deleteImage,
  publicIdFromUrl,
};

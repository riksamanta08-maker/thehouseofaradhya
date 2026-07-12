const express = require('express');

const adminController = require('../controllers/admin.controller');
const productController = require('../controllers/product.controller');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/login', adminController.login);
router.get('/site-settings', adminController.getSiteSettings);

router.use(protect, requireRole('ADMIN'));

router.get('/stats', adminController.getStats);
router.get('/owner/site-settings', adminController.getOwnerSiteSettings);
router.get('/owner/products', adminController.listOwnerProducts);
router.patch('/owner/products/:id/visibility', adminController.updateOwnerProductVisibility);
router.patch('/owner/credentials', adminController.updateOwnerCredentials);
router.patch('/site-settings', adminController.updateSiteSettings);

router.get('/products', productController.listProducts);
router.get('/products/export', productController.exportProducts);
router.post('/products/import-csv', productController.importProductsCsv);
router.post('/products/bulk-import', productController.bulkImportProducts);
router.post('/products', productController.createProduct);
router.put('/products/:id', productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);

module.exports = router;

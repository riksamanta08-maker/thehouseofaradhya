const express = require('express');

const productController = require('../controllers/product.controller');

const router = express.Router();

router.get('/', productController.listProducts);
router.get('/export', productController.exportProducts);
router.post('/bulk-import', productController.bulkImportProducts);
router.post('/import-csv', productController.importProductsCsv);
router.get('/:id', productController.getProduct);
router.post('/', productController.createProduct);
router.put('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

module.exports = router;

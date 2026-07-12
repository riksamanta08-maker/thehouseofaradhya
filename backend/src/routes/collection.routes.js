const express = require('express');

const collectionController = require('../controllers/collection.controller');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', collectionController.listCollections);
router.get('/slug/:slug', collectionController.getCollectionBySlug);
router.get('/:id', collectionController.getCollection);
router.post('/', protect, requireRole('ADMIN'), collectionController.createCollection);
router.put('/:id', protect, requireRole('ADMIN'), collectionController.updateCollection);
router.patch('/:id/reorder-products', protect, requireRole('ADMIN'), collectionController.reorderProducts);
router.delete('/:id', protect, requireRole('ADMIN'), collectionController.deleteCollection);

module.exports = router;

const express = require('express');

const inventoryController = require('../controllers/inventory.controller');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireRole('ADMIN'));

router.get('/', inventoryController.listInventory);
router.get('/low', inventoryController.listLowStock);
router.put('/:variantId', inventoryController.updateInventory);

module.exports = router;

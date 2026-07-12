const express = require('express');

const shadeController = require('../controllers/shade.controller');

const router = express.Router();

router.get('/', shadeController.listShades);
router.get('/:id', shadeController.getShade);
router.post('/', shadeController.createShade);
router.put('/:id', shadeController.updateShade);
router.delete('/:id', shadeController.deleteShade);

module.exports = router;

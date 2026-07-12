const express = require('express');

const reviewController = require('../controllers/review.controller');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', reviewController.listReviews);
router.get('/manage', protect, requireRole('ADMIN'), reviewController.listReviews);
router.get('/:id', reviewController.getReview);
router.post('/', protect, reviewController.createReview);
router.put('/:id', protect, reviewController.updateReview);
router.delete('/:id', protect, reviewController.deleteReview);

module.exports = router;

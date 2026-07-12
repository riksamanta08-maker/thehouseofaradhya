const express = require('express');

const userController = require('../controllers/user.controller');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/auth-config', userController.getGoogleAuthConfig);
router.post('/signup', userController.signup);
router.post('/signin', userController.signin);
router.post('/google', userController.googleSignin);
router.post('/firebase-phone', userController.firebasePhoneSignin);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password/:token', userController.resetPassword);

router.get('/me', protect, userController.getProfile);
router.patch('/me', protect, userController.updateProfile);
router.patch('/me/password', protect, userController.changePassword);
router.get('/', protect, requireRole('ADMIN'), userController.listUsers);
router.patch('/:id/role', protect, requireRole('ADMIN'), userController.updateRole);

module.exports = router;

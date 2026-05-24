import { Router } from 'express';
import { body } from 'express-validator';
import auth from '../middleware/auth.js';
import {
  login,
  me,
  register,
  refresh,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], register);

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], login);

router.get('/me', auth, me);

router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Token is required'),
], verifyEmail);
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required'),
], forgotPassword);
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], resetPassword);

export default router;

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { fail, ok, message } from '../utils/http.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';

const signToken = (user) => jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '15m' });

const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

const publicUser = async (userId) => User.findById(userId).populate('workspaces');

export const register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail(res, errors.array()[0].msg, 422, { errors: errors.array() });
  
  const { name, email, password } = req.body;
  const normalizedEmail = email.toLowerCase();
  
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) return fail(res, 'Email is already registered', 409);
  
  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
    isVerified: false,
    verificationToken,
    verificationTokenExpiresAt,
  });

  // Send verification email (non-blocking)
  sendVerificationEmail(normalizedEmail, name, verificationToken).catch(() => {});

  const access = signToken(user);
  const refresh = generateRefreshToken();
  
  user.refreshTokens.push({ token: refresh, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  await user.save();

  setRefreshTokenCookie(res, refresh);
  
  const hydrated = await publicUser(user._id);
  return ok(res, { token: access, refreshToken: refresh, user: hydrated }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail(res, errors.array()[0].msg, 422, { errors: errors.array() });
  
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  
  if (!user || !(await user.comparePassword(password))) {
    return fail(res, 'Invalid email or password', 401);
  }
  
  const access = signToken(user);
  const refresh = generateRefreshToken();

  user.refreshTokens.push({ token: refresh, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  // Clean up old expired refresh tokens
  user.refreshTokens = user.refreshTokens.filter(rt => rt.expiresAt > new Date());
  await user.save();

  setRefreshTokenCookie(res, refresh);

  const hydrated = await publicUser(user._id);
  return ok(res, { token: access, refreshToken: refresh, user: hydrated });
});

export const me = asyncHandler(async (req, res) => {
  const user = await publicUser(req.user.id);
  if (!user) return fail(res, 'User not found', 404);
  return ok(res, { user });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) return fail(res, 'Refresh token required', 401);

  const user = await User.findOne({ 'refreshTokens.token': token });
  if (!user) return fail(res, 'Invalid or expired refresh token', 401);

  const matchedToken = user.refreshTokens.find(rt => rt.token === token);
  if (!matchedToken || matchedToken.expiresAt < new Date()) {
    // Revoke all refresh tokens if reuse/expired token is detected
    user.refreshTokens = [];
    await user.save();
    res.clearCookie('refreshToken');
    return fail(res, 'Token expired or reuse detected. Please log in again.', 401);
  }

  // Generate new tokens (Rotation)
  const access = signToken(user);
  const nextRefresh = generateRefreshToken();

  // Replace old refresh token with the new rotated one
  user.refreshTokens = user.refreshTokens.filter(rt => rt.token !== token);
  user.refreshTokens.push({ token: nextRefresh, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  await user.save();

  setRefreshTokenCookie(res, nextRefresh);

  const hydrated = await publicUser(user._id);
  return ok(res, { token: access, refreshToken: nextRefresh, user: hydrated });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (token) {
    await User.updateOne(
      { 'refreshTokens.token': token },
      { $pull: { refreshTokens: { token } } }
    );
  }
  res.clearCookie('refreshToken');
  return message(res, 'Logged out successfully');
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return fail(res, 'Token is required', 422);

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpiresAt: { $gt: new Date() }
  });

  if (!user) {
    return fail(res, 'Verification link is invalid or has expired', 400);
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiresAt = undefined;
  await user.save();

  return message(res, 'Email verified successfully');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return fail(res, 'Email is required', 422);

  const user = await User.findOne({ email: email.toLowerCase() });
  // For security, do not reveal if user does not exist
  if (!user) return message(res, 'If this email exists, a password reset link has been sent');

  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = token;
  user.passwordResetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  sendPasswordResetEmail(user.email, user.name, token).catch(() => {});

  return message(res, 'If this email exists, a password reset link has been sent');
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return fail(res, 'Token and password are required', 422);
  if (password.length < 6) return fail(res, 'Password must be at least 6 characters', 422);

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetTokenExpiresAt: { $gt: new Date() }
  });

  if (!user) {
    return fail(res, 'Reset link is invalid or has expired', 400);
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetToken = undefined;
  user.passwordResetTokenExpiresAt = undefined;
  // Revoke all refresh tokens on password change for security
  user.refreshTokens = [];
  await user.save();

  return message(res, 'Password has been reset successfully. Please log in.');
});

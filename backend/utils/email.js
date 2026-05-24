import nodemailer from 'nodemailer';
import logger from './logger.js';

const getTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: { user, pass }
  });
};

export const sendEmail = async ({ to, subject, text, html }) => {
  const transporter = getTransporter();
  const from = process.env.EMAIL_USER || 'noreply@devcollab.com';
  
  if (!transporter) {
    logger.warn(`Email not sent (credentials missing in environment). To: ${to}, Subject: ${subject}`);
    logger.info(`EMAIL CONTENTS:\n-------------------\nSubject: ${subject}\nTo: ${to}\nText: ${text}\n-------------------`);
    return { mock: true };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending email to ${to}: ${error.message}`);
    throw error;
  }
};

export const sendVerificationEmail = async (email, name, token) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const url = `${clientUrl}/verify-email/${token}`;
  const text = `Hi ${name},\n\nPlease verify your email by clicking the link: ${url}\n\nThanks,\nDevCollab Team`;
  const html = `<p>Hi ${name},</p><p>Please verify your email by clicking the link below:</p><p><a href="${url}">${url}</a></p><p>Thanks,<br/>DevCollab Team</p>`;
  return sendEmail({ to: email, subject: 'Verify your email - DevCollab', text, html });
};

export const sendPasswordResetEmail = async (email, name, token) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const url = `${clientUrl}/reset-password/${token}`;
  const text = `Hi ${name},\n\nYou requested a password reset. Reset your password by clicking the link: ${url}\n\nThis link is valid for 1 hour.\n\nThanks,\nDevCollab Team`;
  const html = `<p>Hi ${name},</p><p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p><p>This link is valid for 1 hour.</p><p>Thanks,<br/>DevCollab Team</p>`;
  return sendEmail({ to: email, subject: 'Reset your password - DevCollab', text, html });
};

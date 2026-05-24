import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },
  skills: [{ type: String }],
  githubUrl: { type: String, default: '' },
  workspaces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }],
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  verificationTokenExpiresAt: Date,
  passwordResetToken: String,
  passwordResetTokenExpiresAt: Date,
  refreshTokens: [{
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  }],
  notificationPreferences: {
    taskAssignment: { type: Boolean, default: true },
    commentMention: { type: Boolean, default: true },
    inviteAccepted: { type: Boolean, default: true },
    taskMoved: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },
});

userSchema.method('comparePassword', function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
});

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);

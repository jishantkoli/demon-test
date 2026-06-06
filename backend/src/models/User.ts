import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  username: { type: String, unique: true, sparse: true },
  passwordHash: { type: String, select: false },
  role: { 
    type: String, 
    enum: ['admin', 'reviewer', 'functionary', 'teacher'], 
    required: true 
  },
  profile: {
    fullName: { type: String, required: true },
    phone: String,
    schoolName: String,
    schoolCode: String,
    district: String,
  },
  assignedLevels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Level' }],
  isActive: { type: Boolean, default: true },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Number },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

userSchema.index({ role: 1 });

// Method to compare password
userSchema.methods.comparePassword = async function(password: string) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

export const User = mongoose.model('User', userSchema);

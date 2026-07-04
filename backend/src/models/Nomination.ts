import mongoose from 'mongoose';

const nominationSchema = new mongoose.Schema({
  form_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },
  functionary_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teacher_name: { type: String, required: true },
  teacher_email: { type: String, required: true, index: true },
  teacher_phone: { type: String },
  school_code: { type: String, required: true, index: true },
  link_type: { type: String, enum: ['otp', 'direct'], default: 'otp' },
  status: { type: String, enum: ['pending', 'invited', 'in_progress', 'completed'], default: 'pending', index: true },
  unique_token: { type: String, unique: true },
  invited_at: { type: Date },
  reminder_count: { type: Number, default: 0 },
  last_reminder_at: { type: Date },
  additional_data: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

// Generate unique token before saving
nominationSchema.pre('save', function() {
  if (!this.unique_token) {
    this.unique_token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
});

export const Nomination = mongoose.model('Nomination', nominationSchema);

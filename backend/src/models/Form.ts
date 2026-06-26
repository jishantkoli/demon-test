import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['text', 'textarea', 'number', 'email', 'phone', 'date', 'dropdown', 'radio', 'checkbox', 'file', 'mcq'], 
    required: true 
  },
  required: { type: Boolean, default: false },
  placeholder: String,
  options: [String],
  maxLength: Number,
  fileTypes: String,
  maxSizeMB: Number,
  // quiz
  correct: mongoose.Schema.Types.Mixed,
  marks: Number,
  negative: Number,
  reviewer_max_marks: { type: Number, default: 0 },
  // branching
  visibleIf: {
    fieldId: String,
    op: { type: String, enum: ['eq', 'neq', 'in'] },
    value: mongoose.Schema.Types.Mixed
  }
});

const sectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  fields: [fieldSchema],
  visibleIf: {
    fieldId: String,
    op: { type: String, enum: ['eq', 'neq', 'in'] },
    value: mongoose.Schema.Types.Mixed
  }
});

const formSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  formType: { type: String, enum: ['normal', 'nomination', 'branching', 'quiz', 'multi'], default: 'normal' },
  status: { type: String, enum: ['active', 'expired', 'draft'], default: 'draft' },
  form_schema: {
    sections: [sectionSchema]
  },
  expiresAt: Date,
  allowEdit: { type: Boolean, default: false },
  shareableLink: { type: String, unique: true },
  settings: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// BOLT OPTIMIZATION: Index for dashboard stats filtering
formSchema.index({ status: 1 });
formSchema.index({ adminId: 1 });

export const Form = mongoose.model('Form', formSchema);

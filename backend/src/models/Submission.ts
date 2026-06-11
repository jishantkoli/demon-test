import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },
  nominationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Nomination' },
  nominationToken: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  userName: String,
  userEmail: String,
   schoolCode: { type: String, index: true },
   formTitle: String,
  isDraft: { type: Boolean, default: false },
  responses: [{
    fieldId: String,
    value: mongoose.Schema.Types.Mixed
  }],
  files: [{
    fieldId: String,
    originalName: String,
    storedPath: String,
    mimeType: String,
    sizeBytes: Number
  }],
  submittedAt: { type: Date, default: Date.now },
  lastEditedAt: Date,
  currentLevel: { type: Number, default: 0 },
  reviews: [{
    levelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Level' },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewerName: String,
    marksGiven: Number,
    gradeGiven: String,
    description: String,
    reviewedAt: { type: Date, default: Date.now }
  }],
  score: {
    totalPoints: Number,
    earnedPoints: Number,
    percentage: Number,
    passed: Boolean
  },
  averageMarks: Number,
  finalGrade: String,
  status: { type: String, enum: ['pending', 'submitted', 'under_review', 'approved', 'rejected'], default: 'pending', index: true },
  metadata: {
    ip: String,
    userAgent: String
  }
}, { timestamps: true });

export const Submission = mongoose.model('Submission', submissionSchema);

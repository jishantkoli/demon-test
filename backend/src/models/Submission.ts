import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true },
  nominationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Nomination' },
  nominationToken: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  userEmail: String,
   schoolCode: String,
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
  status: { type: String, enum: ['pending', 'submitted', 'under_review', 'approved', 'rejected'], default: 'pending' },
  metadata: {
    ip: String,
    userAgent: String
  }
}, { timestamps: true });

// Performance Indexes
submissionSchema.index({ formId: 1 });
submissionSchema.index({ userId: 1 });
submissionSchema.index({ schoolCode: 1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ createdAt: -1 }); // For recent submissions list

export const Submission = mongoose.model('Submission', submissionSchema);

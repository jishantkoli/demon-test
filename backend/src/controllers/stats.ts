import { Response } from 'express';
import { User } from '../models/User.js';
import { Form } from '../models/Form.js';
import { Submission } from '../models/Submission.js';
import { Nomination } from '../models/Nomination.js';
import { AuthRequest } from '../middleware/auth.js';

export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const userId = req.user?._id;
    const email = req.user?.email;

    let formQuery: any = {};
    let subQuery: any = {};

    if (role === 'admin') {
      // Admin sees everything
    } else if (role === 'teacher') {
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      });
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      formQuery.status = 'active';
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      formQuery.status = 'active';
      subQuery.schoolCode = req.user.school_code;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
      // Reviewers see submissions they need to review
    }

    // Optimized: Use aggregation with $facet to reduce database roundtrips from 17+ to just 4.
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            byRole: [{ $group: { _id: "$role", count: { $sum: 1 } } }]
          }
        }
      ]),
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            active: [{ $match: { status: 'active' } }, { $count: "count" }],
            draft: [{ $match: { status: 'draft' } }, { $count: "count" }],
            expired: [{ $match: { status: 'expired' } }, { $count: "count" }]
          }
        }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }]
          }
        }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }]
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Extract User Stats
    const u = userStats[0];
    const totalUsers = u.total[0]?.count || 0;
    const usersByRole = {
      admin: u.byRole.find((r: any) => r._id === 'admin')?.count || 0,
      reviewer: u.byRole.find((r: any) => r._id === 'reviewer')?.count || 0,
      functionary: u.byRole.find((r: any) => r._id === 'functionary')?.count || 0,
      teacher: u.byRole.find((r: any) => r._id === 'teacher')?.count || 0,
    };

    // Extract Form Stats
    const f = formStats[0];
    const activeForms = f.active[0]?.count || 0;
    const draftForms = f.draft[0]?.count || 0;
    const expiredForms = f.expired[0]?.count || 0;

    // Extract Submission Stats
    const s = submissionStats[0];
    const totalSubmissions = s.total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: s.byStatus.find((st: any) => st._id === 'submitted')?.count || 0,
      under_review: s.byStatus.find((st: any) => st._id === 'under_review')?.count || 0,
      approved: s.byStatus.find((st: any) => st._id === 'approved')?.count || 0,
      rejected: s.byStatus.find((st: any) => st._id === 'rejected')?.count || 0,
    };

    // Extract Nomination Stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStats.length > 0) {
      const n = nominationStats[0];
      totalNominations = n.total[0]?.count || 0;
      nominationsByStatus = {
        pending: n.byStatus.find((st: any) => st._id === 'pending')?.count || 0,
        invited: n.byStatus.find((st: any) => st._id === 'invited')?.count || 0,
        completed: n.byStatus.find((st: any) => st._id === 'completed')?.count || 0,
      };
      if (totalNominations > 0) {
        completionRate = Math.round((nominationsByStatus.completed / totalNominations) * 100);
      }
    }

    res.status(200).json({
      totalUsers,
      activeForms,
      draftForms,
      expiredForms,
      totalSubmissions,
      submissionsByStatus,
      usersByRole,
      totalNominations,
      nominationsByStatus,
      completionRate
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

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

    // ⚡ Bolt Optimization: Use MongoDB aggregation with $facet to reduce database round trips from ~17 to 4.
    // This groups multiple counts into single queries and executes them in parallel.
    const [userStats, formStats, subStats, nomStats] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }]
          }
        }
      ]),
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            active: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draft: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expired: [{ $match: { status: 'expired' } }, { $count: 'count' }]
          }
        }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
          }
        }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
          }
        }
      ]) : Promise.resolve(null)
    ]);

    // Extract stats from aggregation results
    const totalUsers = userStats[0]?.total[0]?.count || 0;
    const usersByRole = {
      admin: userStats[0]?.byRole.find((r: any) => r._id === 'admin')?.count || 0,
      reviewer: userStats[0]?.byRole.find((r: any) => r._id === 'reviewer')?.count || 0,
      functionary: userStats[0]?.byRole.find((r: any) => r._id === 'functionary')?.count || 0,
      teacher: userStats[0]?.byRole.find((r: any) => r._id === 'teacher')?.count || 0,
    };

    const activeForms = formStats[0]?.active[0]?.count || 0;
    const draftForms = formStats[0]?.draft[0]?.count || 0;
    const expiredForms = formStats[0]?.expired[0]?.count || 0;

    const totalSubmissions = subStats[0]?.total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: subStats[0]?.byStatus.find((s: any) => s._id === 'submitted')?.count || 0,
      under_review: subStats[0]?.byStatus.find((s: any) => s._id === 'under_review')?.count || 0,
      approved: subStats[0]?.byStatus.find((s: any) => s._id === 'approved')?.count || 0,
      rejected: subStats[0]?.byStatus.find((s: any) => s._id === 'rejected')?.count || 0,
    };

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nomStats) {
      totalNominations = nomStats[0]?.total[0]?.count || 0;
      nominationsByStatus = {
        pending: nomStats[0]?.byStatus.find((s: any) => s._id === 'pending')?.count || 0,
        invited: nomStats[0]?.byStatus.find((s: any) => s._id === 'invited')?.count || 0,
        completed: nomStats[0]?.byStatus.find((s: any) => s._id === 'completed')?.count || 0,
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

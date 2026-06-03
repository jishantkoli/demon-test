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
      subQuery.schoolCode = req.user.profile?.schoolCode || req.user.school_code;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
    }

    // Parallelize core counts and complex aggregations using Promise.all
    const [
      totalUsers,
      formStats,
      submissionStats,
      usersByRole,
      functionaryStats
    ] = await Promise.all([
      User.countDocuments(),
      // Consolidated Form counts by status using $facet
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
      // Consolidated Submission counts by status and total
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            submitted: [{ $match: { status: 'submitted' } }, { $count: 'count' }],
            under_review: [{ $match: { status: 'under_review' } }, { $count: 'count' }],
            approved: [{ $match: { status: 'approved' } }, { $count: 'count' }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }]
          }
        }
      ]),
      // Users by role
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      // Functionary specific stats (only if role is functionary)
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
            invited: [{ $match: { status: 'invited' } }, { $count: 'count' }],
            completed: [{ $match: { status: 'completed' } }, { $count: 'count' }]
          }
        }
      ]) : Promise.resolve(null)
    ]);

    // Format Form stats
    const fStats = formStats[0];
    const activeForms = fStats.active[0]?.count || 0;
    const draftForms = fStats.draft[0]?.count || 0;
    const expiredForms = fStats.expired[0]?.count || 0;

    // Format Submission stats
    const sStats = submissionStats[0];
    const totalSubmissions = sStats.total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: sStats.submitted[0]?.count || 0,
      under_review: sStats.under_review[0]?.count || 0,
      approved: sStats.approved[0]?.count || 0,
      rejected: sStats.rejected[0]?.count || 0,
    };

    // Format Users by Role
    const roles: any = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    usersByRole.forEach((r: any) => {
      if (roles.hasOwnProperty(r._id)) roles[r._id] = r.count;
    });

    // Format Functionary stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && functionaryStats) {
      const nStats = functionaryStats[0];
      totalNominations = nStats.total[0]?.count || 0;
      nominationsByStatus = {
        pending: nStats.pending[0]?.count || 0,
        invited: nStats.invited[0]?.count || 0,
        completed: nStats.completed[0]?.count || 0,
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
      usersByRole: roles,
      totalNominations,
      nominationsByStatus,
      completionRate
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

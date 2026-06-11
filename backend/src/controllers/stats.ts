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

    if (role === 'teacher') {
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      }).select('form_id');
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      subQuery.schoolCode = req.user.school_code;
    }

    // Parallelize core statistics gathering using MongoDB aggregation facets
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // 1. User stats (Admins only see full breakdown)
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [
              { $group: { _id: '$role', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 2. Form stats
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 3. Submission stats
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 4. Nomination stats (Functionary specific)
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]) : Promise.resolve(null)
    ]);

    // Map User stats
    const totalUsers = userStats[0].total[0]?.count || 0;
    const usersByRole = {
      admin: 0, reviewer: 0, functionary: 0, teacher: 0
    };
    userStats[0].byRole.forEach((r: any) => {
      if (r._id in usersByRole) (usersByRole as any)[r._id] = r.count;
    });

    // Map Form stats
    const formsByStatus: any = { active: 0, draft: 0, expired: 0 };
    formStats[0].byStatus.forEach((s: any) => {
      if (s._id in formsByStatus) formsByStatus[s._id] = s.count;
    });

    // Map Submission stats
    const totalSubmissions = submissionStats[0].total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: 0, under_review: 0, approved: 0, rejected: 0
    };
    submissionStats[0].byStatus.forEach((s: any) => {
      if (s._id in submissionsByStatus) (submissionsByStatus as any)[s._id] = s.count;
    });

    // Map Nomination stats
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (nominationStats) {
      totalNominations = nominationStats[0].total[0]?.count || 0;
      nominationStats[0].byStatus.forEach((s: any) => {
        if (s._id in nominationsByStatus) nominationsByStatus[s._id] = s.count;
      });
      if (totalNominations > 0) {
        completionRate = Math.round((nominationsByStatus.completed / totalNominations) * 100);
      }
    }

    res.status(200).json({
      totalUsers,
      activeForms: formsByStatus.active,
      draftForms: formsByStatus.draft,
      expiredForms: formsByStatus.expired,
      totalSubmissions,
      submissionsByStatus,
      usersByRole,
      totalNominations,
      nominationsByStatus,
      completionRate
    });
  } catch (err: any) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
};

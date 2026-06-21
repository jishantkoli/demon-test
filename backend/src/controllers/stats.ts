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

    // ⚡ Bolt Optimization: Building the initial query context
    if (role === 'teacher' && email) {
      // Use indexed teacher_email for faster lookup
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      }).select('form_id').lean();
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      formQuery.status = 'active'; // Teachers only see active forms
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      formQuery.status = 'active'; // Functionaries only see active forms
      subQuery.schoolCode = req.user.school_code || req.user.profile?.schoolCode;
    } else if (role === 'reviewer') {
      formQuery.status = 'active'; // Reviewers only see active forms
    }

    // ⚡ Bolt Optimization: Using parallelized aggregation facets to reduce DB roundtrips from ~15 to 4.
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // 1. User stats (total and by role)
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }]
          }
        }
      ]),

      // 2. Form stats (filtered by access)
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

      // 3. Submission stats (filtered by access)
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
          }
        }
      ]),

      // 4. Nomination stats (functionary only)
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

    // Extracting and formatting the results
    const usersByRole: any = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userStats[0]?.byRole?.forEach((r: any) => { if (r._id) usersByRole[r._id] = r.count; });
    const totalUsers = userStats[0]?.total[0]?.count || 0;

    const activeForms = formStats[0]?.active[0]?.count || 0;
    const draftForms = formStats[0]?.draft[0]?.count || 0;
    const expiredForms = formStats[0]?.expired[0]?.count || 0;

    const totalSubmissions = submissionStats[0]?.total[0]?.count || 0;
    const submissionsByStatus: any = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    submissionStats[0]?.byStatus?.forEach((s: any) => { if (s._id) submissionsByStatus[s._id] = s.count; });

    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nominationStats) {
      totalNominations = nominationStats[0]?.total[0]?.count || 0;
      nominationStats[0]?.byStatus?.forEach((n: any) => { if (n._id) nominationsByStatus[n._id] = n.count; });
      if (totalNominations > 0) {
        completionRate = Math.round(((nominationsByStatus.completed || 0) / totalNominations) * 100);
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

import { Response } from 'express';
import { User } from '../models/User.js';
import { Form } from '../models/Form.js';
import { Submission } from '../models/Submission.js';
import { Nomination } from '../models/Nomination.js';
import { AuthRequest } from '../middleware/auth.js';

/**
 * Optimized stats controller using parallelized MongoDB aggregation pipelines.
 * This reduces database roundtrips from 15+ down to 4 per request.
 */
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const userId = req.user?._id;
    const email = req.user?.email;

    let formQuery: any = {};
    let subQuery: any = {};

    // Initial query preparation (some roles require a preliminary query)
    if (role === 'admin') {
      // Admin sees everything
    } else if (role === 'teacher') {
      // For teachers, we first find nominations to get assigned forms
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      }).select('form_id');
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      formQuery.status = 'active';
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      formQuery.status = 'active';
      // Use profile school code if available, fallback to user-level school code
      subQuery.schoolCode = req.user.profile?.schoolCode || req.user.school_code;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
    }

    // Execute multiple aggregations in parallel to minimize latency
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // 1. User Stats (Total and Role breakdown)
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

      // 2. Form Stats (Status breakdown)
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

      // 3. Submission Stats (Total and Status breakdown)
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

      // 4. Nomination Stats (Only for Functionaries)
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

    // --- Process Aggregation Results ---
    
    // User processing
    const uResults = userStats[0];
    const totalUsers = uResults.total[0]?.count || 0;
    const usersByRole = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    uResults.byRole.forEach((r: any) => {
      if (r._id in usersByRole) (usersByRole as any)[r._id] = r.count;
    });

    // Form processing
    const fResults = formStats[0];
    const activeForms = fResults.active[0]?.count || 0;
    const draftForms = fResults.draft[0]?.count || 0;
    const expiredForms = fResults.expired[0]?.count || 0;

    // Submission processing
    const sResults = submissionStats[0];
    const totalSubmissions = sResults.total[0]?.count || 0;
    const submissionsByStatus = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    sResults.byStatus.forEach((s: any) => {
      if (s._id in submissionsByStatus) (submissionsByStatus as any)[s._id] = s.count;
    });

    // Nomination processing
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStats) {
      const nResults = nominationStats[0];
      totalNominations = nResults.total[0]?.count || 0;
      nominationsByStatus = { pending: 0, invited: 0, completed: 0 };
      nResults.byStatus.forEach((n: any) => {
        if (n._id in nominationsByStatus) nominationsByStatus[n._id] = n.count;
      });
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

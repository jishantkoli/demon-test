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

    // Optimized stats retrieval using parallel MongoDB aggregation pipelines ($facet)
    // This reduces the number of database roundtrips from ~15 down to 4.
    const [userAgg, formAgg, subAgg, nomAgg] = await Promise.all([
      // 1. User stats (total and by role)
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }]
          }
        }
      ]),
      // 2. Form stats by status
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
      // 3. Submission stats (total and by status)
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
          }
        }
      ]),
      // 4. Nomination stats (if functionary)
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

    // Process User stats
    const totalUsers = userAgg[0].total[0]?.count || 0;
    const usersByRole = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userAgg[0].byRole.forEach((r: any) => {
      if (r._id in usersByRole) usersByRole[r._id as keyof typeof usersByRole] = r.count;
    });

    // Process Form stats
    const activeForms = formAgg[0].active[0]?.count || 0;
    const draftForms = formAgg[0].draft[0]?.count || 0;
    const expiredForms = formAgg[0].expired[0]?.count || 0;

    // Process Submission stats
    const totalSubmissions = subAgg[0].total[0]?.count || 0;
    const submissionsByStatus = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    subAgg[0].byStatus.forEach((s: any) => {
      if (s._id in submissionsByStatus) submissionsByStatus[s._id as keyof typeof submissionsByStatus] = s.count;
    });

    // Process Nomination stats
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nomAgg) {
      totalNominations = nomAgg[0].total[0]?.count || 0;
      nomAgg[0].byStatus.forEach((n: any) => {
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

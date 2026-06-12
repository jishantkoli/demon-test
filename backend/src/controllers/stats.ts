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

    // Bolt Optimization: Use parallel MongoDB aggregation pipelines to reduce database roundtrips.
    // We use $facet to compute multiple counts in a single query per model.
    const [userStatsResults, formStatsResults, submissionStatsResults, nominationStatsResults] = await Promise.all([
      // 1. User stats: total and breakdown by role
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }]
          }
        }
      ]),
      // 2. Form stats: breakdown by status
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
      // 3. Submission stats: total and breakdown by status
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
      // 4. Nomination stats: only if functionary
      role === 'functionary'
        ? Nomination.aggregate([
            { $match: { functionary_id: userId } },
            {
              $facet: {
                total: [{ $count: 'count' }],
                pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
                invited: [{ $match: { status: 'invited' } }, { $count: 'count' }],
                completed: [{ $match: { status: 'completed' } }, { $count: 'count' }]
              }
            }
          ])
        : Promise.resolve([])
    ]);

    // Helper to extract count from facet result
    const getCount = (facetResult: any[], key: string) => facetResult[0]?.[key]?.[0]?.count || 0;

    const totalUsers = userStatsResults[0]?.total[0]?.count || 0;
    const usersByRole: any = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userStatsResults[0]?.byRole?.forEach((r: any) => {
      if (r._id) usersByRole[r._id] = r.count;
    });

    const activeForms = getCount(formStatsResults, 'active');
    const draftForms = getCount(formStatsResults, 'draft');
    const expiredForms = getCount(formStatsResults, 'expired');

    const totalSubmissions = getCount(submissionStatsResults, 'total');
    const submissionsByStatus = {
      submitted: getCount(submissionStatsResults, 'submitted'),
      under_review: getCount(submissionStatsResults, 'under_review'),
      approved: getCount(submissionStatsResults, 'approved'),
      rejected: getCount(submissionStatsResults, 'rejected'),
    };

    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nominationStatsResults.length > 0) {
      totalNominations = getCount(nominationStatsResults, 'total');
      nominationsByStatus = {
        pending: getCount(nominationStatsResults, 'pending'),
        invited: getCount(nominationStatsResults, 'invited'),
        completed: getCount(nominationStatsResults, 'completed'),
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

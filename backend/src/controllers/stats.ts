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

    // Optimized: Execute database queries in parallel and use aggregations to reduce roundtrips
    const [userStatsResult, formStatsResult, submissionStatsResult, nominationStatsResult] = await Promise.all([
      // 1. User Statistics (Total and by Role)
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }]
          }
        }
      ]),
      // 2. Form Statistics (Categorized by status)
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
      // 3. Submission Statistics (Total and by Status)
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
          }
        }
      ]),
      // 4. Nomination Statistics (Only for functionaries)
      role === 'functionary'
        ? Nomination.aggregate([
            { $match: { functionary_id: userId } },
            {
              $facet: {
                total: [{ $count: 'count' }],
                byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
              }
            }
          ])
        : Promise.resolve([])
    ]);

    // --- Process User Stats ---
    const totalUsers = userStatsResult[0].total[0]?.count || 0;
    const usersByRole: any = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userStatsResult[0].byRole.forEach((item: any) => {
      if (item._id) usersByRole[item._id] = item.count;
    });

    // --- Process Form Stats ---
    const activeForms = formStatsResult[0].active[0]?.count || 0;
    const draftForms = formStatsResult[0].draft[0]?.count || 0;
    const expiredForms = formStatsResult[0].expired[0]?.count || 0;

    // --- Process Submission Stats ---
    const totalSubmissions = submissionStatsResult[0].total[0]?.count || 0;
    const submissionsByStatus: any = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    submissionStatsResult[0].byStatus.forEach((item: any) => {
      if (item._id) submissionsByStatus[item._id] = item.count;
    });

    // --- Process Nomination Stats ---
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nominationStatsResult.length > 0) {
      totalNominations = nominationStatsResult[0].total[0]?.count || 0;
      nominationStatsResult[0].byStatus.forEach((item: any) => {
        if (item._id) nominationsByStatus[item._id] = item.count;
      });
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

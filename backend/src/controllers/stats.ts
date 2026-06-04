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

    // BOLT OPTIMIZATION: Use parallel aggregation pipelines ($facet) to reduce DB roundtrips from 15+ to 4.
    const [
      userStats,
      formStats,
      submissionStats,
      nominationStats
    ] = await Promise.all([
      // 1. User stats (Total and by Role)
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: 'count' }],
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
            active: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draft: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expired: [{ $match: { status: 'expired' } }, { $count: 'count' }]
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
      // 4. Nomination stats (Only for functionaries or admins)
      (role === 'functionary' || role === 'admin')
        ? Nomination.aggregate([
            { $match: role === 'functionary' ? { functionary_id: userId } : {} },
            {
              $facet: {
                total: [{ $count: 'count' }],
                byStatus: [
                  { $group: { _id: '$status', count: { $sum: 1 } } }
                ]
              }
            }
          ])
        : Promise.resolve([{ total: [], byStatus: [] }])
    ]);

    // Parse results
    const totalUsers = userStats[0].totalUsers[0]?.count || 0;
    const usersByRole = {
      admin: userStats[0].byRole.find((r: any) => r._id === 'admin')?.count || 0,
      reviewer: userStats[0].byRole.find((r: any) => r._id === 'reviewer')?.count || 0,
      functionary: userStats[0].byRole.find((r: any) => r._id === 'functionary')?.count || 0,
      teacher: userStats[0].byRole.find((r: any) => r._id === 'teacher')?.count || 0,
    };

    const activeForms = formStats[0].active[0]?.count || 0;
    const draftForms = formStats[0].draft[0]?.count || 0;
    const expiredForms = formStats[0].expired[0]?.count || 0;

    const totalSubmissions = submissionStats[0].total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: submissionStats[0].byStatus.find((s: any) => s._id === 'submitted')?.count || 0,
      under_review: submissionStats[0].byStatus.find((s: any) => s._id === 'under_review')?.count || 0,
      approved: submissionStats[0].byStatus.find((s: any) => s._id === 'approved')?.count || 0,
      rejected: submissionStats[0].byStatus.find((s: any) => s._id === 'rejected')?.count || 0,
    };

    const totalNominations = nominationStats[0].total[0]?.count || 0;
    const nominationsByStatus = {
      pending: nominationStats[0].byStatus.find((n: any) => n._id === 'pending')?.count || 0,
      invited: nominationStats[0].byStatus.find((n: any) => n._id === 'invited')?.count || 0,
      completed: nominationStats[0].byStatus.find((n: any) => n._id === 'completed')?.count || 0,
    };

    const completionRate = totalNominations > 0
      ? Math.round((nominationsByStatus.completed / totalNominations) * 100)
      : 0;

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

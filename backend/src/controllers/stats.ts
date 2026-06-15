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
      // Reviewers see submissions they need to review
    }

    // Parallel execution of independent aggregation pipelines
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // 1. User Statistics
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: 'count' }],
            usersByRole: [
              { $group: { _id: '$role', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 2. Form Statistics
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            activeForms: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draftForms: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expiredForms: [{ $match: { status: 'expired' } }, { $count: 'count' }]
          }
        }
      ]),

      // 3. Submission Statistics
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            totalSubmissions: [{ $count: 'count' }],
            submissionsByStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 4. Nomination Statistics (only if functionary)
      role === 'functionary'
        ? Nomination.aggregate([
            { $match: { functionary_id: userId } },
            {
              $facet: {
                totalNominations: [{ $count: 'count' }],
                nominationsByStatus: [
                  { $group: { _id: '$status', count: { $sum: 1 } } }
                ]
              }
            }
          ])
        : Promise.resolve(null)
    ]);

    // Map User Stats
    const totalUsers = userStats[0].totalUsers[0]?.count || 0;
    const usersByRole = {
      admin: 0,
      reviewer: 0,
      functionary: 0,
      teacher: 0
    };
    userStats[0].usersByRole.forEach((r: any) => {
      if (r._id in usersByRole) usersByRole[r._id as keyof typeof usersByRole] = r.count;
    });

    // Map Form Stats
    const activeForms = formStats[0].activeForms[0]?.count || 0;
    const draftForms = formStats[0].draftForms[0]?.count || 0;
    const expiredForms = formStats[0].expiredForms[0]?.count || 0;

    // Map Submission Stats
    const totalSubmissions = submissionStats[0].totalSubmissions[0]?.count || 0;
    const submissionsByStatus = {
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0
    };
    submissionStats[0].submissionsByStatus.forEach((s: any) => {
      if (s._id in submissionsByStatus) submissionsByStatus[s._id as keyof typeof submissionsByStatus] = s.count;
    });

    // Map Nomination Stats
    let totalNominations = 0;
    let nominationsByStatus: any = {
      pending: 0,
      invited: 0,
      completed: 0
    };
    let completionRate = 0;

    if (nominationStats && nominationStats[0]) {
      totalNominations = nominationStats[0].totalNominations[0]?.count || 0;
      nominationStats[0].nominationsByStatus.forEach((n: any) => {
        if (n._id in nominationsByStatus) nominationsByStatus[n._id] = n.count;
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

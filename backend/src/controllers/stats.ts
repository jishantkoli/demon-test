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

    // ⚡ Optimization: Parallelize independent queries using Promise.all and MongoDB aggregation $facet
    // This reduces database round-trips from 15+ to just 4.
    const [
      usersStats,
      formsStats,
      submissionsStats,
      nominationsStats
    ] = await Promise.all([
      // Users by role stats
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
      // Forms by status stats
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
      // Submissions by status stats
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
      // Nominations stats (for functionaries)
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

    // Process Users Stats
    const totalUsers = usersStats[0].total[0]?.count || 0;
    const usersByRole = {
      admin: 0,
      reviewer: 0,
      functionary: 0,
      teacher: 0
    };
    usersStats[0].byRole.forEach((item: any) => {
      if (item._id in usersByRole) {
        (usersByRole as any)[item._id] = item.count;
      }
    });

    // Process Forms Stats
    const activeForms = formsStats[0].active[0]?.count || 0;
    const draftForms = formsStats[0].draft[0]?.count || 0;
    const expiredForms = formsStats[0].expired[0]?.count || 0;

    // Process Submissions Stats
    const totalSubmissions = submissionsStats[0].total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0
    };
    submissionsStats[0].byStatus.forEach((item: any) => {
      if (item._id in submissionsByStatus) {
        (submissionsByStatus as any)[item._id] = item.count;
      }
    });

    // Process Nominations Stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationsStats) {
      totalNominations = nominationsStats[0].total[0]?.count || 0;
      nominationsByStatus = {
        pending: 0,
        invited: 0,
        completed: 0
      };
      nominationsStats[0].byStatus.forEach((item: any) => {
        if (item._id in nominationsByStatus) {
          nominationsByStatus[item._id] = item.count;
        }
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

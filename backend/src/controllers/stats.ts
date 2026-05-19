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
      // Keep this sequential as formQuery depends on it
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      }).select('form_id');
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      formQuery.status = 'active';
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      formQuery.status = 'active';
      subQuery.schoolCode = req.user.school_code || req.user.profile?.schoolCode;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
      // Reviewers see submissions they need to review
    }

    // Optimize: Use parallel execution and $facet to reduce DB roundtrips from ~18 to 4
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // User stats in one trip
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
      // Form stats in one trip
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
      // Submission stats in one trip
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
      // Nomination stats (only for functionary) in one trip
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
      ]) : Promise.resolve([])
    ]);

    // Helper to extract count from $facet result
    const getCount = (facetResult: any, key: string) => facetResult[0]?.[key]?.[0]?.count || 0;

    const totalUsers = getCount(userStats, 'total');
    const activeForms = getCount(formStats, 'active');
    const draftForms = getCount(formStats, 'draft');
    const expiredForms = getCount(formStats, 'expired');
    const totalSubmissions = getCount(submissionStats, 'total');

    // Submissions by status
    const submissionsByStatus = {
      submitted: getCount(submissionStats, 'submitted'),
      under_review: getCount(submissionStats, 'under_review'),
      approved: getCount(submissionStats, 'approved'),
      rejected: getCount(submissionStats, 'rejected'),
    };

    // Users by role
    const usersByRole: any = {
      admin: 0,
      reviewer: 0,
      functionary: 0,
      teacher: 0
    };
    userStats[0]?.byRole?.forEach((r: any) => {
      if (r._id) usersByRole[r._id] = r.count;
    });

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      totalNominations = getCount(nominationStats, 'total');
      nominationsByStatus = {
        pending: getCount(nominationStats, 'pending'),
        invited: getCount(nominationStats, 'invited'),
        completed: getCount(nominationStats, 'completed'),
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

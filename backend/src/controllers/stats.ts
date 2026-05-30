import { Response } from 'express';
import { User } from '../models/User.js';
import { Form } from '../models/Form.js';
import { Submission } from '../models/Submission.js';
import { Nomination } from '../models/Nomination.js';
import { AuthRequest } from '../middleware/auth.js';

import { Review } from '../models/Review.js';

export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const userId = req.user?._id;
    const email = req.user?.email;

    // Build base queries based on role
    let formMatch: any = {};
    let subMatch: any = {};
    let reviewMatch: any = {};

    if (role === 'admin') {
      // Admin sees everything
    } else if (role === 'teacher') {
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      });
      const assignedFormIds = nominations.map(n => n.form_id);
      formMatch._id = { $in: assignedFormIds };
      formMatch.status = 'active';
      subMatch.userId = userId;
    } else if (role === 'functionary') {
      formMatch.status = 'active';
      subMatch.schoolCode = req.user.school_code || req.user.profile?.schoolCode;
    } else if (role === 'reviewer') {
      formMatch.status = 'active';
      reviewMatch.reviewer_id = userId;
    }

    // Optimization: Parallelize all database queries and use aggregation facets to reduce roundtrips
    const [userStats, formStats, subStats, reviewStats, nominationStats] = await Promise.all([
      // 1. User stats (mostly for admin)
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
        { $match: formMatch },
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
        { $match: subMatch },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 4. Review stats
      Review.aggregate([
        { $match: reviewMatch },
        {
          $facet: {
            pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
            completed: [{ $match: { status: { $in: ['approved', 'rejected'] } } }, { $count: 'count' }]
          }
        }
      ]),

      // 5. Nomination stats (for functionaries)
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
      ]) : Promise.resolve(null)
    ]);

    // Helper to extract count from facet result
    const getCount = (facetResult: any, key: string) => facetResult[0]?.[key]?.[0]?.count || 0;
    
    // Map submissions by status
    const submissionsByStatus: any = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    subStats[0]?.byStatus?.forEach((item: any) => {
      if (item._id) submissionsByStatus[item._id] = item.count;
    });

    // Map users by role
    const usersByRole: any = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userStats[0]?.byRole?.forEach((item: any) => {
      if (item._id) usersByRole[item._id] = item.count;
    });

    // Extract nomination stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStats) {
      totalNominations = nominationStats[0]?.total[0]?.count || 0;
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
      totalUsers: userStats[0]?.total[0]?.count || 0,
      activeForms: getCount(formStats, 'active'),
      draftForms: getCount(formStats, 'draft'),
      expiredForms: getCount(formStats, 'expired'),
      totalSubmissions: subStats[0]?.total[0]?.count || 0,
      submissionsByStatus,
      usersByRole,
      totalNominations,
      nominationsByStatus,
      completionRate,
      pendingReviews: getCount(reviewStats, 'pending'),
      completedReviews: getCount(reviewStats, 'completed')
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

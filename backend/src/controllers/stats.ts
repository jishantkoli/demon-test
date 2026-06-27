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

    // For teacher role, we need to fetch nominations first to determine assigned forms.
    // This results in one extra sequential query for teachers, but it's still significantly
    // faster than the previous sequential countDocuments approach.
    if (role === 'teacher') {
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      });
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      formQuery.status = 'active';
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      formQuery.status = 'active';
      // Use profile schoolCode with fallback to top-level school_code
      subQuery.schoolCode = req.user.profile?.schoolCode || req.user.school_code;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
      // Reviewers see submissions they need to review
    }

    // Performance Optimization: ⚡ Use Promise.all and MongoDB aggregation facets to
    // parallelize data fetching and reduce database roundtrips from 13+ to 3-4.
    const [userAggregate, formAggregate, submissionAggregate, nominationAggregate] = await Promise.all([
      // 1. User stats: Total count and breakdown by role
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }]
          }
        }
      ]),
      // 2. Form stats: Counts for active, draft, and expired forms based on role-based query
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
      // 3. Submission stats: Total count and breakdown by status based on role-based query
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
          }
        }
      ]),
      // 4. Nomination stats: Only relevant for functionaries
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Extract results from aggregation facets with safe defaults
    const userStats = userAggregate[0] || { total: [], byRole: [] };
    const formStats = formAggregate[0] || { active: [], draft: [], expired: [] };
    const submissionStats = submissionAggregate[0] || { total: [], byStatus: [] };
    const nominationStats = nominationAggregate[0];

    // Map users by role into the expected object structure
    const usersByRole = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userStats.byRole.forEach((r: any) => {
      if (r._id in usersByRole) usersByRole[r._id as keyof typeof usersByRole] = r.count;
    });

    // Map submissions by status into the expected object structure
    const submissionsByStatus = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    submissionStats.byStatus.forEach((s: any) => {
      if (s._id in submissionsByStatus) submissionsByStatus[s._id as keyof typeof submissionsByStatus] = s.count;
    });

    // Handle functionary specific statistics
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStats) {
      totalNominations = nominationStats.total?.[0]?.count || 0;
      nominationsByStatus = { pending: 0, invited: 0, completed: 0 };
      nominationStats.byStatus?.forEach((n: any) => {
        if (n._id in nominationsByStatus) nominationsByStatus[n._id] = n.count;
      });
      if (totalNominations > 0) {
        completionRate = Math.round((nominationsByStatus.completed / totalNominations) * 100);
      }
    }

    res.status(200).json({
      totalUsers: userStats.total?.[0]?.count || 0,
      activeForms: formStats.active?.[0]?.count || 0,
      draftForms: formStats.draft?.[0]?.count || 0,
      expiredForms: formStats.expired?.[0]?.count || 0,
      totalSubmissions: submissionStats.total?.[0]?.count || 0,
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

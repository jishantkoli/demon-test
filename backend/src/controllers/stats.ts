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
      subQuery.schoolCode = req.user.school_code || req.user.profile?.schoolCode;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
    }

    // Parallelize database queries to reduce latency
    // We use aggregation facets and grouping to fetch multiple counts in a single round-trip per model
    const [
      userStats,
      formStats,
      submissionStats,
      nominationStats
    ] = await Promise.all([
      // 1. User Stats (Total and by Role)
      User.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            byRole: [{ $group: { _id: "$role", count: { $sum: 1 } } }]
          }
        }
      ]),
      // 2. Form Stats (Grouped by status)
      Form.aggregate([
        { $match: formQuery },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      // 3. Submission Stats (Total and grouped by status)
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }]
          }
        }
      ]),
      // 4. Nomination Stats (for Functionary role)
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]) : Promise.resolve([])
    ]);

    // Process User Stats
    const totalUsers = userStats[0]?.total[0]?.count || 0;
    const usersByRole: any = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userStats[0]?.byRole?.forEach((r: any) => {
      if (usersByRole.hasOwnProperty(r._id)) {
        usersByRole[r._id] = r.count;
      }
    });

    // Process Form Stats
    let activeForms = 0, draftForms = 0, expiredForms = 0;
    formStats.forEach((f: any) => {
      if (f._id === 'active') activeForms = f.count;
      else if (f._id === 'draft') draftForms = f.count;
      else if (f._id === 'expired') expiredForms = f.count;
    });

    // Process Submission Stats
    const totalSubmissions = submissionStats[0]?.total[0]?.count || 0;
    const submissionsByStatus: any = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    submissionStats[0]?.byStatus?.forEach((s: any) => {
      if (submissionsByStatus.hasOwnProperty(s._id)) {
        submissionsByStatus[s._id] = s.count;
      }
    });

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary') {
      nominationStats.forEach((n: any) => {
        totalNominations += n.count;
        if (nominationsByStatus.hasOwnProperty(n._id)) {
          nominationsByStatus[n._id] = n.count;
        }
      });
      if (totalNominations > 0) {
        completionRate = Math.round((nominationsByStatus.completed / totalNominations) * 100);
      }
    }

    // Compatibility: Adding missing fields expected by frontend dashboard
    const pendingReviews = submissionsByStatus.under_review + (submissionsByStatus.submitted || 0);
    const completedReviews = (submissionsByStatus.approved || 0) + (submissionsByStatus.rejected || 0);

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
      completionRate,
      pendingReviews,
      completedReviews
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

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

    // Use Promise.all to run all aggregations in parallel
    // and replace sequential countDocuments with $facet for better performance
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // 1. User Stats (Total and by Role)
      User.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            roles: [
              { $group: { _id: "$role", count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 2. Form Stats (Active, Draft, Expired based on role query)
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            active: [{ $match: { status: 'active' } }, { $count: "count" }],
            draft: [{ $match: { status: 'draft' } }, { $count: "count" }],
            expired: [{ $match: { status: 'expired' } }, { $count: "count" }]
          }
        }
      ]),

      // 3. Submission Stats (Total and by Status based on role query)
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStatus: [
              { $group: { _id: "$status", count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 4. Nomination Stats (Functionary only)
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStatus: [
              { $group: { _id: "$status", count: { $sum: 1 } } }
            ]
          }
        }
      ]) : Promise.resolve(null)
    ]);

    // Process User Stats
    const totalUsers = userStats[0]?.total[0]?.count || 0;
    const usersByRole = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    userStats[0]?.roles?.forEach((r: any) => {
      if (r._id in usersByRole) (usersByRole as any)[r._id] = r.count;
    });

    // Process Form Stats
    const activeForms = formStats[0]?.active[0]?.count || 0;
    const draftForms = formStats[0]?.draft[0]?.count || 0;
    const expiredForms = formStats[0]?.expired[0]?.count || 0;

    // Process Submission Stats
    const totalSubmissions = submissionStats[0]?.total[0]?.count || 0;
    const submissionsByStatus = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    submissionStats[0]?.byStatus?.forEach((s: any) => {
      if (s._id in submissionsByStatus) (submissionsByStatus as any)[s._id] = s.count;
    });

    // Process Nomination Stats
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nominationStats) {
      totalNominations = nominationStats[0]?.total[0]?.count || 0;
      nominationStats[0]?.byStatus?.forEach((n: any) => {
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

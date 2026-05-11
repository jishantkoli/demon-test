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

    // Optimized: Consolidate multiple count queries into parallel aggregation pipelines
    // This reduces database roundtrips from ~17 to 4-5.
    const [usersData, formsData, subsData, nomData] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            roles: [{ $group: { _id: "$role", count: { $sum: 1 } } }]
          }
        }
      ]),
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
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: "count" }],
            statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }]
          }
        }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }]
          }
        }
      ]) : Promise.resolve(null)
    ]);

    // Process User Stats
    const totalUsers = usersData[0].total[0]?.count || 0;
    const usersByRole = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    usersData[0].roles.forEach((r: any) => {
      if (r._id in usersByRole) usersByRole[r._id as keyof typeof usersByRole] = r.count;
    });

    // Process Form Stats
    const activeForms = formsData[0].active[0]?.count || 0;
    const draftForms = formsData[0].draft[0]?.count || 0;
    const expiredForms = formsData[0].expired[0]?.count || 0;

    // Process Submission Stats
    const totalSubmissions = subsData[0].total[0]?.count || 0;
    const submissionsByStatus = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
    subsData[0].statuses.forEach((s: any) => {
      if (s._id in submissionsByStatus) submissionsByStatus[s._id as keyof typeof submissionsByStatus] = s.count;
    });

    // Process Nomination Stats (Functionary only)
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nomData) {
      totalNominations = nomData[0].total[0]?.count || 0;
      nomData[0].statuses.forEach((n: any) => {
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

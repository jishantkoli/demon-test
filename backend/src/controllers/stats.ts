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

    // BOLT OPTIMIZATION: Use Promise.all to parallelize counts and aggregation for status/role breakdown.
    // This reduces the number of sequential database round-trips from ~15 to ~5.
    const [
      totalUsers,
      activeForms,
      draftForms,
      expiredForms,
      totalSubmissions,
      subStatusCounts,
      userRoleCounts
    ] = await Promise.all([
      User.countDocuments(),
      Form.countDocuments({ ...formQuery, status: 'active' }),
      Form.countDocuments({ ...formQuery, status: 'draft' }),
      Form.countDocuments({ ...formQuery, status: 'expired' }),
      Submission.countDocuments(subQuery),
      Submission.aggregate([
        { $match: subQuery },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } }
      ])
    ]);

    // Map aggregation results back to objects
    const submissionsByStatus: any = {
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0
    };
    subStatusCounts.forEach(item => {
      if (item._id) submissionsByStatus[item._id] = item.count;
    });

    const usersByRole: any = {
      admin: 0,
      reviewer: 0,
      functionary: 0,
      teacher: 0
    };
    userRoleCounts.forEach(item => {
      if (item._id) usersByRole[item._id] = item.count;
    });

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = {
      pending: 0,
      invited: 0,
      completed: 0
    };
    let completionRate = 0;

    if (role === 'functionary') {
      const [totalNom, nomStatusCounts] = await Promise.all([
        Nomination.countDocuments({ functionary_id: userId }),
        Nomination.aggregate([
          { $match: { functionary_id: userId } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ])
      ]);

      totalNominations = totalNom;
      nomStatusCounts.forEach(item => {
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

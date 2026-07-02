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

    // Parallelize all count operations to reduce total latency from N round-trips to ~1 round-trip
    const [
      totalUsers,
      formStats,
      submissionStats,
      submissionStatusStats,
      userRoleStats,
      nominationStats
    ] = await Promise.all([
      User.countDocuments(),
      Form.aggregate([
        { $match: formQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Submission.countDocuments(subQuery),
      Submission.aggregate([
        { $match: subQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      role === 'functionary'
        ? Nomination.aggregate([
            { $match: { functionary_id: userId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ])
        : Promise.resolve([])
    ]);

    // Map aggregation results back to the expected object structure
    const getCount = (stats: any[], id: string) => stats.find(s => s._id === id)?.count || 0;

    const activeForms = getCount(formStats, 'active');
    const draftForms = getCount(formStats, 'draft');
    const expiredForms = getCount(formStats, 'expired');
    
    const submissionsByStatus = {
      submitted: getCount(submissionStatusStats, 'submitted'),
      under_review: getCount(submissionStatusStats, 'under_review'),
      approved: getCount(submissionStatusStats, 'approved'),
      rejected: getCount(submissionStatusStats, 'rejected'),
    };

    const usersByRole = {
      admin: getCount(userRoleStats, 'admin'),
      reviewer: getCount(userRoleStats, 'reviewer'),
      functionary: getCount(userRoleStats, 'functionary'),
      teacher: getCount(userRoleStats, 'teacher'),
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      totalNominations = nominationStats.reduce((acc: number, s: any) => acc + s.count, 0);
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
      totalSubmissions: submissionStats,
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

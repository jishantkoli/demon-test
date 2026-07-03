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
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      subQuery.schoolCode = req.user.school_code;
    } else if (role === 'reviewer') {
      // Reviewers see submissions they need to review
    }

    // Execute all independent queries in parallel using Promise.all and MongoDB aggregations
    const [
      totalUsers,
      formStats,
      submissionStats,
      usersByRoleStats,
      nominationStats
    ] = await Promise.all([
      User.countDocuments(),
      Form.aggregate([
        { $match: formQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
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

    // Map aggregation results to expected object structures
    const getCount = (stats: any[], id: string) => stats.find(s => s._id === id)?.count || 0;

    const activeForms = getCount(formStats, 'active');
    const draftForms = getCount(formStats, 'draft');
    const expiredForms = getCount(formStats, 'expired');

    const submissionsByStatus = {
      submitted: getCount(submissionStats, 'submitted'),
      under_review: getCount(submissionStats, 'under_review'),
      approved: getCount(submissionStats, 'approved'),
      rejected: getCount(submissionStats, 'rejected'),
    };

    // Calculate total submissions from all status counts found in aggregation to ensure consistency
    const totalSubmissions = (submissionStats as any[]).reduce((sum, s) => sum + s.count, 0);

    const usersByRole = {
      admin: getCount(usersByRoleStats, 'admin'),
      reviewer: getCount(usersByRoleStats, 'reviewer'),
      functionary: getCount(usersByRoleStats, 'functionary'),
      teacher: getCount(usersByRoleStats, 'teacher'),
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      nominationsByStatus = {
        pending: getCount(nominationStats, 'pending'),
        invited: getCount(nominationStats, 'invited'),
        completed: getCount(nominationStats, 'completed'),
      };
      // Calculate total nominations from all status counts found in aggregation
      totalNominations = (nominationStats as any[]).reduce((sum, s) => sum + s.count, 0);
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

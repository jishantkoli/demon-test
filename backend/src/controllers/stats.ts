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

    // Use parallel aggregation facets to reduce DB round-trips from ~15 to 4
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: 'count' }],
            usersByRole: [
              { $group: { _id: '$role', count: { $sum: 1 } } }
            ]
          }
        }
      ]),
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            activeForms: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draftForms: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expiredForms: [{ $match: { status: 'expired' } }, { $count: 'count' }]
          }
        }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            totalSubmissions: [{ $count: 'count' }],
            submissionsByStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            totalNominations: [{ $count: 'count' }],
            nominationsByStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Map User Stats
    const totalUsers = userStats[0]?.totalUsers[0]?.count || 0;
    const usersByRole = {
      admin: 0,
      reviewer: 0,
      functionary: 0,
      teacher: 0,
      ...(userStats[0]?.usersByRole || []).reduce((acc: any, curr: any) => ({ ...acc, [curr._id]: curr.count }), {})
    };

    // Map Form Stats
    const activeForms = formStats[0]?.activeForms[0]?.count || 0;
    const draftForms = formStats[0]?.draftForms[0]?.count || 0;
    const expiredForms = formStats[0]?.expiredForms[0]?.count || 0;

    // Map Submission Stats
    const totalSubmissions = submissionStats[0]?.totalSubmissions[0]?.count || 0;
    const submissionsByStatus = {
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      ...(submissionStats[0]?.submissionsByStatus || []).reduce((acc: any, curr: any) => ({ ...acc, [curr._id]: curr.count }), {})
    };

    // Map Nomination Stats
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nominationStats.length > 0) {
      totalNominations = nominationStats[0]?.totalNominations[0]?.count || 0;
      nominationsByStatus = {
        ...nominationsByStatus,
        ...(nominationStats[0]?.nominationsByStatus || []).reduce((acc: any, curr: any) => ({ ...acc, [curr._id]: curr.count }), {})
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

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

    // Parallelize top-level counts and detailed aggregations
    const [
      totalUsers,
      formStats,
      submissionStats,
      usersByRoleArray,
      nominationStats
    ] = await Promise.all([
      User.countDocuments(),
      Form.aggregate([
        { $match: formQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Map Form results
    const activeForms = formStats.find(f => f._id === 'active')?.count || 0;
    const draftForms = formStats.find(f => f._id === 'draft')?.count || 0;
    const expiredForms = formStats.find(f => f._id === 'expired')?.count || 0;

    // Map Submission results
    const submissionsByStatus: any = {
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0
    };
    let totalSubmissions = 0;
    submissionStats.forEach(s => {
      if (s._id in submissionsByStatus) {
        submissionsByStatus[s._id] = s.count;
      }
      totalSubmissions += s.count;
    });

    // Map User roles
    const usersByRole: any = {
      admin: 0,
      reviewer: 0,
      functionary: 0,
      teacher: 0
    };
    usersByRoleArray.forEach(u => {
      if (u._id in usersByRole) {
        usersByRole[u._id] = u.count;
      }
    });

    // Map Nomination stats
    let totalNominations = 0;
    const nominationsByStatus: any = {
      pending: 0,
      invited: 0,
      completed: 0
    };
    let completionRate = 0;

    if (role === 'functionary' && Array.isArray(nominationStats)) {
      nominationStats.forEach(n => {
        if (n._id in nominationsByStatus) {
          nominationsByStatus[n._id] = n.count;
        }
        totalNominations += n.count;
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

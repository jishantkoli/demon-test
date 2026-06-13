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

    // Parallelize main count queries using Promise.all
    const [
      totalUsers,
      formStats,
      submissionStats,
      usersByRoleArray
    ] = await Promise.all([
      User.countDocuments(),
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
            submitted: [{ $match: { status: 'submitted' } }, { $count: 'count' }],
            under_review: [{ $match: { status: 'under_review' } }, { $count: 'count' }],
            approved: [{ $match: { status: 'approved' } }, { $count: 'count' }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }]
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
      ])
    ]);

    // Extract results from aggregations
    const activeForms = formStats[0].activeForms[0]?.count || 0;
    const draftForms = formStats[0].draftForms[0]?.count || 0;
    const expiredForms = formStats[0].expiredForms[0]?.count || 0;

    const totalSubmissions = submissionStats[0].totalSubmissions[0]?.count || 0;
    const submissionsByStatus = {
      submitted: submissionStats[0].submitted[0]?.count || 0,
      under_review: submissionStats[0].under_review[0]?.count || 0,
      approved: submissionStats[0].approved[0]?.count || 0,
      rejected: submissionStats[0].rejected[0]?.count || 0,
    };

    const usersByRole: any = {
      admin: 0,
      reviewer: 0,
      functionary: 0,
      teacher: 0
    };
    usersByRoleArray.forEach((item: any) => {
      if (item._id) usersByRole[item._id] = item.count;
    });

    // Functionary specific stats - can also be optimized if needed, but only for functionaries
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      const nomStats = await Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
            invited: [{ $match: { status: 'invited' } }, { $count: 'count' }],
            completed: [{ $match: { status: 'completed' } }, { $count: 'count' }]
          }
        }
      ]);

      totalNominations = nomStats[0].total[0]?.count || 0;
      nominationsByStatus = {
        pending: nomStats[0].pending[0]?.count || 0,
        invited: nomStats[0].invited[0]?.count || 0,
        completed: nomStats[0].completed[0]?.count || 0,
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

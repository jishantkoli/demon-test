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

    // Parallelize main stat groups
    const [formStats, submissionStats, userStats, nominationStats] = await Promise.all([
      // 1. Form stats
      Form.aggregate([
        { $match: formQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),

      // 2. Submission stats
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 3. User stats (Admin only or for general stats)
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [
              { $group: { _id: '$role', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 4. Nomination stats (Functionary only)
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Process Form stats
    const activeForms = formStats.find(f => f._id === 'active')?.count || 0;
    const draftForms = formStats.find(f => f._id === 'draft')?.count || 0;
    const expiredForms = formStats.find(f => f._id === 'expired')?.count || 0;

    // Process Submission stats
    const totalSubmissions = submissionStats[0]?.total[0]?.count || 0;
    const subByStatusRaw = submissionStats[0]?.byStatus || [];
    const submissionsByStatus = {
      submitted: subByStatusRaw.find((s: any) => s._id === 'submitted')?.count || 0,
      under_review: subByStatusRaw.find((s: any) => s._id === 'under_review')?.count || 0,
      approved: subByStatusRaw.find((s: any) => s._id === 'approved')?.count || 0,
      rejected: subByStatusRaw.find((s: any) => s._id === 'rejected')?.count || 0,
    };

    // Process User stats
    const totalUsers = userStats[0]?.total[0]?.count || 0;
    const usersByRoleRaw = userStats[0]?.byRole || [];
    const usersByRole = {
      admin: usersByRoleRaw.find((u: any) => u._id === 'admin')?.count || 0,
      reviewer: usersByRoleRaw.find((u: any) => u._id === 'reviewer')?.count || 0,
      functionary: usersByRoleRaw.find((u: any) => u._id === 'functionary')?.count || 0,
      teacher: usersByRoleRaw.find((u: any) => u._id === 'teacher')?.count || 0,
    };

    // Process Nomination stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStats.length > 0) {
      totalNominations = nominationStats[0]?.total[0]?.count || 0;
      const nomByStatusRaw = nominationStats[0]?.byStatus || [];
      nominationsByStatus = {
        pending: nomByStatusRaw.find((n: any) => n._id === 'pending')?.count || 0,
        invited: nomByStatusRaw.find((n: any) => n._id === 'invited')?.count || 0,
        completed: nomByStatusRaw.find((n: any) => n._id === 'completed')?.count || 0,
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

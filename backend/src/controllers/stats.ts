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
      subQuery.schoolCode = req.user.profile?.schoolCode || req.user.school_code;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
      // Reviewers see submissions they need to review
    }

    // Optimization: Use parallel execution with Promise.all and aggregation $facet
    const [
      basicStats,
      submissionStats,
      userStats,
      functionaryStats
    ] = await Promise.all([
      // 1. Basic counts (Forms and total Users)
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            active: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draft: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expired: [{ $match: { status: 'expired' } }, { $count: 'count' }]
          }
        }
      ]),

      // 2. Submission counts by status
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            submitted: [{ $match: { status: 'submitted' } }, { $count: 'count' }],
            under_review: [{ $match: { status: 'under_review' } }, { $count: 'count' }],
            approved: [{ $match: { status: 'approved' } }, { $count: 'count' }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }]
          }
        }
      ]),

      // 3. User counts by role (Only for Admin)
      role === 'admin' ? User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            admin: [{ $match: { role: 'admin' } }, { $count: 'count' }],
            reviewer: [{ $match: { role: 'reviewer' } }, { $count: 'count' }],
            functionary: [{ $match: { role: 'functionary' } }, { $count: 'count' }],
            teacher: [{ $match: { role: 'teacher' } }, { $count: 'count' }]
          }
        }
      ]) : Promise.resolve([]),

      // 4. Functionary specific stats
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
            invited: [{ $match: { status: 'invited' } }, { $count: 'count' }],
            completed: [{ $match: { status: 'completed' } }, { $count: 'count' }]
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Parse aggregation results
    const activeForms = basicStats[0]?.active[0]?.count || 0;
    const draftForms = basicStats[0]?.draft[0]?.count || 0;
    const expiredForms = basicStats[0]?.expired[0]?.count || 0;

    const totalSubmissions = submissionStats[0]?.total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: submissionStats[0]?.submitted[0]?.count || 0,
      under_review: submissionStats[0]?.under_review[0]?.count || 0,
      approved: submissionStats[0]?.approved[0]?.count || 0,
      rejected: submissionStats[0]?.rejected[0]?.count || 0
    };

    let totalUsers = 0;
    let usersByRole = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    if (role === 'admin') {
      totalUsers = userStats[0]?.total[0]?.count || 0;
      usersByRole = {
        admin: userStats[0]?.admin[0]?.count || 0,
        reviewer: userStats[0]?.reviewer[0]?.count || 0,
        functionary: userStats[0]?.functionary[0]?.count || 0,
        teacher: userStats[0]?.teacher[0]?.count || 0
      };
    } else {
      // Non-admins don't need detailed user counts, but we'll fetch totalUsers once if needed
      totalUsers = await User.countDocuments();
    }

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && functionaryStats[0]) {
      totalNominations = functionaryStats[0].total[0]?.count || 0;
      nominationsByStatus = {
        pending: functionaryStats[0].pending[0]?.count || 0,
        invited: functionaryStats[0].invited[0]?.count || 0,
        completed: functionaryStats[0].completed[0]?.count || 0
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

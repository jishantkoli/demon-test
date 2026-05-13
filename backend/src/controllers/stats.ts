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

    // Parallelize independent queries using Promise.all and aggregation for status counts
    const [
      totalUsers,
      formStats,
      submissionStats,
      userRoleStats,
      nominationStats
    ] = await Promise.all([
      User.countDocuments(),
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            active: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draft: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expired: [{ $match: { status: 'expired' } }, { $count: 'count' }],
          }
        }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: 'count' }],
            submitted: [{ $match: { status: 'submitted' } }, { $count: 'count' }],
            under_review: [{ $match: { status: 'under_review' } }, { $count: 'count' }],
            approved: [{ $match: { status: 'approved' } }, { $count: 'count' }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }],
          }
        }
      ]),
      User.aggregate([
        {
          $facet: {
            admin: [{ $match: { role: 'admin' } }, { $count: 'count' }],
            reviewer: [{ $match: { role: 'reviewer' } }, { $count: 'count' }],
            functionary: [{ $match: { role: 'functionary' } }, { $count: 'count' }],
            teacher: [{ $match: { role: 'teacher' } }, { $count: 'count' }],
          }
        }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
            invited: [{ $match: { status: 'invited' } }, { $count: 'count' }],
            completed: [{ $match: { status: 'completed' } }, { $count: 'count' }],
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Extract counts from aggregation results
    const activeForms = formStats[0]?.active[0]?.count || 0;
    const draftForms = formStats[0]?.draft[0]?.count || 0;
    const expiredForms = formStats[0]?.expired[0]?.count || 0;
    
    const totalSubmissions = submissionStats[0]?.total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: submissionStats[0]?.submitted[0]?.count || 0,
      under_review: submissionStats[0]?.under_review[0]?.count || 0,
      approved: submissionStats[0]?.approved[0]?.count || 0,
      rejected: submissionStats[0]?.rejected[0]?.count || 0,
    };

    const usersByRole = {
      admin: userRoleStats[0]?.admin[0]?.count || 0,
      reviewer: userRoleStats[0]?.reviewer[0]?.count || 0,
      functionary: userRoleStats[0]?.functionary[0]?.count || 0,
      teacher: userRoleStats[0]?.teacher[0]?.count || 0,
    };

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStats.length > 0) {
      const stats = nominationStats[0];
      totalNominations = stats.total[0]?.count || 0;
      nominationsByStatus = {
        pending: stats.pending[0]?.count || 0,
        invited: stats.invited[0]?.count || 0,
        completed: stats.completed[0]?.count || 0,
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

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
      // Reviewers see submissions they need to review
    }

    // Bolt optimization: Use Promise.all and MongoDB aggregation $facet to parallelize queries and reduce roundtrips.
    // This significantly reduces the total response time by executing multiple count operations in a single database call.

    const [generalStats, usersByRole, functionaryStats] = await Promise.all([
      // General stats aggregation
      Submission.aggregate([
        {
          $facet: {
            totalSubmissions: [{ $match: subQuery }, { $count: 'count' }],
            submitted: [{ $match: { ...subQuery, status: 'submitted' } }, { $count: 'count' }],
            under_review: [{ $match: { ...subQuery, status: 'under_review' } }, { $count: 'count' }],
            approved: [{ $match: { ...subQuery, status: 'approved' } }, { $count: 'count' }],
            rejected: [{ $match: { ...subQuery, status: 'rejected' } }, { $count: 'count' }],
          }
        }
      ]).then(res => res[0]),

      // Users by role aggregation
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: 'count' }],
            admin: [{ $match: { role: 'admin' } }, { $count: 'count' }],
            reviewer: [{ $match: { role: 'reviewer' } }, { $count: 'count' }],
            functionary: [{ $match: { role: 'functionary' } }, { $count: 'count' }],
            teacher: [{ $match: { role: 'teacher' } }, { $count: 'count' }],
          }
        }
      ]).then(res => res[0]),

      // Functionary specific stats if applicable
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
      ]).then(res => res[0]) : Promise.resolve(null),
    ]);

    // Forms need their own counts because formQuery can vary
    const [activeForms, draftForms, expiredForms] = await Promise.all([
      Form.countDocuments({ ...formQuery, status: 'active' }),
      Form.countDocuments({ ...formQuery, status: 'draft' }),
      Form.countDocuments({ ...formQuery, status: 'expired' }),
    ]);

    const submissionsByStatus = {
      submitted: generalStats.submitted[0]?.count || 0,
      under_review: generalStats.under_review[0]?.count || 0,
      approved: generalStats.approved[0]?.count || 0,
      rejected: generalStats.rejected[0]?.count || 0,
    };

    const usersByRoleResult = {
      admin: usersByRole.admin[0]?.count || 0,
      reviewer: usersByRole.reviewer[0]?.count || 0,
      functionary: usersByRole.functionary[0]?.count || 0,
      teacher: usersByRole.teacher[0]?.count || 0,
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && functionaryStats) {
      totalNominations = functionaryStats.total[0]?.count || 0;
      nominationsByStatus = {
        pending: functionaryStats.pending[0]?.count || 0,
        invited: functionaryStats.invited[0]?.count || 0,
        completed: functionaryStats.completed[0]?.count || 0,
      };
      if (totalNominations > 0) {
        completionRate = Math.round((nominationsByStatus.completed / totalNominations) * 100);
      }
    }

    res.status(200).json({
      totalUsers: usersByRole.totalUsers[0]?.count || 0,
      activeForms,
      draftForms,
      expiredForms,
      totalSubmissions: generalStats.totalSubmissions[0]?.count || 0,
      submissionsByStatus,
      usersByRole: usersByRoleResult,
      totalNominations,
      nominationsByStatus,
      completionRate
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

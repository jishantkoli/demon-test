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

    // BOLT OPTIMIZATION: Parallelize database queries and use aggregations to reduce round-trips
    const [
      totalUsers,
      formStats,
      subStatusStats,
      roleStats,
      nomStats
    ] = await Promise.all([
      User.countDocuments(),
      Form.aggregate([
        { $match: { ...formQuery, status: { $in: ['active', 'draft', 'expired'] } } },
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

    // Map form stats
    const formCounts = { active: 0, draft: 0, expired: 0 };
    formStats.forEach(s => { if (s._id in formCounts) (formCounts as any)[s._id] = s.count; });
    
    const activeForms = formCounts.active;
    const draftForms = formCounts.draft;
    const expiredForms = formCounts.expired;

    // Map submission stats
    const submissionsByStatus = { submitted: 0, under_review: 0, approved: 0, rejected: 0, pending: 0 };
    let totalSubmissions = 0;
    subStatusStats.forEach(s => {
      if (s._id in submissionsByStatus) (submissionsByStatus as any)[s._id] = s.count;
      totalSubmissions += s.count;
    });

    // Map role stats
    const usersByRole = { admin: 0, reviewer: 0, functionary: 0, teacher: 0 };
    roleStats.forEach(s => { if (s._id in usersByRole) (usersByRole as any)[s._id] = s.count; });

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary') {
      nomStats.forEach((s: any) => {
        if (s._id in nominationsByStatus) nominationsByStatus[s._id] = s.count;
        totalNominations += s.count;
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

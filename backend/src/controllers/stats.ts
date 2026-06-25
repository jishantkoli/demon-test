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
      // Fallback to req.user.school_code if profile is not populated
      subQuery.schoolCode = req.user.profile?.schoolCode || req.user.school_code;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
      // Reviewers see submissions they need to review
    }

    // Optimization: Parallelize independent counts and use aggregations to reduce DB roundtrips
    const [
      totalUsers,
      formStats,
      subStats,
      usersByRoleStats,
      nominationStats
    ] = await Promise.all([
      User.countDocuments(),
      // Group form counts by status in one query
      Form.aggregate([
        { $match: formQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Group submission counts by status in one query
      Submission.aggregate([
        { $match: subQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Group users by role in one query
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      // Functionary specific stats
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]) : Promise.resolve([])
    ]);

    // Map form stats
    const activeForms = formStats.find((s: any) => s._id === 'active')?.count || 0;
    const draftForms = formStats.find((s: any) => s._id === 'draft')?.count || 0;
    const expiredForms = formStats.find((s: any) => s._id === 'expired')?.count || 0;

    // Map submission stats
    const submissionsByStatus = {
      submitted: subStats.find((s: any) => s._id === 'submitted')?.count || 0,
      under_review: subStats.find((s: any) => s._id === 'under_review')?.count || 0,
      approved: subStats.find((s: any) => s._id === 'approved')?.count || 0,
      rejected: subStats.find((s: any) => s._id === 'rejected')?.count || 0,
    };
    const totalSubmissions = subStats.reduce((acc: number, curr: any) => acc + curr.count, 0);

    // Map users by role
    const usersByRole = {
      admin: usersByRoleStats.find((s: any) => s._id === 'admin')?.count || 0,
      reviewer: usersByRoleStats.find((s: any) => s._id === 'reviewer')?.count || 0,
      functionary: usersByRoleStats.find((s: any) => s._id === 'functionary')?.count || 0,
      teacher: usersByRoleStats.find((s: any) => s._id === 'teacher')?.count || 0,
    };

    // Map nomination stats
    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary') {
      nominationStats.forEach((s: any) => {
        if (nominationsByStatus.hasOwnProperty(s._id)) {
          nominationsByStatus[s._id] = s.count;
        }
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

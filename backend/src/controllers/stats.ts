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

    // ⚡ Bolt: Initial queries needed for base filters (e.g. assigned forms for teachers)
    if (role === 'teacher') {
      // Use lean() and select() for faster lookup
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      }).select('form_id').lean();
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      subQuery.schoolCode = req.user.school_code;
    }

    // ⚡ Bolt: Parallelize independent DB queries using Promise.all and MongoDB aggregation
    // This reduces the number of roundtrips from ~17 sequential calls to 4 parallelized aggregations.
    const [formsStats, submissionsStats, usersStats, nominationStats] = await Promise.all([
      Form.aggregate([
        { $match: formQuery },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]) : Promise.resolve([])
    ]);

    // ⚡ Bolt: Map aggregation results back to the expected response format
    const activeForms = formsStats.find(s => s._id === 'active')?.count || 0;
    // For non-admin roles, draft/expired counts should be 0 as they don't have access to them
    const draftForms = role === 'admin' ? (formsStats.find(s => s._id === 'draft')?.count || 0) : 0;
    const expiredForms = role === 'admin' ? (formsStats.find(s => s._id === 'expired')?.count || 0) : 0;

    const totalSubmissions = submissionsStats.reduce((acc, s) => acc + s.count, 0);
    const submissionsByStatus = {
      submitted: submissionsStats.find(s => s._id === 'submitted')?.count || 0,
      under_review: submissionsStats.find(s => s._id === 'under_review')?.count || 0,
      approved: submissionsStats.find(s => s._id === 'approved')?.count || 0,
      rejected: submissionsStats.find(s => s._id === 'rejected')?.count || 0,
    };

    const totalUsers = usersStats.reduce((acc, s) => acc + s.count, 0);
    const usersByRole = {
      admin: usersStats.find(s => s._id === 'admin')?.count || 0,
      reviewer: usersStats.find(s => s._id === 'reviewer')?.count || 0,
      functionary: usersStats.find(s => s._id === 'functionary')?.count || 0,
      teacher: usersStats.find(s => s._id === 'teacher')?.count || 0,
    };

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      totalNominations = nominationStats.reduce((acc, s) => acc + s.count, 0);
      nominationsByStatus = {
        pending: nominationStats.find(s => s._id === 'pending')?.count || 0,
        invited: nominationStats.find(s => s._id === 'invited')?.count || 0,
        completed: nominationStats.find(s => s._id === 'completed')?.count || 0,
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

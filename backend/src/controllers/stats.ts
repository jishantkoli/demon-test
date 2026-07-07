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
      }).lean();
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      subQuery.schoolCode = req.user.school_code || req.user.profile?.schoolCode;
    } else if (role === 'reviewer') {
      // Reviewers see active forms
    }

    // Parallelize database queries to reduce total response time
    const [
      totalUsers,
      formStats,
      submissionStats,
      userRoleStats,
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
      // Group user counts by role in one query
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      // Functionary specific nomination stats
      role === 'functionary'
        ? Nomination.aggregate([
            { $match: { functionary_id: userId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ])
        : Promise.resolve([])
    ]);

    // Map form stats
    const formCounts = formStats.reduce((acc: any, curr: any) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const activeForms = formCounts.active || 0;
    const draftForms = formCounts.draft || 0;
    const expiredForms = formCounts.expired || 0;

    // Map submission stats
    const subCounts = submissionStats.reduce((acc: any, curr: any) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const submissionsByStatus = {
      submitted: subCounts.submitted || 0,
      under_review: subCounts.under_review || 0,
      approved: subCounts.approved || 0,
      rejected: subCounts.rejected || 0,
    };

    const totalSubmissions = Object.values(subCounts).reduce((a: number, b: any) => a + (b as number), 0);

    // Map user role stats
    const userRoleCounts = userRoleStats.reduce((acc: any, curr: any) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const usersByRole = {
      admin: userRoleCounts.admin || 0,
      reviewer: userRoleCounts.reviewer || 0,
      functionary: userRoleCounts.functionary || 0,
      teacher: userRoleCounts.teacher || 0,
    };

    // Map nomination stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      const nomCounts = nominationStats.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      nominationsByStatus = {
        pending: nomCounts.pending || 0,
        invited: nomCounts.invited || 0,
        completed: nomCounts.completed || 0,
      };

      totalNominations = Object.values(nomCounts).reduce((a: number, b: any) => a + (b as number), 0);
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

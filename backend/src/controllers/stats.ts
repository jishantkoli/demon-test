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

    //⚡ Bolt: Parallelize independent database queries using Promise.all to reduce total latency.
    // This reduces the number of sequential database roundtrips from 13+ to just a few.
    const [
      totalUsers,
      activeForms,
      draftForms,
      expiredForms,
      totalSubmissions,
      subSubmitted,
      subUnderReview,
      subApproved,
      subRejected,
      roleAdmin,
      roleReviewer,
      roleFunctionary,
      roleTeacher
    ] = await Promise.all([
      User.countDocuments(),
      Form.countDocuments({ ...formQuery, status: 'active' }),
      Form.countDocuments({ ...formQuery, status: 'draft' }),
      Form.countDocuments({ ...formQuery, status: 'expired' }),
      Submission.countDocuments(subQuery),
      Submission.countDocuments({ ...subQuery, status: 'submitted' }),
      Submission.countDocuments({ ...subQuery, status: 'under_review' }),
      Submission.countDocuments({ ...subQuery, status: 'approved' }),
      Submission.countDocuments({ ...subQuery, status: 'rejected' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'reviewer' }),
      User.countDocuments({ role: 'functionary' }),
      User.countDocuments({ role: 'teacher' }),
    ]);
    
    // Submissions by status
    const submissionsByStatus = {
      submitted: subSubmitted,
      under_review: subUnderReview,
      approved: subApproved,
      rejected: subRejected,
    };

    // Users by role
    const usersByRole = {
      admin: roleAdmin,
      reviewer: roleReviewer,
      functionary: roleFunctionary,
      teacher: roleTeacher,
    };

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      const [nomTotal, nomPending, nomInvited, nomCompleted] = await Promise.all([
        Nomination.countDocuments({ functionary_id: userId }),
        Nomination.countDocuments({ functionary_id: userId, status: 'pending' }),
        Nomination.countDocuments({ functionary_id: userId, status: 'invited' }),
        Nomination.countDocuments({ functionary_id: userId, status: 'completed' }),
      ]);

      totalNominations = nomTotal;
      nominationsByStatus = {
        pending: nomPending,
        invited: nomInvited,
        completed: nomCompleted,
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

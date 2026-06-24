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
      }).select('form_id');
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

    // Parallelize all count operations using Promise.all and MongoDB aggregation facets
    // This reduces the number of database roundtrips from 15+ to just 4.
    
    // Clean up formQuery for aggregation - remove status as it's handled in facets
    const { status: _formStatus, ...formBaseQuery } = formQuery;

    const [formStatsResult, submissionStatsResult, userStatsResult, nominationStatsResult] = await Promise.all([
      // 1. Form stats by status
      Form.aggregate([
        { $match: formBaseQuery },
        {
          $facet: {
            active: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draft: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expired: [{ $match: { status: 'expired' } }, { $count: 'count' }]
          }
        }
      ]),
      // 2. Submission stats by status
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
      // 3. User stats by role
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            admin: [{ $match: { role: 'admin' } }, { $count: 'count' }],
            reviewer: [{ $match: { role: 'reviewer' } }, { $count: 'count' }],
            functionary: [{ $match: { role: 'functionary' } }, { $count: 'count' }],
            teacher: [{ $match: { role: 'teacher' } }, { $count: 'count' }]
          }
        }
      ]),
      // 4. Nomination stats for functionaries
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
      ]) : Promise.resolve(null)
    ]);

    // Helper to safely extract count from facet result
    const getCount = (result: any[] | null, field: string) => {
      if (!result || !result[0]) return 0;
      return result[0][field]?.[0]?.count || 0;
    };

    const activeForms = getCount(formStatsResult, 'active');
    const draftForms = getCount(formStatsResult, 'draft');
    const expiredForms = getCount(formStatsResult, 'expired');

    const totalSubmissions = getCount(submissionStatsResult, 'total');
    const submissionsByStatus = {
      submitted: getCount(submissionStatsResult, 'submitted'),
      under_review: getCount(submissionStatsResult, 'under_review'),
      approved: getCount(submissionStatsResult, 'approved'),
      rejected: getCount(submissionStatsResult, 'rejected'),
    };

    const totalUsers = getCount(userStatsResult, 'total');
    const usersByRole = {
      admin: getCount(userStatsResult, 'admin'),
      reviewer: getCount(userStatsResult, 'reviewer'),
      functionary: getCount(userStatsResult, 'functionary'),
      teacher: getCount(userStatsResult, 'teacher'),
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStatsResult) {
      totalNominations = getCount(nominationStatsResult, 'total');
      nominationsByStatus = {
        pending: getCount(nominationStatsResult, 'pending'),
        invited: getCount(nominationStatsResult, 'invited'),
        completed: getCount(nominationStatsResult, 'completed'),
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

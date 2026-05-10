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

    // Bolt Optimization: Group multiple countDocuments calls into single aggregation pipelines with $facet
    // and execute them concurrently with Promise.all to reduce database round-trips from 17 to 4.
    const [userStats, formStats, submissionStats, nominationStatsResult] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: "count" }],
            admin: [{ $match: { role: 'admin' } }, { $count: "count" }],
            reviewer: [{ $match: { role: 'reviewer' } }, { $count: "count" }],
            functionary: [{ $match: { role: 'functionary' } }, { $count: "count" }],
            teacher: [{ $match: { role: 'teacher' } }, { $count: "count" }]
          }
        }
      ]),
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            activeForms: [{ $match: { status: 'active' } }, { $count: "count" }],
            draftForms: [{ $match: { status: 'draft' } }, { $count: "count" }],
            expiredForms: [{ $match: { status: 'expired' } }, { $count: "count" }]
          }
        }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            totalSubmissions: [{ $count: "count" }],
            submitted: [{ $match: { status: 'submitted' } }, { $count: "count" }],
            under_review: [{ $match: { status: 'under_review' } }, { $count: "count" }],
            approved: [{ $match: { status: 'approved' } }, { $count: "count" }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: "count" }]
          }
        }
      ]),
      role === 'functionary' ? Nomination.aggregate([
        { $match: { functionary_id: userId } },
        {
          $facet: {
            totalNominations: [{ $count: "count" }],
            pending: [{ $match: { status: 'pending' } }, { $count: "count" }],
            invited: [{ $match: { status: 'invited' } }, { $count: "count" }],
            completed: [{ $match: { status: 'completed' } }, { $count: "count" }]
          }
        }
      ]) : Promise.resolve([])
    ]);

    // Helper to extract count from facet result
    const getCount = (facetResult: any, key: string) => facetResult[0]?.[key]?.[0]?.count || 0;

    const totalUsers = getCount(userStats, 'totalUsers');
    const activeForms = getCount(formStats, 'activeForms');
    const draftForms = getCount(formStats, 'draftForms');
    const expiredForms = getCount(formStats, 'expiredForms');
    const totalSubmissions = getCount(submissionStats, 'totalSubmissions');
    
    const submissionsByStatus = {
      submitted: getCount(submissionStats, 'submitted'),
      under_review: getCount(submissionStats, 'under_review'),
      approved: getCount(submissionStats, 'approved'),
      rejected: getCount(submissionStats, 'rejected'),
    };

    const usersByRole = {
      admin: getCount(userStats, 'admin'),
      reviewer: getCount(userStats, 'reviewer'),
      functionary: getCount(userStats, 'functionary'),
      teacher: getCount(userStats, 'teacher'),
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStatsResult.length > 0) {
      totalNominations = getCount(nominationStatsResult, 'totalNominations');
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

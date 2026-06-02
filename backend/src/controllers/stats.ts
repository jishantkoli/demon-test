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

    // Bolt Optimization: Use Promise.all and MongoDB aggregation $facet to consolidate 15+ sequential queries into 4 parallel pipelines.
    // This reduces database round-trips and overall latency significantly.
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // 1. User Stats (Total and by Role)
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
      // 2. Form Stats (Active, Draft, Expired based on role-filtered query)
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
      // 3. Submission Stats (Total and by Status based on role-filtered query)
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
      // 4. Nomination Stats (Functionary specific)
      role === 'functionary'
        ? Nomination.aggregate([
            { $match: { functionary_id: userId } },
            {
              $facet: {
                total: [{ $count: 'count' }],
                pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
                invited: [{ $match: { status: 'invited' } }, { $count: 'count' }],
                completed: [{ $match: { status: 'completed' } }, { $count: 'count' }]
              }
            }
          ])
        : Promise.resolve(null)
    ]);

    // Extract counts from facet results (default to 0 if no documents matched)
    const extractCount = (facetResult: any, key: string) => facetResult[0]?.[key]?.[0]?.count || 0;

    const totalUsers = extractCount(userStats, 'total');
    const usersByRole = {
      admin: extractCount(userStats, 'admin'),
      reviewer: extractCount(userStats, 'reviewer'),
      functionary: extractCount(userStats, 'functionary'),
      teacher: extractCount(userStats, 'teacher'),
    };

    const activeForms = extractCount(formStats, 'active');
    const draftForms = extractCount(formStats, 'draft');
    const expiredForms = extractCount(formStats, 'expired');

    const totalSubmissions = extractCount(submissionStats, 'total');
    const submissionsByStatus = {
      submitted: extractCount(submissionStats, 'submitted'),
      under_review: extractCount(submissionStats, 'under_review'),
      approved: extractCount(submissionStats, 'approved'),
      rejected: extractCount(submissionStats, 'rejected'),
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nominationStats) {
      totalNominations = extractCount(nominationStats, 'total');
      nominationsByStatus = {
        pending: extractCount(nominationStats, 'pending'),
        invited: extractCount(nominationStats, 'invited'),
        completed: extractCount(nominationStats, 'completed'),
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

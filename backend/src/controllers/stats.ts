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

    // Use MongoDB aggregation facets to combine multiple counts into single database roundtrips.
    // This optimization reduces the number of sequential queries from 15+ down to 4 parallel aggregations.
    const [userStats, formStats, submissionStats, nominationStats] = await Promise.all([
      // 1. User Statistics
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: 'count' }],
            admin: [{ $match: { role: 'admin' } }, { $count: 'count' }],
            reviewer: [{ $match: { role: 'reviewer' } }, { $count: 'count' }],
            functionary: [{ $match: { role: 'functionary' } }, { $count: 'count' }],
            teacher: [{ $match: { role: 'teacher' } }, { $count: 'count' }]
          }
        }
      ]),

      // 2. Form Statistics (scoped by role)
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

      // 3. Submission Statistics (scoped by role/school)
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

      // 4. Nomination Statistics (Functionary only)
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
        : Promise.resolve([])
    ]);

    // Extract counts from facet results (default to 0 if no results)
    const getCount = (facetResult: any[], key: string) => facetResult[0]?.[key]?.[0]?.count || 0;

    const totalUsers = getCount(userStats, 'totalUsers');
    const usersByRole = {
      admin: getCount(userStats, 'admin'),
      reviewer: getCount(userStats, 'reviewer'),
      functionary: getCount(userStats, 'functionary'),
      teacher: getCount(userStats, 'teacher'),
    };

    const activeForms = getCount(formStats, 'active');
    const draftForms = getCount(formStats, 'draft');
    const expiredForms = getCount(formStats, 'expired');

    const totalSubmissions = getCount(submissionStats, 'total');
    const submissionsByStatus = {
      submitted: getCount(submissionStats, 'submitted'),
      under_review: getCount(submissionStats, 'under_review'),
      approved: getCount(submissionStats, 'approved'),
      rejected: getCount(submissionStats, 'rejected'),
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      totalNominations = getCount(nominationStats, 'total');
      nominationsByStatus = {
        pending: getCount(nominationStats, 'pending'),
        invited: getCount(nominationStats, 'invited'),
        completed: getCount(nominationStats, 'completed'),
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

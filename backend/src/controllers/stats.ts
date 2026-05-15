import { Response } from 'express';
import mongoose from 'mongoose';
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

    // Optimization: Use Promise.all and MongoDB aggregation pipelines with $facet
    // to reduce database roundtrips from 17 to 4 main queries.
    const getCount = (facetResult: any, key: string) => facetResult[key]?.[0]?.count || 0;

    const [userStats, formStats, submissionStats] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
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
            active: [{ $match: { status: 'active' } }, { $count: "count" }],
            draft: [{ $match: { status: 'draft' } }, { $count: "count" }],
            expired: [{ $match: { status: 'expired' } }, { $count: "count" }]
          }
        }
      ]),
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            total: [{ $count: "count" }],
            submitted: [{ $match: { status: 'submitted' } }, { $count: "count" }],
            under_review: [{ $match: { status: 'under_review' } }, { $count: "count" }],
            approved: [{ $match: { status: 'approved' } }, { $count: "count" }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: "count" }]
          }
        }
      ])
    ]);

    const totalUsers = getCount(userStats[0], 'total');
    const usersByRole = {
      admin: getCount(userStats[0], 'admin'),
      reviewer: getCount(userStats[0], 'reviewer'),
      functionary: getCount(userStats[0], 'functionary'),
      teacher: getCount(userStats[0], 'teacher'),
    };

    const activeForms = getCount(formStats[0], 'active');
    const draftForms = getCount(formStats[0], 'draft');
    const expiredForms = getCount(formStats[0], 'expired');

    const totalSubmissions = getCount(submissionStats[0], 'total');
    const submissionsByStatus = {
      submitted: getCount(submissionStats[0], 'submitted'),
      under_review: getCount(submissionStats[0], 'under_review'),
      approved: getCount(submissionStats[0], 'approved'),
      rejected: getCount(submissionStats[0], 'rejected'),
    };

    // Functionary specific stats
    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      const [nominationStats] = await Nomination.aggregate([
        { $match: { functionary_id: new mongoose.Types.ObjectId(userId) } },
        {
          $facet: {
            total: [{ $count: "count" }],
            pending: [{ $match: { status: 'pending' } }, { $count: "count" }],
            invited: [{ $match: { status: 'invited' } }, { $count: "count" }],
            completed: [{ $match: { status: 'completed' } }, { $count: "count" }]
          }
        }
      ]);

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

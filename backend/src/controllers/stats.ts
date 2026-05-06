import { Response } from 'express';
import { User } from '../models/User.js';
import { Form } from '../models/Form.js';
import { Submission } from '../models/Submission.js';
import { Nomination } from '../models/Nomination.js';
import { AuthRequest } from '../middleware/auth.js';

/**
 * ⚡ Bolt Optimization: getStats refactored to use MongoDB Aggregation Pipelines ($facet)
 * and Promise.all to reduce database round-trips from ~17 to 4.
 */
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const userId = req.user?._id;
    const email = req.user?.email;

    let formQuery: any = {};
    let subQuery: any = {};

    // Initial role-based query configuration
    if (role === 'teacher') {
      const nominations = await Nomination.find({ 
        teacher_email: { $regex: new RegExp(`^${email}$`, 'i') } 
      });
      const assignedFormIds = nominations.map(n => n.form_id);
      formQuery._id = { $in: assignedFormIds };
      // Note: formQuery.status is handled in the $facet match
      subQuery.userId = userId;
    } else if (role === 'functionary') {
      subQuery.schoolCode = req.user.school_code;
    } else if (role === 'reviewer') {
      // Reviewers logic can be extended here
    }

    // Parallelize all collection counts using aggregation facets
    const [formStats, submissionStats, userStats, nominationStats] = await Promise.all([
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
      ]) : Promise.resolve([])
    ]);

    const fs = formStats[0] || {};
    const ss = submissionStats[0] || {};
    const us = userStats[0] || {};
    const ns = (nominationStats as any)[0] || {};

    const submissionsByStatus = {
      submitted: ss.submitted?.[0]?.count || 0,
      under_review: ss.under_review?.[0]?.count || 0,
      approved: ss.approved?.[0]?.count || 0,
      rejected: ss.rejected?.[0]?.count || 0,
    };

    const usersByRole = {
      admin: us.admin?.[0]?.count || 0,
      reviewer: us.reviewer?.[0]?.count || 0,
      functionary: us.functionary?.[0]?.count || 0,
      teacher: us.teacher?.[0]?.count || 0,
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary') {
      totalNominations = ns.total?.[0]?.count || 0;
      nominationsByStatus = {
        pending: ns.pending?.[0]?.count || 0,
        invited: ns.invited?.[0]?.count || 0,
        completed: ns.completed?.[0]?.count || 0,
      };
      if (totalNominations > 0) {
        completionRate = Math.round((nominationsByStatus.completed / totalNominations) * 100);
      }
    }

    res.status(200).json({
      totalUsers: us.total?.[0]?.count || 0,
      activeForms: fs.active?.[0]?.count || 0,
      draftForms: fs.draft?.[0]?.count || 0,
      expiredForms: fs.expired?.[0]?.count || 0,
      totalSubmissions: ss.total?.[0]?.count || 0,
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

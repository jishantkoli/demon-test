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
      subQuery.schoolCode = req.user.profile?.schoolCode || req.user.school_code;
    } else if (role === 'reviewer') {
      formQuery.status = 'active';
      // Reviewers see submissions they need to review
    }

    // Parallelize independent counts using aggregation $facet for maximum efficiency
    const { status: _formStatus, ...baseFormQuery } = formQuery;
    const [counts, submissionStats, userStats, nominationStats] = await Promise.all([
      Form.aggregate([
        { $match: baseFormQuery },
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
      ]) : Promise.resolve(null)
    ]);

    const formCounts = counts[0];
    const subCounts = submissionStats[0];
    const uCounts = userStats[0];
    const nCounts = nominationStats ? nominationStats[0] : null;

    const stats = {
      totalUsers: uCounts.total[0]?.count || 0,
      activeForms: formCounts.active[0]?.count || 0,
      draftForms: formCounts.draft[0]?.count || 0,
      expiredForms: formCounts.expired[0]?.count || 0,
      totalSubmissions: subCounts.total[0]?.count || 0,
      submissionsByStatus: {
        submitted: subCounts.submitted[0]?.count || 0,
        under_review: subCounts.under_review[0]?.count || 0,
        approved: subCounts.approved[0]?.count || 0,
        rejected: subCounts.rejected[0]?.count || 0,
      },
      usersByRole: {
        admin: uCounts.admin[0]?.count || 0,
        reviewer: uCounts.reviewer[0]?.count || 0,
        functionary: uCounts.functionary[0]?.count || 0,
        teacher: uCounts.teacher[0]?.count || 0,
      },
      totalNominations: nCounts?.total[0]?.count || 0,
      nominationsByStatus: nCounts ? {
        pending: nCounts.pending[0]?.count || 0,
        invited: nCounts.invited[0]?.count || 0,
        completed: nCounts.completed[0]?.count || 0,
      } : {},
      completionRate: 0
    };

    if (stats.totalNominations > 0) {
      stats.completionRate = Math.round((stats.nominationsByStatus.completed / stats.totalNominations) * 100);
    }

    res.status(200).json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

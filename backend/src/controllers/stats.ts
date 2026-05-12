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

    // Bolt Optimization: Use MongoDB aggregation pipelines with $facet to reduce database roundtrips.
    // This consolidated 17 individual countDocuments calls into just 4 concurrent aggregation queries.
    const [userStats, formStats, subStats, nomStats] = await Promise.all([
      // 1. User stats consolidated
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

      // 2. Form stats consolidated
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

      // 3. Submission stats consolidated
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

      // 4. Nomination stats consolidated (only for functionary role)
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

    // Extract results from facets
    const u = userStats[0];
    const totalUsers = u.total[0]?.count || 0;
    const usersByRole = {
      admin: u.admin[0]?.count || 0,
      reviewer: u.reviewer[0]?.count || 0,
      functionary: u.functionary[0]?.count || 0,
      teacher: u.teacher[0]?.count || 0
    };

    const f = formStats[0];
    const activeForms = f.active[0]?.count || 0;
    const draftForms = f.draft[0]?.count || 0;
    const expiredForms = f.expired[0]?.count || 0;

    const s = subStats[0];
    const totalSubmissions = s.total[0]?.count || 0;
    const submissionsByStatus = {
      submitted: s.submitted[0]?.count || 0,
      under_review: s.under_review[0]?.count || 0,
      approved: s.approved[0]?.count || 0,
      rejected: s.rejected[0]?.count || 0
    };

    let totalNominations = 0;
    let nominationsByStatus: any = {};
    let completionRate = 0;

    if (role === 'functionary' && nomStats.length > 0) {
      const n = nomStats[0];
      totalNominations = n.total[0]?.count || 0;
      nominationsByStatus = {
        pending: n.pending[0]?.count || 0,
        invited: n.invited[0]?.count || 0,
        completed: n.completed[0]?.count || 0
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

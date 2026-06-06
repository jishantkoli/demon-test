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
    }

    // Parallelize core data fetching using Promise.all and MongoDB aggregation facets
    const [userStats, formStats, subStats, nominationStats] = await Promise.all([
      // 1. User stats (all roles need this for now, though we could optimize further)
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: 'count' }],
            usersByRole: [
              { $group: { _id: '$role', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 2. Form stats
      Form.aggregate([
        { $match: formQuery },
        {
          $facet: {
            activeForms: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draftForms: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expiredForms: [{ $match: { status: 'expired' } }, { $count: 'count' }]
          }
        }
      ]),

      // 3. Submission stats
      Submission.aggregate([
        { $match: subQuery },
        {
          $facet: {
            totalSubmissions: [{ $count: 'count' }],
            submissionsByStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // 4. Nomination stats (Functionary specific)
      role === 'functionary'
        ? Nomination.aggregate([
            { $match: { functionary_id: userId } },
            {
              $facet: {
                totalNominations: [{ $count: 'count' }],
                nominationsByStatus: [
                  { $group: { _id: '$status', count: { $sum: 1 } } }
                ]
              }
            }
          ])
        : Promise.resolve(null)
    ]);

    // Process results
    const users = userStats[0];
    const totalUsers = users.totalUsers[0]?.count || 0;
    const usersByRole = {
      admin: 0, reviewer: 0, functionary: 0, teacher: 0,
      ...Object.fromEntries(users.usersByRole.map((r: any) => [r._id, r.count]))
    };

    const forms = formStats[0];
    const activeForms = forms.activeForms[0]?.count || 0;
    const draftForms = forms.draftForms[0]?.count || 0;
    const expiredForms = forms.expiredForms[0]?.count || 0;

    const subs = subStats[0];
    const totalSubmissions = subs.totalSubmissions[0]?.count || 0;
    const submissionsByStatus = {
      submitted: 0, under_review: 0, approved: 0, rejected: 0,
      ...Object.fromEntries(subs.submissionsByStatus.map((s: any) => [s._id, s.count]))
    };

    let totalNominations = 0;
    let nominationsByStatus: any = { pending: 0, invited: 0, completed: 0 };
    let completionRate = 0;

    if (role === 'functionary' && nominationStats) {
      const noms = nominationStats[0];
      totalNominations = noms.totalNominations[0]?.count || 0;
      nominationsByStatus = {
        ...nominationsByStatus,
        ...Object.fromEntries(noms.nominationsByStatus.map((n: any) => [n._id, n.count]))
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

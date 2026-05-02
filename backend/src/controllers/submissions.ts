import { Request, Response } from 'express';
import { Submission } from '../models/Submission.js';
import { Form } from '../models/Form.js';
import { Nomination } from '../models/Nomination.js';
import { AuthRequest } from '../middleware/auth.js';

export const submitForm = async (req: AuthRequest, res: Response) => {
  try {
    let { form_id, formId, responses } = req.body;
    const rawNominationId = req.body.nomination_id || req.body.nominationId;
    const actualFormId = form_id || formId || req.body.formId;
    
    // Convert object responses to array if needed
    if (responses && !Array.isArray(responses)) {
      responses = Object.entries(responses).map(([fieldId, value]) => ({ fieldId, value }));
    }
    
    if (!responses) responses = [];
    
    if (!actualFormId) {
      console.log('Submission failed: No formId provided in request body');
      return res.status(400).json({ error: 'formId is required' });
    }

    let form;
    if (actualFormId.toString().match(/^[0-9a-fA-F]{24}$/)) {
      form = await Form.findById(actualFormId);
    } else {
      form = await Form.findOne({ shareableLink: actualFormId });
    }

    if (!form) {
      console.log('Submission failed: Form not found with ID/Link', actualFormId, 'from payload', req.body);
      return res.status(404).json({ error: 'Form not found' });
    }

    // ─── NOMINATION LINKING (3-layer: ID → Token → Email) ───────────────
    let linkedNomination: any = null;

    // Layer 1: Direct nomination ID (if frontend sent it)
    if (rawNominationId) {
      try {
        linkedNomination = await Nomination.findById(rawNominationId);
      } catch (e) {
        console.log('Nomination ID lookup failed (invalid ID format):', rawNominationId);
      }
    }

    // Layer 2: Nomination token from URL (MOST RELIABLE - 1 token = 1 nomination)
    const nominationToken = req.body.nomination_token;
    if (!linkedNomination && nominationToken) {
      // First try exact match on unique_token
      linkedNomination = await Nomination.findOne({ unique_token: nominationToken });
      // If not found, try matching by token field (some systems store it as just 'token')
      if (!linkedNomination) {
        linkedNomination = await Nomination.findOne({ token: nominationToken });
      }
      if (linkedNomination) {
        console.log('✅ Nomination linked via TOKEN:', nominationToken, '→', linkedNomination._id);
      } else {
        console.log('❌ Token not found in any nomination:', nominationToken);
      }
    }

    // Layer 3: Email + form_id fallback (works for OTP and login flows)
    const searchEmail = req.body.user_email || req.user?.email;
    if (!linkedNomination && searchEmail) {
      linkedNomination = await Nomination.findOne({
        form_id: form._id,
        teacher_email: { $regex: new RegExp(`^${searchEmail.trim()}$`, 'i') }
      });
      if (linkedNomination) {
        console.log('✅ Nomination linked via EMAIL:', searchEmail, '→', linkedNomination._id);
      }
    }

    if (linkedNomination) {
      console.log('✅ Final linked nomination:', linkedNomination._id, 'teacher:', linkedNomination.teacher_email);
    } else {
      console.log('ℹ️ No nomination found for this submission (form:', form._id, 'email:', searchEmail, ')');
    }

    // Expiration check
    if (form.expiresAt && new Date() > form.expiresAt) {
      return res.status(403).json({ error: 'This form has expired' });
    }

    // Scoring for Quizzes
    let score = null;
    let earnedPoints = 0;
    let totalPoints = 0;
    
    // Fallback to recalculate if not provided by frontend
    if (req.body.score !== undefined && req.body.score !== null) {
      earnedPoints = req.body.score;
      // Extract max score
      if (form.form_schema && form.form_schema.sections) {
        form.form_schema.sections.forEach((sec: any) => {
          sec.fields?.forEach((f: any) => {
            if (f.type === 'mcq') totalPoints += f.marks || 1;
          });
        });
      }
      const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
      score = {
        earnedPoints,
        totalPoints,
        percentage,
        passed: percentage >= (form.settings?.passing_score || 0)
      };
    } else if (form.form_schema && form.form_schema.sections) {
      form.form_schema.sections.forEach((sec: any) => {
        sec.fields?.forEach((field: any) => {
          if (field.type === 'mcq' && field.correct !== undefined) {
            totalPoints += field.marks || 1;
            const resp = responses.find((r: any) => r.fieldId === field.id);
            if (resp && String(resp.value) === String(field.correct)) {
              earnedPoints += field.marks || 1;
            } else if (resp && form.settings?.negative_marking) {
              earnedPoints -= field.negative || 0;
            }
          }
        });
      });
      if (totalPoints > 0) {
        earnedPoints = Math.max(0, earnedPoints);
        const percentage = (earnedPoints / totalPoints) * 100;
        score = {
          earnedPoints,
          totalPoints,
          percentage,
          passed: percentage >= (form.settings?.passing_score || 0)
        };
      }
    }

    const submissionData: any = {
      formId: form._id,
      nominationId: linkedNomination?._id || null,
      nominationToken: req.body.nomination_token || null,
      userId: req.user?._id || null,
      userName: req.body.user_name || req.user?.profile?.fullName,
      userEmail: req.body.user_email || req.user?.email || linkedNomination?.teacher_email,
      schoolCode: req.body.school_code || linkedNomination?.school_code || req.user?.profile?.schoolCode,
      formTitle: req.body.form_title || form.title,
      responses,
      score,
      status: req.body.status || 'pending',
      isDraft: req.body.is_draft || false,
      metadata: {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }
    };

    console.log('📋 Submission data:', { formId: submissionData.formId, nominationId: submissionData.nominationId, userEmail: submissionData.userEmail, schoolCode: submissionData.schoolCode });

    const submission = await Submission.create(submissionData);

    // Update nomination status to 'completed' after successful non-draft submission
    if (linkedNomination && !submissionData.isDraft) {
      try {
        await Nomination.findByIdAndUpdate(linkedNomination._id, { status: 'completed' });
      } catch (e) {
        console.error('Failed to update nomination status:', e);
      }
    }

    res.status(201).json({ ...submission.toObject(), id: submission._id, is_draft: submission.isDraft, school_code: submission.schoolCode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const updateSubmission = async (req: AuthRequest, res: Response) => {
  try {
    let { id, is_draft, responses } = req.body;

    if (responses && !Array.isArray(responses)) {
      responses = Object.entries(responses).map(([fieldId, value]) => ({ fieldId, value }));
    }

    // ─── NOMINATION LINKING ON UPDATE (if not already linked) ─────────────
    const existingSub = await Submission.findById(id);
    let nominationId = req.body.nomination_id || req.body.nominationId;
    let nominationToken = req.body.nomination_token;

    // Only try to link if not already linked
    if (!existingSub?.nominationId && (nominationId || nominationToken)) {
      let linkedNom: any = null;

      // Try by nomination ID first
      if (nominationId) {
        try {
          linkedNom = await Nomination.findById(nominationId);
        } catch {}
      }

      // Try by token
      if (!linkedNom && nominationToken) {
        linkedNom = await Nomination.findOne({ unique_token: nominationToken });
        if (!linkedNom) {
          linkedNom = await Nomination.findOne({ token: nominationToken });
        }
      }

      if (linkedNom) {
        console.log('✅ Nomination linked during update:', linkedNom._id);
        nominationId = linkedNom._id;
        nominationToken = linkedNom.unique_token || nominationToken;
      }
    }

    const payload: any = {
      ...req.body,
      responses: responses || req.body.responses,
      isDraft: is_draft !== undefined ? is_draft : req.body.isDraft
    };
    if (nominationId) {
      payload.nominationId = nominationId;
    }
    if (nominationToken !== undefined) {
      payload.nominationToken = nominationToken;
    }

    const submission = await Submission.findByIdAndUpdate(id, payload, { new: true });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Update nomination status if submitting (not drafting)
    if (submission.nominationId && is_draft === false) {
      try {
        await Nomination.findByIdAndUpdate(submission.nominationId, { status: 'completed' });
      } catch (e) {
        console.error('Failed to update nomination status:', e);
      }
    }

    res.status(200).json({ ...submission.toObject(), id: submission._id, is_draft: submission.isDraft });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getSubmissions = async (req: AuthRequest, res: Response) => {
  try {
    const { formId, form_id, user_id, user_email } = req.query;
    const actualFormId = formId || form_id;
    const query: any = {};
    if (actualFormId) {
      if (actualFormId.toString().match(/^[0-9a-fA-F]{24}$/)) {
        query.formId = actualFormId;
      } else {
        const f = await Form.findOne({ shareableLink: actualFormId as string });
        if (f) query.formId = f._id;
        else return res.status(200).json([]); // Form not found, so no submissions
      }
    }
    if (user_id) query.userId = user_id;
    if (user_email) query.userEmail = { $regex: new RegExp(`^${user_email}$`, 'i') };

    if (req.user) {
      if (req.user.role === 'teacher') {
        // Teachers see submissions matching their ID OR their email
        query.$or = [
          { userId: req.user._id },
          { userEmail: { $regex: new RegExp(`^${req.user.email}$`, 'i') } }
        ];
      } else if (req.user.role === 'functionary') {
        // Functionaries see submissions for teachers they nominated
        const myNominations = await Nomination.find({ functionary_id: req.user._id });
        const teacherEmails = myNominations.map(n => n.teacher_email);
        query.userEmail = { $in: teacherEmails.map(email => new RegExp(`^${email}$`, 'i')) };
      }
    } else {
      // For truly anonymous requests (before OTP), we can only filter by email if provided
      // and only if the form is found. But to be safe, we only allow this if user_email is explicitly requested.
      if (!user_email) return res.status(200).json([]);
      query.userEmail = { $regex: new RegExp(`^${user_email}$`, 'i') };
    }

    // BOLT OPTIMIZATION: Use .lean() to get POJOs instead of Mongoose Documents.
    // This reduces memory overhead and speeds up the query significantly for large result sets.
    const submissions = await Submission.find(query)
      .populate('nominationId')
      .sort({ createdAt: -1 })
      .lean();
      
    const mapped = submissions.map((s: any) => {
      return {
        ...s,
        id: s._id,
        form_id: s.formId,
        user_id: s.userId,
        user_name: s.userName,
        user_email: s.userEmail,
        nomination_id: s.nominationId,
        nomination_token: s.nominationToken || (s.nominationId as any)?.unique_token || null,
        unique_token: s.nominationToken || (s.nominationId as any)?.unique_token || null,
        form_title: s.formTitle,
        submitted_at: s.createdAt,
        is_draft: s.isDraft
      };
    });
      
    res.status(200).json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


export const getSubmissionById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // BOLT OPTIMIZATION: Use .lean() for faster lookup
    const submission = await Submission.findById(id).populate('formId').lean();
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    
    // Privacy: Teachers only see own
    if (req.user) {
      if (req.user.role === 'teacher' && submission.userId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Admins and Reviewers are allowed to see any submission
    } else {
      // Anonymous users can only see anonymous submissions
      if (submission.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.status(200).json({ success: true, data: submission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

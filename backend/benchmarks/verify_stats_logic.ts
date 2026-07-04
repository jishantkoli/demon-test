import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function verifyLogic() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Verifying logic correctness...');

  // Create Admin
  const admin = await User.create({
    email: 'admin@example.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  // Create 3 teachers
  await User.create([
    { email: 't1@ex.com', role: 'teacher', profile: { fullName: 'T1' } },
    { email: 't2@ex.com', role: 'teacher', profile: { fullName: 'T2' } },
    { email: 't3@ex.com', role: 'teacher', profile: { fullName: 'T3' } },
  ]);

  // Create 2 functionaries
  const func1 = await User.create({ email: 'f1@ex.com', role: 'functionary', profile: { fullName: 'F1', schoolCode: 'S1' } });
  await User.create({ email: 'f2@ex.com', role: 'functionary', profile: { fullName: 'F2', schoolCode: 'S2' } });

  // Forms: 2 active, 1 draft, 1 expired
  await Form.create([
    { title: 'A1', status: 'active', adminId: admin._id, shareableLink: 'a1' },
    { title: 'A2', status: 'active', adminId: admin._id, shareableLink: 'a2' },
    { title: 'D1', status: 'draft', adminId: admin._id, shareableLink: 'd1' },
    { title: 'E1', status: 'expired', adminId: admin._id, shareableLink: 'e1' },
  ]);

  // Submissions: 2 submitted, 1 approved
  await Submission.create([
    { formId: new mongoose.Types.ObjectId(), status: 'submitted', userEmail: 't1@ex.com' },
    { formId: new mongoose.Types.ObjectId(), status: 'submitted', userEmail: 't2@ex.com' },
    { formId: new mongoose.Types.ObjectId(), status: 'approved', userEmail: 't3@ex.com' },
  ]);

  // Nominations for func1: 1 pending, 1 completed
  await Nomination.create([
    { form_id: new mongoose.Types.ObjectId(), functionary_id: func1._id, teacher_email: 't1@ex.com', teacher_name: 'T1', school_code: 'S1', status: 'pending' },
    { form_id: new mongoose.Types.ObjectId(), functionary_id: func1._id, teacher_email: 't2@ex.com', teacher_name: 'T2', school_code: 'S1', status: 'completed' },
  ]);

  const testRole = async (user: any) => {
    let result: any;
    const req = { user } as any;
    const res = {
      status: (code: number) => ({
        json: (data: any) => { result = data; }
      })
    } as any;
    await getStats(req, res);
    return result;
  };

  console.log('Testing Admin stats...');
  const adminStats = await testRole(admin);
  console.assert(adminStats.totalUsers === 6, `Expected 6 users, got ${adminStats.totalUsers}`);
  console.assert(adminStats.activeForms === 2, `Expected 2 active forms, got ${adminStats.activeForms}`);
  console.assert(adminStats.draftForms === 1, `Expected 1 draft form, got ${adminStats.draftForms}`);
  console.assert(adminStats.totalSubmissions === 3, `Expected 3 submissions, got ${adminStats.totalSubmissions}`);
  console.assert(adminStats.submissionsByStatus.submitted === 2, 'Expected 2 submitted');
  console.assert(adminStats.usersByRole.teacher === 3, 'Expected 3 teachers');

  console.log('Testing Functionary stats...');
  const funcStats = await testRole(func1);
  console.assert(funcStats.totalNominations === 2, `Expected 2 nominations, got ${funcStats.totalNominations}`);
  console.assert(funcStats.nominationsByStatus.pending === 1, 'Expected 1 pending nomination');
  console.assert(funcStats.nominationsByStatus.completed === 1, 'Expected 1 completed nomination');
  console.assert(funcStats.completionRate === 50, `Expected 50% completion rate, got ${funcStats.completionRate}`);

  console.log('Logic verification passed!');

  await mongoose.disconnect();
  await mongod.stop();
}

verifyLogic().catch(e => {
  console.error('Verification failed:', e);
  process.exit(1);
});

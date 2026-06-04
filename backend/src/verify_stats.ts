import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './models/User.js';
import { Form } from './models/Form.js';
import { Submission } from './models/Submission.js';
import { Nomination } from './models/Nomination.js';
import { getStats } from './controllers/stats.js';

async function verify() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Seed minimal data
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin User' }
  });

  const teacher = await User.create({
    email: 'teacher@test.com',
    role: 'teacher',
    profile: { fullName: 'Teacher User', schoolCode: 'S1' }
  });

  const form = await Form.create({
    title: 'Test Form',
    status: 'active',
    shareableLink: 'test-link'
  });

  await Nomination.create({
    form_id: form._id,
    functionary_id: admin._id,
    teacher_name: 'Teacher User',
    teacher_email: 'teacher@test.com',
    school_code: 'S1',
    status: 'pending'
  });

  await Submission.create({
    formId: form._id,
    userId: teacher._id,
    userEmail: 'teacher@test.com',
    schoolCode: 'S1',
    status: 'submitted'
  });

  const runVerify = async (user: any) => {
    let capturedJson: any = null;
    const req = {
      user: {
        _id: user._id,
        role: user.role,
        email: user.email,
        school_code: user.profile?.schoolCode
      }
    } as any;

    const res = {
      status: () => res,
      json: (data: any) => { capturedJson = data; }
    } as any;

    await getStats(req, res);
    return capturedJson;
  };

  const adminStats = await runVerify(admin);
  const expectedKeys = [
    'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
    'totalSubmissions', 'submissionsByStatus', 'usersByRole',
    'totalNominations', 'nominationsByStatus', 'completionRate'
  ];

  console.log('Verifying Admin stats structure...');
  expectedKeys.forEach(key => {
    if (!(key in adminStats)) {
      throw new Error(`Missing key: ${key}`);
    }
  });

  if (adminStats.totalUsers !== 2) throw new Error(`Expected 2 users, got ${adminStats.totalUsers}`);
  if (adminStats.activeForms !== 1) throw new Error(`Expected 1 active form, got ${adminStats.activeForms}`);
  if (adminStats.totalSubmissions !== 1) throw new Error(`Expected 1 submission, got ${adminStats.totalSubmissions}`);
  if (adminStats.submissionsByStatus.submitted !== 1) throw new Error(`Expected 1 submitted, got ${adminStats.submissionsByStatus.submitted}`);

  console.log('✅ Verification successful!');

  await mongoose.disconnect();
  await mongod.stop();
}

verify().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

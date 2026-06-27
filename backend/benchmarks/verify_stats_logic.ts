import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function setupDB() {
  const mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
    binary: { version: '8.2.1' }
  });
  await mongoose.connect(mongoServer.getUri());
  return mongoServer;
}

async function verify() {
  const mongoServer = await setupDB();

  // Seed precise data
  const admin = await User.create({ email: 'admin@test.com', role: 'admin', profile: { fullName: 'Admin' } });
  const teacher = await User.create({ email: 'teacher@test.com', role: 'teacher', profile: { fullName: 'Teacher' } });
  const functionary = await User.create({ email: 'func@test.com', role: 'functionary', profile: { fullName: 'Func', schoolCode: 'SCH1' } });

  await Form.create([
    { title: 'F1', status: 'active', adminId: admin._id, shareableLink: 'l1' },
    { title: 'F2', status: 'draft', adminId: admin._id, shareableLink: 'l2' },
    { title: 'F3', status: 'expired', adminId: admin._id, shareableLink: 'l3' }
  ]);

  await Submission.create([
    { formId: new mongoose.Types.ObjectId(), status: 'submitted', schoolCode: 'SCH1' },
    { formId: new mongoose.Types.ObjectId(), status: 'approved', schoolCode: 'SCH1' }
  ]);

  await Nomination.create([
    { form_id: new mongoose.Types.ObjectId(), functionary_id: functionary._id, teacher_name: 'T1', teacher_email: 't1@test.com', school_code: 'SCH1', status: 'completed' },
    { form_id: new mongoose.Types.ObjectId(), functionary_id: functionary._id, teacher_name: 'T2', teacher_email: 't2@test.com', school_code: 'SCH1', status: 'pending' }
  ]);

  console.log('Verifying for Admin role...');
  let responseData: any;
  const res = {
    status: () => res,
    json: (data: any) => { responseData = data; return res; }
  } as any;

  await getStats({ user: admin } as any, res);

  const expectedAdmin = {
    totalUsers: 3,
    activeForms: 1,
    draftForms: 1,
    expiredForms: 1,
    totalSubmissions: 2,
    submissionsByStatus: { submitted: 1, under_review: 0, approved: 1, rejected: 0 },
    usersByRole: { admin: 1, reviewer: 0, functionary: 1, teacher: 1 },
    totalNominations: 0,
    nominationsByStatus: {},
    completionRate: 0
  };

  if (JSON.stringify(responseData) === JSON.stringify(expectedAdmin)) {
    console.log('✅ Admin stats verification passed!');
  } else {
    console.error('❌ Admin stats verification failed!');
    console.error('Received:', responseData);
    console.error('Expected:', expectedAdmin);
    process.exit(1);
  }

  console.log('Verifying for Functionary role...');
  await getStats({ user: functionary } as any, res);

  const expectedFunc = {
    totalUsers: 3,
    activeForms: 1, // Functionaries only see active forms
    draftForms: 0,
    expiredForms: 0,
    totalSubmissions: 2, // Submissions for SCH1
    submissionsByStatus: { submitted: 1, under_review: 0, approved: 1, rejected: 0 },
    usersByRole: { admin: 1, reviewer: 0, functionary: 1, teacher: 1 },
    totalNominations: 2,
    nominationsByStatus: { pending: 1, invited: 0, completed: 1 },
    completionRate: 50
  };

  if (JSON.stringify(responseData) === JSON.stringify(expectedFunc)) {
    console.log('✅ Functionary stats verification passed!');
  } else {
    console.error('❌ Functionary stats verification failed!');
    console.error('Received:', responseData);
    console.error('Expected:', expectedFunc);
    process.exit(1);
  }

  await mongoose.disconnect();
  await mongoServer.stop();
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});

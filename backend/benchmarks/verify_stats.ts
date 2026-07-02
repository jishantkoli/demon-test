import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function setupData() {
  const admin = await User.create({ email: 'admin@test.com', role: 'admin', profile: { fullName: 'Admin' } });
  const reviewer = await User.create({ email: 'reviewer@test.com', role: 'reviewer', profile: { fullName: 'Reviewer' } });
  const functionary = await User.create({ email: 'func@test.com', role: 'functionary', profile: { fullName: 'Functionary', schoolCode: 'S1' } });
  const teacher = await User.create({ email: 'teacher@test.com', role: 'teacher', profile: { fullName: 'Teacher', schoolCode: 'S1' } });

  const form1 = await Form.create({ title: 'Active Form', status: 'active', adminId: admin._id, shareableLink: 'f1' });
  const form2 = await Form.create({ title: 'Draft Form', status: 'draft', adminId: admin._id, shareableLink: 'f2' });
  const form3 = await Form.create({ title: 'Expired Form', status: 'expired', adminId: admin._id, shareableLink: 'f3' });

  await Nomination.create({
    form_id: form1._id,
    functionary_id: functionary._id,
    teacher_name: 'Teacher',
    teacher_email: 'teacher@test.com',
    school_code: 'S1',
    status: 'pending'
  });

  await Submission.create({ formId: form1._id, status: 'submitted', userEmail: 'teacher@test.com', userId: teacher._id, schoolCode: 'S1' });
  await Submission.create({ formId: form1._id, status: 'approved', userEmail: 'teacher@test.com', userId: teacher._id, schoolCode: 'S1' });

  return { admin, functionary, teacher };
}

async function verify() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const { admin } = await setupData();

  let responseData: any;
  const req = { user: admin } as any;
  const res = {
    status: (code: number) => ({
      json: (data: any) => {
        responseData = data;
      }
    })
  } as any;

  await getStats(req, res);

  const expectedKeys = [
    'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
    'totalSubmissions', 'submissionsByStatus', 'usersByRole',
    'totalNominations', 'nominationsByStatus', 'completionRate'
  ];

  for (const key of expectedKeys) {
    if (!(key in responseData)) {
      throw new Error(`Missing key in response: ${key}`);
    }
  }

  console.log('Verification successful! Response data:', JSON.stringify(responseData, null, 2));

  if (responseData.totalUsers !== 4) throw new Error(`Expected 4 users, got ${responseData.totalUsers}`);
  if (responseData.activeForms !== 1) throw new Error(`Expected 1 active form, got ${responseData.activeForms}`);
  if (responseData.totalSubmissions !== 2) throw new Error(`Expected 2 submissions, got ${responseData.totalSubmissions}`);
  if (responseData.usersByRole.admin !== 1) throw new Error(`Expected 1 admin, got ${responseData.usersByRole.admin}`);

  await mongoose.disconnect();
  await mongod.stop();
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});

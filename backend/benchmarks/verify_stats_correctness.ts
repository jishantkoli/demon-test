import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function verifyCorrectness() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data for verification...');

  const admin = await User.create({ email: 'admin@test.com', role: 'admin', profile: { fullName: 'Admin' } });
  const functionary = await User.create({ email: 'head@school.org', role: 'functionary', profile: { fullName: 'Head Master', schoolCode: 'SCH001' } });

  const teacher = await User.create({ email: 'teacher@test.com', role: 'teacher', profile: { fullName: 'Teacher 1', schoolCode: 'SCH001' } });

  const activeForm = await Form.create({ title: 'Active Form', status: 'active', adminId: admin._id, shareableLink: 'active-1' });
  const draftForm = await Form.create({ title: 'Draft Form', status: 'draft', adminId: admin._id, shareableLink: 'draft-1' });

  await Nomination.create({
    form_id: activeForm._id,
    functionary_id: functionary._id,
    teacher_name: 'Teacher 1',
    teacher_email: teacher.email,
    school_code: 'SCH001',
    status: 'completed',
    unique_token: 'token-1'
  });

  await Submission.create({
    formId: activeForm._id,
    userId: teacher._id,
    userEmail: teacher.email,
    schoolCode: 'SCH001',
    status: 'submitted'
  });

  await Submission.create({
    formId: activeForm._id,
    userId: teacher._id,
    userEmail: teacher.email,
    schoolCode: 'SCH001',
    status: 'under_review'
  });

  async function test(user: any, label: string) {
    console.log(`\nTesting as ${label}...`);
    let responseData: any;
    const req = { user } as any;
    const res = {
      status: () => res,
      json: (data: any) => { responseData = data; return res; },
    } as any;

    await getStats(req, res);

    console.log('Response:', JSON.stringify(responseData, null, 2));

    if (label === 'Admin') {
      if (responseData.totalUsers !== 3) throw new Error('Wrong totalUsers');
      if (responseData.activeForms !== 1) throw new Error('Wrong activeForms');
      if (responseData.draftForms !== 1) throw new Error('Wrong draftForms');
      if (responseData.totalSubmissions !== 2) throw new Error('Wrong totalSubmissions');
      if (responseData.submissionsByStatus.submitted !== 1) throw new Error('Wrong submitted count');
      if (responseData.submissionsByStatus.under_review !== 1) throw new Error('Wrong under_review count');
    } else if (label === 'Functionary') {
      if (responseData.totalNominations !== 1) throw new Error('Wrong totalNominations');
      if (responseData.nominationsByStatus.completed !== 1) throw new Error('Wrong nominationsByStatus.completed');
      if (responseData.completionRate !== 100) throw new Error('Wrong completionRate');
      if (responseData.totalSubmissions !== 2) throw new Error('Wrong totalSubmissions for functionary');
    }
    console.log('✅ Correctness verified for', label);
  }

  await test(admin, 'Admin');
  await test(functionary, 'Functionary');

  await mongoose.disconnect();
  await mongo.stop();
  console.log('\n--- ALL VERIFICATIONS PASSED ---');
}

verifyCorrectness().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function verifyStats() {
  const mongod = await MongoMemoryServer.create({
    instance: {
       launchTimeout: 120000
    }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Seeding verification data...');

  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  const form = await Form.create({
    title: `Test Form`,
    adminId: admin._id,
    status: 'active',
    shareableLink: `link-test`
  });

  const teacher = await User.create({
    email: `teacher@test.com`,
    role: 'teacher',
    profile: { fullName: `Teacher`, schoolCode: `SCH1` }
  });

  const submission = await Submission.create({
    formId: form._id,
    userId: teacher._id,
    status: 'submitted',
    schoolCode: `SCH1`
  });

  const functionary = await User.create({
    email: `func@test.com`,
    role: 'functionary',
    profile: { fullName: `Func` },
    school_code: 'SCH1'
  });

  await Nomination.create({
    form_id: form._id,
    functionary_id: functionary._id,
    teacher_name: 'Teacher',
    teacher_email: 'teacher@test.com',
    school_code: 'SCH1',
    status: 'completed'
  });

  console.log('Data seeded. Verifying response structure...');

  const req = {
    user: functionary,
  } as any;

  let capturedData: any = null;
  const res = {
    status: () => res,
    json: (data: any) => {
       capturedData = data;
    }
  } as any;

  await getStats(req, res);

  const expectedKeys = [
    'totalUsers',
    'activeForms',
    'draftForms',
    'expiredForms',
    'totalSubmissions',
    'submissionsByStatus',
    'usersByRole',
    'totalNominations',
    'nominationsByStatus',
    'completionRate'
  ];

  console.log('Response data:', JSON.stringify(capturedData, null, 2));

  let missingKeys = expectedKeys.filter(key => !(key in capturedData));
  if (missingKeys.length > 0) {
    console.error('❌ Missing keys in response:', missingKeys);
    process.exit(1);
  }

  // Verify internal structures
  if (!('submitted' in capturedData.submissionsByStatus)) {
      console.error('❌ Missing submissionsByStatus.submitted');
      process.exit(1);
  }

  if (!('admin' in capturedData.usersByRole)) {
      console.error('❌ Missing usersByRole.admin');
      process.exit(1);
  }

  if (capturedData.totalNominations !== 1) {
      console.error(`❌ Expected totalNominations 1, got ${capturedData.totalNominations}`);
      process.exit(1);
  }

  console.log('✅ Response structure and data verification passed!');

  await mongoose.disconnect();
  await mongod.stop();
}

verifyStats().catch(err => {
    console.error(err);
    process.exit(1);
});

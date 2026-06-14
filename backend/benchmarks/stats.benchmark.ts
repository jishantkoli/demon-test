import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function setupData() {
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  console.log('Seeding users...');
  const teachers = [];
  for (let i = 0; i < 200; i++) {
    teachers.push({
      email: `teacher${i}@test.com`,
      role: 'teacher',
      profile: { fullName: `Teacher ${i}` }
    });
  }
  await User.insertMany(teachers);

  console.log('Seeding forms...');
  const forms = [];
  for (let i = 0; i < 20; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      adminId: admin._id,
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  console.log('Seeding submissions...');
  const submissions = [];
  for (let i = 0; i < 1000; i++) {
    submissions.push({
      formId: createdForms[i % 20]._id,
      status: ['submitted', 'under_review', 'approved', 'rejected'][i % 4],
      userEmail: `teacher${i % 200}@test.com`
    });
  }
  await Submission.insertMany(submissions);

  return admin;
}

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create({
    binary: {
      version: '6.0.4'
    },
    instance: {
        launchTimeout: 120000
    }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const admin = await setupData();

  const req = {
    user: admin
  } as any;

  let lastResponse: any = null;
  const res = {
    status: () => res,
    json: (data: any) => {
        lastResponse = data;
        return res;
    }
  } as any;

  console.log('Starting benchmark...');
  const start = Date.now();
  const iterations = 50;

  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }

  const end = Date.now();
  console.log(`Average execution time: ${(end - start) / iterations}ms`);

  // Verify response structure
  const expectedKeys = [
    'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
    'totalSubmissions', 'submissionsByStatus', 'usersByRole',
    'totalNominations', 'nominationsByStatus', 'completionRate'
  ];

  for (const key of expectedKeys) {
    if (!(key in lastResponse)) {
        console.error(`Verification FAILED: Missing key ${key}`);
        process.exit(1);
    }
  }
  console.log('Verification PASSED: All expected keys present.');
  console.log('Sample response:', JSON.stringify(lastResponse, null, 2));

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

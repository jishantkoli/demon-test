
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './models/User.js';
import { Form } from './models/Form.js';
import { Submission } from './models/Submission.js';
import { Nomination } from './models/Nomination.js';
import { getStats } from './controllers/stats.js';
import { Response } from 'express';

async function setupData() {
  console.log('Setting up benchmark data...');

  // Create 1000 users
  const users = [];
  for (let i = 0; i < 1000; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: i < 10 ? 'admin' : (i < 50 ? 'reviewer' : (i < 200 ? 'functionary' : 'teacher')),
      profile: { fullName: `User ${i}`, schoolCode: `SCHOOL${i % 50}` }
    });
  }
  await User.insertMany(users);
  const dbUsers = await User.find();
  const functionaries = dbUsers.filter(u => u.role === 'functionary');

  // Create 100 forms
  const forms = [];
  for (let i = 0; i < 100; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      shareableLink: `link-${i}`,
      adminId: dbUsers[0]._id
    });
  }
  await Form.insertMany(forms);
  const dbForms = await Form.find();

  // Create 5000 nominations
  const nominations = [];
  for (let i = 0; i < 5000; i++) {
    const func = functionaries[i % functionaries.length];
    nominations.push({
      form_id: dbForms[i % dbForms.length]._id,
      functionary_id: func._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@example.com`,
      school_code: func.profile.schoolCode,
      status: i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'invited' : 'completed'),
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Create 5000 submissions
  const submissions = [];
  for (let i = 0; i < 5000; i++) {
    submissions.push({
      formId: dbForms[i % dbForms.length]._id,
      userId: dbUsers[200 + (i % 800)]._id,
      status: i % 4 === 0 ? 'submitted' : (i % 4 === 1 ? 'under_review' : (i % 4 === 2 ? 'approved' : 'rejected')),
      schoolCode: `SCHOOL${(i % 50)}`
    });
  }
  await Submission.insertMany(submissions);

  console.log('Data setup complete.');
  return { functionary: functionaries[0], admin: dbUsers[0] };
}

async function runBenchmark(user: any) {
  const req = {
    user: user
  } as any;

  let lastResponse: any;
  const res = {
    status: () => res,
    json: (data: any) => { lastResponse = data; return res; }
  } as any;

  const start = Date.now();
  const iterations = 10;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = Date.now();

  // Verification
  const expectedKeys = [
    'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
    'totalSubmissions', 'submissionsByStatus', 'usersByRole',
    'totalNominations', 'nominationsByStatus', 'completionRate'
  ];
  for (const key of expectedKeys) {
    if (lastResponse[key] === undefined) {
      throw new Error(`Missing expected key in response: ${key}`);
    }
  }

  return (end - start) / iterations;
}

async function main() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const { functionary, admin } = await setupData();

  console.log('\n--- Latency Benchmark (Average of 10 runs) ---');

  const adminLatency = await runBenchmark(admin);
  console.log(`Admin getStats Latency: ${adminLatency.toFixed(2)}ms`);

  const funcLatency = await runBenchmark(functionary);
  console.log(`Functionary getStats Latency: ${funcLatency.toFixed(2)}ms`);

  await mongoose.disconnect();
  await mongoServer.stop();
}

main().catch(console.error);

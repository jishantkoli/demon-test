import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
// We'll mock the Request and Response to call the controller directly
import { getStats } from '../src/controllers/stats.js';

async function setupData() {
  // Create some users
  const admin = await User.create({ email: 'admin@test.com', role: 'admin', profile: { fullName: 'Admin' } });
  await User.create({ email: 'reviewer@test.com', role: 'reviewer', profile: { fullName: 'Reviewer' } });
  await User.create({ email: 'func@test.com', role: 'functionary', profile: { fullName: 'Functionary', schoolCode: 'S1' } });

  const teachers = [];
  for (let i = 0; i < 50; i++) {
    teachers.push({ email: `teacher${i}@test.com`, role: 'teacher', profile: { fullName: `Teacher ${i}`, schoolCode: 'S1' } });
  }
  await User.insertMany(teachers);

  // Create some forms
  const form = await Form.create({ title: 'Form 1', status: 'active', adminId: admin._id, shareableLink: 'f1' });
  await Form.create({ title: 'Form 2', status: 'draft', adminId: admin._id, shareableLink: 'f2' });

  // Create some submissions
  const submissions = [];
  for (let i = 0; i < 100; i++) {
    submissions.push({
      formId: form._id,
      status: i % 4 === 0 ? 'submitted' : (i % 4 === 1 ? 'under_review' : (i % 4 === 2 ? 'approved' : 'rejected')),
      userEmail: `teacher${i % 50}@test.com`,
      schoolCode: 'S1'
    });
  }
  await Submission.insertMany(submissions);

  return { admin };
}

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const { admin } = await setupData();

  const req = {
    user: admin
  } as any;

  const res = {
    status: () => res,
    json: () => res
  } as any;

  console.log('Starting benchmark...');
  const start = Date.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = Date.now();
  console.log(`Average execution time: ${(end - start) / iterations}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

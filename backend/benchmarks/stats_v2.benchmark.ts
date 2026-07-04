import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Connected to in-memory MongoDB');

  // Seed more data to make it more realistic
  const admin = await User.create({
    email: 'admin@example.com',
    role: 'admin',
    profile: { fullName: 'Admin User' }
  });

  console.log('Seeding data...');

  // 100 users
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: i % 4 === 0 ? 'admin' : i % 4 === 1 ? 'reviewer' : i % 4 === 2 ? 'functionary' : 'teacher',
      profile: { fullName: `User ${i}` }
    });
  }
  await User.insertMany(users);

  // 50 forms
  const forms = [];
  for (let i = 0; i < 50; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'draft' : 'expired',
      adminId: admin._id,
      shareableLink: `link${i}`
    });
  }
  await Form.insertMany(forms);

  // 500 submissions
  const submissions = [];
  const statuses = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let i = 0; i < 500; i++) {
    submissions.push({
      formId: new mongoose.Types.ObjectId(),
      status: statuses[i % 4],
      userEmail: `teacher${i % 25}@example.com`,
      schoolCode: 'SC001'
    });
  }
  await Submission.insertMany(submissions);

  const req = {
    user: admin
  } as any;

  const res = {
    status: (code: number) => ({
      json: (data: any) => {}
    })
  } as any;

  console.log('Starting benchmark (100 iterations)...');

  // Warm up
  for (let i = 0; i < 10; i++) {
    await getStats(req, res);
  }

  const start = Date.now();
  const iterations = 100;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = Date.now();
  const totalTime = end - start;
  console.log(`Total time for ${iterations} iterations: ${totalTime}ms`);
  console.log(`Average execution time: ${totalTime / iterations}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

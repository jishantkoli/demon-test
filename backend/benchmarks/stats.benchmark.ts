import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create({
    instance: {
       launchTimeout: 120000
    }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data (larger set)...');

  // Create an admin
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  // Create forms
  const forms = [];
  for (let i = 0; i < 100; i++) {
    forms.push({
      title: `Form ${i}`,
      adminId: admin._id,
      status: i < 50 ? 'active' : (i < 75 ? 'draft' : 'expired'),
      shareableLink: `link-${i}`
    });
  }
  await Form.insertMany(forms);

  // Create users
  const users = [];
  for (let i = 0; i < 1000; i++) {
    users.push({
      email: `user${i}@test.com`,
      role: i < 50 ? 'reviewer' : (i < 150 ? 'functionary' : 'teacher'),
      profile: { fullName: `User ${i}`, schoolCode: `SCH${i%50}` }
    });
  }
  const createdUsers = await User.insertMany(users);

  // Create submissions
  const submissions = [];
  const statuses = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let i = 0; i < 5000; i++) {
    submissions.push({
      formId: (await Form.findOne({}))?._id,
      userId: createdUsers[i % 1000]._id,
      status: statuses[i % 4],
      schoolCode: `SCH${i % 50}`
    });
  }
  await Submission.insertMany(submissions);

  console.log('Data seeded. Running benchmark...');

  const req = {
    user: admin,
  } as any;

  const res = {
    status: () => res,
    json: (data: any) => {}
  } as any;

  const start = performance.now();
  for(let i=0; i<10; i++) {
    await getStats(req, res);
  }
  const end = performance.now();
  console.log(`Average time for getStats (Admin): ${(end - start) / 10}ms`);

  // Test for functionary
  const functionary = await User.findOne({ role: 'functionary' });
  const reqFunc = {
    user: functionary,
  } as any;

  const startFunc = performance.now();
  for(let i=0; i<10; i++) {
    await getStats(reqFunc, res);
  }
  const endFunc = performance.now();
  console.log(`Average time for getStats (Functionary): ${(endFunc - startFunc) / 10}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

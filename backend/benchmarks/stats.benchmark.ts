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

  console.log('Seeding data for benchmark...');

  // Create an admin
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  // Create 100 users
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
      email: `user${i}@test.com`,
      role: i % 10 === 0 ? 'reviewer' : (i % 5 === 0 ? 'functionary' : 'teacher'),
      profile: { fullName: `User ${i}`, schoolCode: `SCHOOL_${i % 5}` }
    });
  }
  await User.insertMany(users);

  // Create 20 forms
  const forms = [];
  for (let i = 0; i < 20; i++) {
    forms.push({
      title: `Form ${i}`,
      adminId: admin._id,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      formType: 'normal',
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  // Create 500 submissions
  const submissions = [];
  const statusEnum = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let i = 0; i < 500; i++) {
    submissions.push({
      formId: createdForms[i % createdForms.length]._id,
      status: statusEnum[i % statusEnum.length],
      schoolCode: `SCHOOL_${i % 5}`
    });
  }
  await Submission.insertMany(submissions);

  console.log('Data seeded. Running benchmark...');

  const mockReq = {
    user: {
      _id: admin._id,
      role: 'admin',
      email: 'admin@test.com'
    }
  } as any;

  const mockRes = {
    status: () => mockRes,
    json: (data: any) => {
        // console.log('Response data received');
    }
  } as any;

  // Warm up
  for (let i = 0; i < 5; i++) {
    await getStats(mockReq, mockRes);
  }

  const start = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    await getStats(mockReq, mockRes);
  }
  const end = performance.now();

  console.log(`Average execution time over ${iterations} runs: ${((end - start) / iterations).toFixed(2)}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

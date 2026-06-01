import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './models/User.js';
import { Form } from './models/Form.js';
import { Submission } from './models/Submission.js';
import { Nomination } from './models/Nomination.js';
import { getStats } from './controllers/stats.js';

async function benchmark() {
  console.log('Starting MongoMemoryServer...');
  const mongoServer = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 120000,
    },
    binary: {
      version: '6.0.4',
    }
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data for benchmark...');

  // Seed Users
  const admin = await User.create({ email: 'admin@test.com', role: 'admin', profile: { fullName: 'Admin' } });
  const functionary = await User.create({ email: 'func@test.com', role: 'functionary', profile: { fullName: 'Func', schoolCode: 'SCH001' }, school_code: 'SCH001' });
  const teacher = await User.create({ email: 'teacher@test.com', role: 'teacher', profile: { fullName: 'Teacher' } });

  const otherUsers = [];
  for (let i = 0; i < 500; i++) {
    otherUsers.push({ email: `user${i}@test.com`, role: 'teacher', profile: { fullName: `User ${i}` } });
  }
  await User.insertMany(otherUsers);

  // Seed Forms
  const forms = [];
  for (let i = 0; i < 100; i++) {
    forms.push({
      title: `Form ${i}`,
      adminId: admin._id,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      formType: 'normal',
      shareableLink: `form-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  // Seed Nominations
  const nominations = [];
  for (let i = 0; i < 1000; i++) {
    nominations.push({
      form_id: createdForms[0]._id,
      functionary_id: functionary._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@test.com`,
      school_code: 'SCH001',
      status: i % 2 === 0 ? 'completed' : 'pending',
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Seed Submissions
  const submissions = [];
  const statuses = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let i = 0; i < 1000; i++) {
    submissions.push({
      formId: createdForms[0]._id,
      userId: teacher._id,
      status: statuses[i % 4],
      schoolCode: 'SCH001'
    });
  }
  await Submission.insertMany(submissions);

  console.log('Data seeded. Starting benchmark...');

  const mockRes = {
    status: function(s: number) { this.statusCode = s; return this; },
    json: function(data: any) { this.data = data; return this; },
    statusCode: 0,
    data: null as any
  };

  const runs = 5;
  const roles = ['admin', 'functionary', 'teacher'] as const;

  for (const role of roles) {
    let currentUser;
    if (role === 'admin') currentUser = admin;
    else if (role === 'functionary') currentUser = functionary;
    else currentUser = teacher;

    const mockReq = {
      user: currentUser
    } as any;

    console.log(`\nBenchmarking getStats for role: ${role}`);
    // Warmup
    await getStats(mockReq, mockRes as any);

    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      await getStats(mockReq, mockRes as any);
    }
    const end = performance.now();
    console.log(`Average time over ${runs} runs: ${((end - start) / runs).toFixed(2)}ms`);
  }

  await mongoose.disconnect();
  await mongoServer.stop();
  process.exit(0);
}

benchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});

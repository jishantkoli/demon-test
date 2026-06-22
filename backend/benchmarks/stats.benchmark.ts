import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function seed(userCount: number, formCount: number, subCount: number) {
  const users = [];
  const roles = ['admin', 'reviewer', 'functionary', 'teacher'];

  for (let i = 0; i < userCount; i++) {
    users.push({
      email: `user${i}@test.com`,
      role: roles[i % roles.length],
      profile: { fullName: `User ${i}`, schoolCode: `SCHOOL${i % 10}` }
    });
  }
  const seededUsers = await User.insertMany(users);

  const forms = [];
  const statuses = ['active', 'draft', 'expired'];
  for (let i = 0; i < formCount; i++) {
    forms.push({
      title: `Form ${i}`,
      status: statuses[i % statuses.length],
      shareableLink: `link-${i}`
    });
  }
  const seededForms = await Form.insertMany(forms);

  const submissions = [];
  const subStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let i = 0; i < subCount; i++) {
    const user = seededUsers[i % seededUsers.length];
    submissions.push({
      formId: seededForms[i % seededForms.length]._id,
      userId: user._id,
      userEmail: user.email,
      schoolCode: user.profile?.schoolCode,
      status: subStatuses[i % subStatuses.length]
    });
  }
  await Submission.insertMany(submissions);

  const nominations = [];
  const nomStatuses = ['pending', 'invited', 'completed'];
  for (let i = 0; i < 50; i++) {
    nominations.push({
      form_id: seededForms[0]._id,
      functionary_id: seededUsers.find(u => u.role === 'functionary')?._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@test.com`,
      school_code: `SCHOOL${i % 10}`,
      status: nomStatuses[i % nomStatuses.length],
      unique_token: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    });
  }
  await Nomination.insertMany(nominations);

  return seededUsers.find(u => u.role === 'admin');
}

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create({
    binary: { version: '6.0.4' },
    instance: { launchTimeout: 120000 }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data...');
  const adminUser = await seed(200, 50, 1000);
  console.log('Data seeded.');

  const mockReq = {
    user: adminUser
  } as any;
  const mockRes = {
    status: () => mockRes,
    json: (data: any) => {
       // console.log('Response keys:', Object.keys(data));
    }
  } as any;

  console.log('Running getStats benchmark...');
  const start = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    await getStats(mockReq, mockRes);
  }
  const end = performance.now();

  const avgTime = (end - start) / iterations;
  console.log(`Average execution time over ${iterations} runs: ${avgTime.toFixed(4)}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

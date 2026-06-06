import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function setupData() {
  // Create 100 users
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: i < 5 ? 'admin' : (i < 20 ? 'functionary' : (i < 40 ? 'reviewer' : 'teacher')),
      profile: { fullName: `User ${i}`, schoolCode: `SCHOOL${i % 10}` }
    });
  }
  const createdUsers = await User.insertMany(users);

  // Create 20 forms
  const forms = [];
  for (let i = 0; i < 20; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  // Create 500 nominations
  const nominations = [];
  const functionaries = createdUsers.filter(u => u.role === 'functionary');
  const teachers = createdUsers.filter(u => u.role === 'teacher');
  for (let i = 0; i < 500; i++) {
    const f = functionaries[i % functionaries.length];
    const t = teachers[i % teachers.length];
    const form = createdForms[i % createdForms.length];
    nominations.push({
      form_id: form._id,
      functionary_id: f._id,
      teacher_name: t.profile.fullName,
      teacher_email: t.email,
      school_code: t.profile.schoolCode,
      status: i % 2 === 0 ? 'completed' : 'pending',
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Create 1000 submissions
  const submissions = [];
  for (let i = 0; i < 1000; i++) {
    const u = teachers[i % teachers.length];
    const form = createdForms[i % createdForms.length];
    submissions.push({
      formId: form._id,
      userId: u._id,
      userEmail: u.email,
      schoolCode: u.profile.schoolCode,
      status: ['submitted', 'under_review', 'approved', 'rejected'][i % 4],
      responses: []
    });
  }
  await Submission.insertMany(submissions);

  return { createdUsers, createdForms };
}

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create({
    binary: { version: '6.0.4' }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Connected to in-memory DB. Seeding data...');
  const { createdUsers } = await setupData();
  console.log('Data seeded.');

  const adminUser = createdUsers.find(u => u.role === 'admin');
  const functionaryUser = createdUsers.find(u => u.role === 'functionary');
  const teacherUser = createdUsers.find(u => u.role === 'teacher');

  const roles = [
    { name: 'Admin', user: adminUser },
    { name: 'Functionary', user: functionaryUser },
    { name: 'Teacher', user: teacherUser }
  ];

  for (const role of roles) {
    console.log(`\nBenchmarking for role: ${role.name}`);
    const req = {
      user: role.user
    } as any;

    const res = {
      status: () => res,
      json: () => res
    } as any;

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await getStats(req, res);
    }
    const end = performance.now();
    console.log(`Average time for 10 runs: ${((end - start) / 10).toFixed(2)}ms`);
  }

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

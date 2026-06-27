import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

const NUM_USERS = 20;
const NUM_FORMS = 5;
const NUM_SUBMISSIONS = 20;
const NUM_NOMINATIONS = 10;

async function setupDB() {
  console.log('Setting up in-memory MongoDB...');
  const mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
    binary: { version: '8.2.1' }
  });
  await mongoose.connect(mongoServer.getUri());
  console.log('MongoDB connected.');
  return mongoServer;
}

async function seedData() {
  console.log('Seeding data...');
  const roles = ['admin', 'reviewer', 'functionary', 'teacher'];
  const users = [];
  for (let i = 0; i < NUM_USERS; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: roles[i % roles.length],
      profile: { fullName: `User ${i}`, schoolCode: `SCH${i % 10}` }
    });
  }
  const createdUsers = await User.insertMany(users);

  const statuses = ['active', 'draft', 'expired'];
  const forms = [];
  for (let i = 0; i < NUM_FORMS; i++) {
    forms.push({
      title: `Form ${i}`,
      status: statuses[i % statuses.length],
      adminId: createdUsers[0]._id,
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  const subStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
  const submissions = [];
  for (let i = 0; i < NUM_SUBMISSIONS; i++) {
    submissions.push({
      formId: createdForms[i % NUM_FORMS]._id,
      userId: createdUsers[i % NUM_USERS]._id,
      status: subStatuses[i % subStatuses.length],
      schoolCode: `SCH${(i % NUM_USERS) % 10}`
    });
  }
  await Submission.insertMany(submissions);

  const nominations = [];
  for (let i = 0; i < NUM_NOMINATIONS; i++) {
    nominations.push({
      form_id: createdForms[i % NUM_FORMS]._id,
      functionary_id: createdUsers.find(u => u.role === 'functionary')._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@example.com`,
      school_code: `SCH${i % 10}`,
      status: i % 2 === 0 ? 'completed' : 'pending'
    });
  }
  await Nomination.insertMany(nominations);
  console.log('Data seeded.');

  return createdUsers.find(u => u.role === 'admin');
}

async function benchmark() {
  const mongoServer = await setupDB();
  const adminUser = await seedData();

  const req = {
    user: {
      _id: adminUser._id,
      role: adminUser.role,
      email: adminUser.email
    }
  } as any;

  const res = {
    status: (code: number) => {
        return res;
    },
    json: (data: any) => {
        return res;
    }
  } as any;

  console.log('Starting benchmark...');
  const start = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = performance.now();
  console.log(`Average time for getStats: ${(end - start) / iterations}ms`);

  await mongoose.disconnect();
  await mongoServer.stop();
}

benchmark().catch(console.error);

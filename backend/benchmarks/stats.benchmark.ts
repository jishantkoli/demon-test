import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function setupDB() {
  const mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
    binary: { version: '6.0.4' }
  });
  await mongoose.connect(mongoServer.getUri());
  return mongoServer;
}

async function seedData() {
  console.log('🌱 Seeding data for benchmark...');

  // Create 1000 users
  const users = [];
  for (let i = 0; i < 1000; i++) {
    const role = i < 10 ? 'admin' : i < 50 ? 'reviewer' : i < 200 ? 'functionary' : 'teacher';
    users.push({
      email: `user${i}@example.com`,
      role,
      profile: {
        fullName: `User ${i}`,
        schoolCode: `SCH${Math.floor(i / 10)}`
      }
    });
  }
  const createdUsers = await User.insertMany(users);
  const functionaries = createdUsers.filter(u => u.role === 'functionary');
  const teachers = createdUsers.filter(u => u.role === 'teacher');

  // Create 50 forms
  const forms = [];
  for (let i = 0; i < 50; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'draft' : 'expired',
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);
  const activeForms = createdForms.filter(f => f.status === 'active');

  // Create 2000 nominations
  const nominations = [];
  for (let i = 0; i < 2000; i++) {
    const teacher = teachers[i % teachers.length];
    const functionary = functionaries[i % functionaries.length];
    const form = activeForms[i % activeForms.length];
    nominations.push({
      form_id: form._id,
      functionary_id: functionary._id,
      teacher_name: teacher.profile.fullName,
      teacher_email: teacher.email,
      school_code: teacher.profile.schoolCode,
      status: i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'invited' : 'completed',
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Create 5000 submissions
  const submissions = [];
  for (let i = 0; i < 5000; i++) {
    const teacher = teachers[i % teachers.length];
    const form = activeForms[i % activeForms.length];
    submissions.push({
      formId: form._id,
      userId: teacher._id,
      userEmail: teacher.email,
      schoolCode: teacher.profile.schoolCode,
      status: i % 4 === 0 ? 'submitted' : i % 4 === 1 ? 'under_review' : i % 4 === 2 ? 'approved' : 'rejected',
      isDraft: false
    });
  }
  await Submission.insertMany(submissions);

  console.log('✅ Data seeded');
  return { admin: createdUsers.find(u => u.role === 'admin'), functionary: functionaries[0], teacher: teachers[0] };
}

async function runBenchmark(users: any) {
  const roles = ['admin', 'functionary', 'teacher'];

  for (const roleName of roles) {
    const user = users[roleName];
    const req = {
      user: {
        _id: user._id,
        role: user.role,
        email: user.email,
        school_code: user.profile.schoolCode
      }
    } as any;

    const res = {
      status: () => res,
      json: () => {}
    } as any;

    console.log(`\n--- Benchmarking role: ${roleName} ---`);

    // Warm up
    await getStats(req, res);

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await getStats(req, res);
    }
    const end = performance.now();
    console.log(`Average time for ${roleName}: ${((end - start) / 10).toFixed(2)}ms`);
  }
}

async function main() {
  const mongoServer = await setupDB();
  const users = await seedData();
  await runBenchmark(users);
  await mongoose.disconnect();
  await mongoServer.stop();
}

main().catch(console.error);

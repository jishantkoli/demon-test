import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../models/User.js';
import { Form } from '../models/Form.js';
import { Submission } from '../models/Submission.js';
import { Nomination } from '../models/Nomination.js';
import { getStats } from '../controllers/stats.js';

const BENCHMARK_ITERATIONS = 10;

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('--- Seeding Data ---');

  // Create an admin user
  const admin = await User.create({
    email: 'admin@example.com',
    passwordHash: 'hash',
    role: 'admin',
    profile: { fullName: 'Admin User' }
  });

  // Create a functionary user
  const functionary = await User.create({
    email: 'func@example.com',
    passwordHash: 'hash',
    role: 'functionary',
    profile: { fullName: 'Func User', schoolCode: 'SCH001' }
  });

  // Create a teacher user
  const teacher = await User.create({
    email: 'teacher@example.com',
    passwordHash: 'hash',
    role: 'teacher',
    profile: { fullName: 'Teacher User' }
  });

  // Seed forms
  const forms = [];
  for (let i = 0; i < 50; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      shareableLink: `link-${i}`
    });
  }
  await Form.insertMany(forms);
  const allForms = await Form.find();

  // Seed nominations
  const nominations = [];
  for (let i = 0; i < 200; i++) {
    nominations.push({
      form_id: allForms[i % allForms.length]._id,
      functionary_id: functionary._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: i === 0 ? 'teacher@example.com' : `teacher${i}@example.com`,
      school_code: 'SCH001',
      status: i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'invited' : 'completed'),
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Seed submissions
  const submissions = [];
  for (let i = 0; i < 500; i++) {
    submissions.push({
      formId: allForms[i % allForms.length]._id,
      userId: i % 10 === 0 ? teacher._id : null,
      userEmail: i % 10 === 0 ? 'teacher@example.com' : `user${i}@example.com`,
      schoolCode: 'SCH001',
      status: ['submitted', 'under_review', 'approved', 'rejected'][i % 4],
      isDraft: false,
      responses: []
    });
  }
  await Submission.insertMany(submissions);

  console.log('--- Running Benchmarks ---');

  const roles = ['admin', 'functionary', 'teacher'];
  const users = { admin, functionary, teacher };

  for (const role of roles) {
    const user = (users as any)[role];
    const req = {
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        school_code: (user.profile as any).schoolCode
      }
    } as any;

    const res = {
      status: () => res,
      json: () => {}
    } as any;

    // Warm up
    await getStats(req, res);

    const start = performance.now();
    for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
      await getStats(req, res);
    }
    const end = performance.now();
    console.log(`${role} getStats average time: ${((end - start) / BENCHMARK_ITERATIONS).toFixed(2)}ms`);
  }

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function runBenchmark() {
  const mongoServer = await MongoMemoryServer.create({
    instance: {
      launchTimeoutMS: 120000,
    }
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data for benchmark (Medium Dataset)...');

  // Seed Users
  const roles = ['admin', 'reviewer', 'functionary', 'teacher'];
  const users = [];
  for (let i = 0; i < 200; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: roles[i % roles.length],
      profile: { fullName: `User ${i}`, schoolCode: `SCH${i % 20}` }
    });
  }
  await User.insertMany(users);
  const adminUser = await User.findOne({ role: 'admin' });
  const funcUser = await User.findOne({ role: 'functionary' });

  // Seed Forms
  const forms = [];
  for (let i = 0; i < 30; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      shareableLink: `link-${i}`
    });
  }
  await Form.insertMany(forms);

  // Seed Nominations
  const allForms = await Form.find();
  const nominations = [];
  for (let i = 0; i < 500; i++) {
    nominations.push({
      form_id: allForms[i % allForms.length]._id,
      functionary_id: funcUser?._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@example.com`,
      school_code: `SCH${i % 20}`,
      status: i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'invited' : 'completed'),
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Seed Submissions
  const submissions = [];
  for (let i = 0; i < 1000; i++) {
    submissions.push({
      formId: allForms[i % allForms.length]._id,
      userId: users[i % users.length]._id,
      status: ['submitted', 'under_review', 'approved', 'rejected'][i % 4],
      schoolCode: `SCH${i % 20}`
    });
  }
  await Submission.insertMany(submissions);

  console.log('Data seeded. Running benchmark...');

  const req = {
    user: adminUser,
  } as any;

  const res = {
    status: () => res,
    json: () => res,
  } as any;

  // Warm up
  await getStats(req, res);

  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    await getStats(req, res);
  }
  const end = performance.now();

  console.log(`Average execution time (Admin): ${((end - start) / 10).toFixed(2)}ms`);

  const reqFunc = {
    user: funcUser,
  } as any;

  const startFunc = performance.now();
  for (let i = 0; i < 10; i++) {
    await getStats(reqFunc, res);
  }
  const endFunc = performance.now();

  console.log(`Average execution time (Functionary): ${((endFunc - startFunc) / 10).toFixed(2)}ms`);

  await mongoose.disconnect();
  await mongoServer.stop();
}

runBenchmark().catch(console.error);

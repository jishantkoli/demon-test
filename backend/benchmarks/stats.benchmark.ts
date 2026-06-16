import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function setup() {
  const mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
    binary: { version: '6.0.4' }
  });
  await mongoose.connect(mongoServer.getUri());

  console.log('Seeding data for benchmark...');

  // Reduced data for faster run in restricted environment
  const users = [];
  for (let i = 0; i < 50; i++) {
    users.push({
      email: `user${i}@test.com`,
      role: i < 2 ? 'admin' : (i < 5 ? 'reviewer' : (i < 10 ? 'functionary' : 'teacher')),
      profile: { fullName: `User ${i}`, schoolCode: `SCH${i % 5}` }
    });
  }
  await User.insertMany(users);
  const adminUser = await User.findOne({ role: 'admin' });
  const funcUser = await User.findOne({ role: 'functionary' });

  const forms = [];
  for (let i = 0; i < 10; i++) {
    forms.push({
      title: `Form ${i}`,
      adminId: adminUser!._id,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      formType: 'normal'
    });
  }
  await Form.insertMany(forms);

  const activeForms = await Form.find({ status: 'active' });
  const submissions = [];
  for (let i = 0; i < 100; i++) {
    submissions.push({
      formId: activeForms[i % activeForms.length]._id,
      userId: users[10 + (i % 40)]._id,
      status: i % 4 === 0 ? 'submitted' : (i % 4 === 1 ? 'under_review' : (i % 4 === 2 ? 'approved' : 'rejected')),
      schoolCode: `SCH${i % 5}`
    });
  }
  await Submission.insertMany(submissions);

  const nominations = [];
  for (let i = 0; i < 50; i++) {
    nominations.push({
      form_id: activeForms[0]._id,
      functionary_id: funcUser!._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@test.com`,
      school_code: 'SCH1',
      status: i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'invited' : 'completed')
    });
  }
  await Nomination.insertMany(nominations);

  console.log('Seed complete.');
  return { adminUser, funcUser };
}

async function runBenchmark(user: any) {
  const req = {
    user: user,
    query: {}
  } as any;

  const res = {
    status: () => res,
    json: () => res
  } as any;

  const start = Date.now();
  const iterations = 20;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = Date.now();
  console.log(`Average execution time for ${user.role}: ${(end - start) / iterations}ms`);
}

async function main() {
  const { adminUser, funcUser } = await setup();

  console.log('\nRunning benchmarks (Sequential/Current)...');
  await runBenchmark(adminUser);
  await runBenchmark(funcUser);

  process.exit(0);
}

main().catch(console.error);

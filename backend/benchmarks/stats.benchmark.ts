import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function runBenchmark() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data for benchmark...');
  // Seed some data
  const admin = await User.create({ email: 'admin@test.com', role: 'admin', profile: { fullName: 'Admin' } });

  const teacherCount = 100;
  const teachers = [];
  for (let i = 0; i < teacherCount; i++) {
    teachers.push({ email: `teacher${i}@test.com`, role: 'teacher', profile: { fullName: `Teacher ${i}` } });
  }
  await User.insertMany(teachers);

  const formCount = 20;
  const forms = [];
  for (let i = 0; i < formCount; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      adminId: admin._id,
      shareableLink: `link-${i}`
    });
  }
  await Form.insertMany(forms);

  const submissionCount = 500;
  const submissions = [];
  const statuses = ['submitted', 'under_review', 'approved', 'rejected'];
  const activeForms = await Form.find({ status: 'active' });
  const allTeachers = await User.find({ role: 'teacher' });

  for (let i = 0; i < submissionCount; i++) {
    submissions.push({
      formId: activeForms[i % activeForms.length]._id,
      userId: allTeachers[i % allTeachers.length]._id,
      status: statuses[i % statuses.length],
      responses: []
    });
  }
  await Submission.insertMany(submissions);

  console.log('Running benchmark for getStats (Admin)...');

  const req = {
    user: admin,
  } as any;
  const res = {
    status: () => res,
    json: () => res,
  } as any;

  // Warm up
  await getStats(req, res);

  const start = Date.now();
  const iterations = 10;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = Date.now();
  console.log(`Average execution time: ${(end - start) / iterations}ms`);

  await mongoose.disconnect();
  await mongo.stop();
}

runBenchmark().catch(console.error);

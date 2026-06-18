import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create({
    binary: {
      version: '6.0.4'
    },
    instance: {
      launchTimeout: 120000
    }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Seed data...');
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
      email: `user${i}@test.com`,
      role: 'teacher',
      profile: { fullName: `User ${i}` }
    });
  }
  await User.insertMany(users);

  const forms = [];
  for (let i = 0; i < 10; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 2 === 0 ? 'active' : 'draft',
      shareableLink: `link-${i}`
    });
  }
  await Form.insertMany(forms);

  const submissions = [];
  for (let i = 0; i < 500; i++) {
    submissions.push({
      formId: new mongoose.Types.ObjectId(),
      status: ['submitted', 'under_review', 'approved', 'rejected'][i % 4],
      userEmail: `user${i % 100}@test.com`
    });
  }
  await Submission.insertMany(submissions);

  console.log('Running benchmark for getStats (Admin role)...');

  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    // Simplified version of getStats logic for admin
    await Promise.all([
      User.countDocuments(),
      Form.countDocuments({ status: 'active' }),
      Form.countDocuments({ status: 'draft' }),
      Form.countDocuments({ status: 'expired' }),
      Submission.countDocuments({}),
      Submission.countDocuments({ status: 'submitted' }),
      Submission.countDocuments({ status: 'under_review' }),
      Submission.countDocuments({ status: 'approved' }),
      Submission.countDocuments({ status: 'rejected' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'reviewer' }),
      User.countDocuments({ role: 'functionary' }),
      User.countDocuments({ role: 'teacher' }),
    ]);
  }
  const end = performance.now();
  console.log(`Average time for sequential (mocked admin): ${(end - start) / 100}ms`);

  // Aggregate version
  const startAgg = performance.now();
  for (let i = 0; i < 100; i++) {
    await Promise.all([
        User.aggregate([{ $facet: {
            total: [{ $count: 'count' }],
            admin: [{ $match: { role: 'admin' } }, { $count: 'count' }],
            reviewer: [{ $match: { role: 'reviewer' } }, { $count: 'count' }],
            functionary: [{ $match: { role: 'functionary' } }, { $count: 'count' }],
            teacher: [{ $match: { role: 'teacher' } }, { $count: 'count' }]
        }}]),
        Form.aggregate([{ $facet: {
            active: [{ $match: { status: 'active' } }, { $count: 'count' }],
            draft: [{ $match: { status: 'draft' } }, { $count: 'count' }],
            expired: [{ $match: { status: 'expired' } }, { $count: 'count' }]
        }}]),
        Submission.aggregate([{ $facet: {
            total: [{ $count: 'count' }],
            submitted: [{ $match: { status: 'submitted' } }, { $count: 'count' }],
            under_review: [{ $match: { status: 'under_review' } }, { $count: 'count' }],
            approved: [{ $match: { status: 'approved' } }, { $count: 'count' }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }]
        }}])
    ]);
  }
  const endAgg = performance.now();
  console.log(`Average time for aggregated: ${(endAgg - startAgg) / 100}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

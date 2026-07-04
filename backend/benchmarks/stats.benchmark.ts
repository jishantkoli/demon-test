import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Connected to in-memory MongoDB');

  // Seed data
  const admin = await User.create({
    email: 'admin@example.com',
    role: 'admin',
    profile: { fullName: 'Admin User' }
  });

  const teacher = await User.create({
    email: 'teacher@example.com',
    role: 'teacher',
    profile: { fullName: 'Teacher User' }
  });

  // Create some forms
  await Form.create([
    { title: 'Form 1', status: 'active', adminId: admin._id, shareableLink: 'f1' },
    { title: 'Form 2', status: 'draft', adminId: admin._id, shareableLink: 'f2' },
    { title: 'Form 3', status: 'expired', adminId: admin._id, shareableLink: 'f3' },
  ]);

  // Create some submissions
  await Submission.create([
    { formId: new mongoose.Types.ObjectId(), status: 'submitted', userEmail: 'teacher@example.com' },
    { formId: new mongoose.Types.ObjectId(), status: 'under_review', userEmail: 'teacher@example.com' },
    { formId: new mongoose.Types.ObjectId(), status: 'approved', userEmail: 'teacher@example.com' },
    { formId: new mongoose.Types.ObjectId(), status: 'rejected', userEmail: 'teacher@example.com' },
  ]);

  const req = {
    user: admin
  } as any;

  const res = {
    status: (code: number) => ({
      json: (data: any) => {
        // console.log('Response:', data);
      }
    })
  } as any;

  console.log('Starting benchmark...');
  const start = Date.now();
  const iterations = 100;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = Date.now();
  console.log(`Average execution time: ${(end - start) / iterations}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

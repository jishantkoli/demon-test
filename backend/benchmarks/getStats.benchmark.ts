import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';
import { Response } from 'express';

async function setupData() {
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin User' }
  });

  const functionary = await User.create({
    email: 'func@test.com',
    role: 'functionary',
    profile: { fullName: 'Functionary User', schoolCode: 'S001' }
  });

  // Create some forms
  await Form.create([
    { title: 'Form 1', status: 'active', shareableLink: 'link1' },
    { title: 'Form 2', status: 'active', shareableLink: 'link2' },
    { title: 'Form 3', status: 'draft', shareableLink: 'link3' },
    { title: 'Form 4', status: 'expired', shareableLink: 'link4' },
  ]);

  // Create some submissions
  await Submission.create([
    { formId: new mongoose.Types.ObjectId(), status: 'submitted', schoolCode: 'S001' },
    { formId: new mongoose.Types.ObjectId(), status: 'under_review', schoolCode: 'S001' },
    { formId: new mongoose.Types.ObjectId(), status: 'approved', schoolCode: 'S001' },
    { formId: new mongoose.Types.ObjectId(), status: 'rejected', schoolCode: 'S001' },
  ]);

  return { admin, functionary };
}

async function benchmark() {
  console.log('Starting MongoMemoryServer...');
  const mongoServer = await MongoMemoryServer.create();
  console.log('MongoMemoryServer started at:', mongoServer.getUri());
  await mongoose.connect(mongoServer.getUri());

  const { admin, functionary } = await setupData();

  let lastResponse: any = null;
  const res = {
    status: (code: number) => {
        if (code !== 200) console.error('Response status:', code);
        return res;
    },
    json: (data: any) => {
        lastResponse = data;
        return res;
    }
  } as any;

  console.log('Verifying response structure and values...');
  await getStats({ user: admin } as any, res);

  if (!lastResponse) throw new Error('No response from getStats');

  const expectedKeys = [
    'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
    'totalSubmissions', 'submissionsByStatus', 'usersByRole',
    'totalNominations', 'nominationsByStatus', 'completionRate'
  ];

  for (const key of expectedKeys) {
    if (!(key in lastResponse)) throw new Error(`Missing expected key: ${key}`);
  }

  if (lastResponse.totalUsers < 2) throw new Error('Incorrect totalUsers');
  if (lastResponse.activeForms !== 2) throw new Error('Incorrect activeForms');
  if (lastResponse.totalSubmissions !== 4) throw new Error('Incorrect totalSubmissions');
  if (lastResponse.submissionsByStatus.submitted !== 1) throw new Error('Incorrect submissionsByStatus.submitted');

  console.log('Verification successful!');

  console.log('Starting benchmark (50 iterations)...');
  const start = Date.now();
  for (let i = 0; i < 50; i++) {
    await getStats({ user: admin } as any, res);
  }
  const end = Date.now();
  console.log(`Average time for getStats (admin): ${(end - start) / 50}ms`);

  const startFunc = Date.now();
  for (let i = 0; i < 50; i++) {
    await getStats({ user: functionary } as any, res);
  }
  const endFunc = Date.now();
  console.log(`Average time for getStats (functionary): ${(endFunc - startFunc) / 50}ms`);

  await mongoose.disconnect();
  await mongoServer.stop();
}

benchmark().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});

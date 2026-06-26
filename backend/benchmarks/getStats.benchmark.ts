import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function runBenchmark() {
  const mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
    binary: { version: '6.0.4' }
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  console.log('--- Seeding Data for Benchmark ---');
  const admin = await User.create({ email: 'admin@test.com', role: 'admin', profile: { fullName: 'Admin' } });

  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
        email: `user${i}@test.com`,
        role: i % 4 === 0 ? 'admin' : (i % 4 === 1 ? 'reviewer' : (i % 4 === 2 ? 'functionary' : 'teacher')),
        profile: { fullName: `User ${i}`, schoolCode: `SCHOOL${i%5}` }
    });
  }
  await User.insertMany(users);

  const forms = [];
  for (let i = 0; i < 20; i++) {
    forms.push({
        title: `Form ${i}`,
        adminId: admin._id,
        status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
        formType: 'normal',
        shareableLink: `link-${i}`
    });
  }
  await Form.insertMany(forms);

  const submissions = [];
  const statuses = ['submitted', 'under_review', 'approved', 'rejected', 'pending'];
  for (let i = 0; i < 500; i++) {
    submissions.push({
        formId: new mongoose.Types.ObjectId(),
        status: statuses[i % statuses.length],
        schoolCode: `SCHOOL${i%5}`,
        userEmail: `user${i % 100}@test.com`
    });
  }
  await Submission.insertMany(submissions);

  console.log('--- Starting Benchmark & Correctness Check ---');

  const req = {
    user: { _id: admin._id, role: 'admin', email: 'admin@test.com' }
  } as any;

  let lastData: any = null;
  const res = {
    status: (code: number) => ({
        json: (data: any) => { lastData = data; }
    })
  } as any;

  // Correctness Check
  await getStats(req, res);
  console.log('Verifying data structure and values...');
  const expectedKeys = ['totalUsers', 'activeForms', 'draftForms', 'expiredForms', 'totalSubmissions', 'submissionsByStatus', 'usersByRole'];
  expectedKeys.forEach(key => {
    if (!(key in lastData)) throw new Error(`Missing key in response: ${key}`);
  });

  if (lastData.totalUsers !== 101) throw new Error(`Total users mismatch: expected 101, got ${lastData.totalUsers}`);
  if (lastData.totalSubmissions !== 500) throw new Error(`Total submissions mismatch: expected 500, got ${lastData.totalSubmissions}`);
  if (lastData.submissionsByStatus.submitted !== 100) throw new Error(`Submissions status mismatch: expected 100, got ${lastData.submissionsByStatus.submitted}`);

  console.log('✅ Correctness check passed!');

  const iterations = 50;
  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = Date.now();
  console.log(`Average execution time over ${iterations} iterations: ${(end - start) / iterations}ms`);

  await mongoose.disconnect();
  await mongoServer.stop();
}

runBenchmark().catch(error => {
    console.error(error);
    process.exit(1);
});

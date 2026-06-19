import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

const NUM_USERS = 50;
const NUM_FORMS = 10;
const NUM_SUBMISSIONS = 200;
const NUM_NOMINATIONS = 100;

async function seed(numUsers: number, numForms: number, numSubmissions: number, numNominations: number) {
  console.log(`Seeding ${numUsers} users, ${numForms} forms, ${numSubmissions} submissions, ${numNominations} nominations...`);

  const roles = ['admin', 'reviewer', 'functionary', 'teacher'];
  const users = [];
  for (let i = 0; i < numUsers; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: roles[i % roles.length],
      profile: {
        fullName: `User ${i}`,
        schoolCode: `SCHOOL${i % 5}`
      }
    });
  }
  const createdUsers = await User.insertMany(users);

  const forms = [];
  const statuses = ['active', 'draft', 'expired'];
  for (let i = 0; i < numForms; i++) {
    forms.push({
      title: `Form ${i}`,
      status: statuses[i % statuses.length],
      adminId: createdUsers[0]._id,
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  const nominations = [];
  const nominationStatuses = ['pending', 'invited', 'completed'];
  for (let i = 0; i < numNominations; i++) {
    const teacher = createdUsers.find(u => u.role === 'teacher' && u.email === `user${(i % numUsers)}@example.com`) || createdUsers[numUsers-1];
    const functionary = createdUsers.find(u => u.role === 'functionary') || createdUsers[0];
    nominations.push({
      form_id: createdForms[i % numForms]._id,
      functionary_id: functionary._id,
      teacher_name: teacher.profile.fullName,
      teacher_email: teacher.email,
      school_code: teacher.profile.schoolCode,
      status: nominationStatuses[i % nominationStatuses.length],
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  const submissions = [];
  const subStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let i = 0; i < numSubmissions; i++) {
    const user = createdUsers[i % numUsers];
    submissions.push({
      formId: createdForms[i % numForms]._id,
      userId: user._id,
      userEmail: user.email,
      schoolCode: user.profile.schoolCode,
      status: subStatuses[i % subStatuses.length]
    });
  }
  await Submission.insertMany(submissions);
  console.log('Seeding complete.');
  return createdUsers;
}

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create({
    binary: {
        version: '6.0.4',
    },
    spawn: {
      timeout: 120000
    }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const users = await seed(NUM_USERS, NUM_FORMS, NUM_SUBMISSIONS, NUM_NOMINATIONS);
  const adminUser = users.find(u => u.role === 'admin');

  const req = {
    user: adminUser
  } as any;

  const res = {
    status: (code: number) => ({
      json: (data: any) => {
        // console.log('Response:', data);
      }
    })
  } as any;

  console.log('Running benchmark for getStats (Admin)...');
  // Warm up
  await getStats(req, res);

  const start = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = performance.now();
  console.log(`Average execution time over ${iterations} runs: ${((end - start) / iterations).toFixed(2)}ms`);

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(console.error);

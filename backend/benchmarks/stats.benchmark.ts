import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function seed(numUsers: number, numForms: number, numSubmissions: number, numNominations: number) {
  const roles = ['admin', 'reviewer', 'functionary', 'teacher'];
  const users = [];
  for (let i = 0; i < numUsers; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: roles[i % roles.length],
      profile: {
        fullName: `User ${i}`,
        schoolCode: `SCH${i % 10}`
      },
      isActive: true
    });
  }
  const createdUsers = await User.insertMany(users);

  const statuses = ['active', 'draft', 'expired'];
  const forms = [];
  for (let i = 0; i < numForms; i++) {
    forms.push({
      title: `Form ${i}`,
      status: statuses[i % statuses.length],
      adminId: createdUsers[0]._id,
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  const subStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
  const submissions = [];
  for (let i = 0; i < numSubmissions; i++) {
    submissions.push({
      formId: createdForms[i % createdForms.length]._id,
      userId: createdUsers[i % createdUsers.length]._id,
      status: subStatuses[i % subStatuses.length],
      schoolCode: `SCH${(i % 10)}`
    });
  }
  await Submission.insertMany(submissions);

  const nomStatuses = ['pending', 'invited', 'completed'];
  const nominations = [];
  for (let i = 0; i < numNominations; i++) {
    nominations.push({
      form_id: createdForms[0]._id,
      functionary_id: createdUsers.find(u => u.role === 'functionary')?._id || createdUsers[0]._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@example.com`,
      school_code: `SCH${i % 10}`,
      status: nomStatuses[i % nomStatuses.length],
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  return createdUsers;
}

async function runBenchmark() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data...');
  const users = await seed(100, 20, 500, 100);
  console.log('Data seeded.');

  const adminUser = users.find(u => u.role === 'admin');
  const functionaryUser = users.find(u => u.role === 'functionary');
  const teacherUser = users.find(u => u.role === 'teacher');

  const runTest = async (user: any, label: string) => {
    let result: any = null;
    const req = {
      user: {
        _id: user._id,
        role: user.role,
        email: user.email,
        school_code: user.profile.schoolCode
      }
    } as any;

    const res = {
      status: (code: number) => ({
        json: (data: any) => {
          result = data;
        }
      })
    } as any;

    const start = performance.now();
    await getStats(req, res);
    const end = performance.now();
    console.log(`${label} execution time: ${(end - start).toFixed(2)}ms`);

    // Verification
    if (!result) throw new Error(`${label} result is null`);
    const expectedKeys = ['totalUsers', 'activeForms', 'draftForms', 'expiredForms', 'totalSubmissions', 'submissionsByStatus', 'usersByRole', 'totalNominations', 'nominationsByStatus', 'completionRate'];
    expectedKeys.forEach(key => {
      if (!(key in result)) throw new Error(`${label} result missing key: ${key}`);
    });

    if (label === 'Admin') {
       if (result.totalUsers !== 100) throw new Error(`Admin totalUsers mismatch: ${result.totalUsers}`);
    }
  };

  console.log('\n--- Optimized Benchmark ---');
  await runTest(adminUser, 'Admin');
  await runTest(functionaryUser, 'Functionary');
  await runTest(teacherUser, 'Teacher');

  await mongoose.disconnect();
  await mongod.stop();
}

runBenchmark().catch(err => {
  console.error(err);
  process.exit(1);
});

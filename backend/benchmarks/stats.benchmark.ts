import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

const benchmark = async () => {
  const mongoServer = await MongoMemoryServer.create({
    binary: { version: '6.0.4' } // Try to use a stable version if possible
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data for benchmark...');

  // Seed Users
  const roles = ['admin', 'reviewer', 'functionary', 'teacher'];
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: roles[i % roles.length],
      profile: {
        fullName: `User ${i}`,
        schoolCode: `SCH${i % 10}`
      }
    });
  }
  await User.insertMany(users);
  const dbUsers = await User.find();

  // Seed Forms
  const statuses = ['active', 'draft', 'expired'];
  const forms = [];
  for (let i = 0; i < 20; i++) {
    forms.push({
      title: `Form ${i}`,
      status: statuses[i % statuses.length],
      adminId: dbUsers[0]._id
    });
  }
  await Form.insertMany(forms);
  const dbForms = await Form.find();

  // Seed Submissions
  const subStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
  const submissions = [];
  for (let i = 0; i < 500; i++) {
    submissions.push({
      formId: dbForms[i % dbForms.length]._id,
      userId: dbUsers[i % dbUsers.length]._id,
      status: subStatuses[i % subStatuses.length],
      schoolCode: `SCH${i % 10}`
    });
  }
  await Submission.insertMany(submissions);

  // Seed Nominations
  const nomStatuses = ['pending', 'invited', 'completed'];
  const nominations = [];
  const functionaries = dbUsers.filter(u => u.role === 'functionary');
  for (let i = 0; i < 100; i++) {
    nominations.push({
      form_id: dbForms[0]._id,
      functionary_id: functionaries[i % functionaries.length]._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@example.com`,
      school_code: `SCH${i % 10}`,
      status: nomStatuses[i % nomStatuses.length],
      unique_token: `token-${i}-${Math.random().toString(36).substring(2, 7)}`
    });
  }
  await Nomination.insertMany(nominations);

  console.log('Data seeded. Running benchmark...');

  const adminUser = await User.findOne({ role: 'admin' });
  const functionaryUser = await User.findOne({ role: 'functionary' });

  const runBenchmark = async (user: any, label: string) => {
    const req = { user } as any;
    let result: any;
    const res = {
      status: () => res,
      json: (data: any) => {
        result = data;
        return res;
      }
    } as any;

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await getStats(req, res);
    }
    const end = performance.now();
    console.log(`${label} avg time: ${((end - start) / 10).toFixed(2)}ms`);

    // Verify response structure
    await getStats(req, res);
    const expectedKeys = [
      'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
      'totalSubmissions', 'submissionsByStatus', 'usersByRole',
      'totalNominations', 'nominationsByStatus', 'completionRate'
    ];
    for (const key of expectedKeys) {
      if (!(key in result)) {
        console.error(`Missing key in response: ${key}`);
      }
    }
  };

  await runBenchmark(adminUser, 'Admin');
  await runBenchmark(functionaryUser, 'Functionary');

  await mongoose.disconnect();
  await mongoServer.stop();
};

benchmark().catch(err => {
  console.error(err);
  process.exit(1);
});

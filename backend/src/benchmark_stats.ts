import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './models/User.js';
import { Form } from './models/Form.js';
import { Submission } from './models/Submission.js';
import { Nomination } from './models/Nomination.js';
import { getStats } from './controllers/stats.js';

async function benchmark() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data for benchmark...');

  // Create 1000 users
  const users = [];
  for (let i = 0; i < 1000; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: i < 10 ? 'admin' : (i < 50 ? 'reviewer' : (i < 200 ? 'functionary' : 'teacher')),
      profile: {
        fullName: `User ${i}`,
        schoolCode: `SCH${i % 50}`
      }
    });
  }
  const createdUsers = await User.insertMany(users);

  // Create 100 forms
  const forms = [];
  for (let i = 0; i < 100; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);

  // Create 5000 nominations
  const nominations = [];
  const functionaries = createdUsers.filter(u => u.role === 'functionary');
  const teachers = createdUsers.filter(u => u.role === 'teacher');

  for (let i = 0; i < 5000; i++) {
    nominations.push({
      form_id: createdForms[i % 100]._id,
      functionary_id: functionaries[i % functionaries.length]._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: teachers[i % teachers.length].email,
      school_code: `SCH${i % 50}`,
      status: i % 4 === 0 ? 'pending' : (i % 4 === 1 ? 'invited' : (i % 4 === 2 ? 'in_progress' : 'completed'))
    });
  }
  await Nomination.insertMany(nominations);

  // Create 2000 submissions
  const submissions = [];
  for (let i = 0; i < 2000; i++) {
    const statusOptions = ['submitted', 'under_review', 'approved', 'rejected'];
    submissions.push({
      formId: createdForms[i % 100]._id,
      userId: teachers[i % teachers.length]._id,
      userEmail: teachers[i % teachers.length].email,
      schoolCode: `SCH${i % 50}`,
      status: statusOptions[i % 4],
      isDraft: i % 10 === 0
    });
  }
  await Submission.insertMany(submissions);

  console.log('Seeding complete.');

  const runBenchmark = async (name: string, user: any) => {
    const req = {
      user: {
        _id: user._id,
        role: user.role,
        email: user.email,
        school_code: user.profile.schoolCode
      }
    } as any;

    const res = {
      status: () => res,
      json: () => {}
    } as any;

    const start = performance.now();
    await getStats(req, res);
    const end = performance.now();
    console.log(`${name} role took: ${(end - start).toFixed(2)}ms`);
    return end - start;
  };

  console.log('\nStarting benchmark (Running each 5 times for average)...');

  const admin = createdUsers.find(u => u.role === 'admin')!;
  const func = createdUsers.find(u => u.role === 'functionary')!;
  const teacher = createdUsers.find(u => u.role === 'teacher')!;

  const roles = [
    { name: 'Admin', user: admin },
    { name: 'Functionary', user: func },
    { name: 'Teacher', user: teacher }
  ];

  for (const role of roles) {
    let totalTime = 0;
    for (let i = 0; i < 5; i++) {
      totalTime += await runBenchmark(role.name, role.user);
    }
    console.log(`Average ${role.name}: ${(totalTime / 5).toFixed(2)}ms`);
  }

  await mongoose.disconnect();
  await mongod.stop();
}

benchmark().catch(console.error);

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

  // Create Admin
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  // Create Functionary
  const functionary = await User.create({
    email: 'head@school.org',
    role: 'functionary',
    profile: { fullName: 'Head Master', schoolCode: 'SCH001' }
  });

  // Create Teachers
  const teacherCount = 200;
  const teachers = [];
  for (let i = 0; i < teacherCount; i++) {
    teachers.push({
      email: `teacher${i}@test.com`,
      role: 'teacher',
      profile: { fullName: `Teacher ${i}`, schoolCode: i < 50 ? 'SCH001' : 'SCH002' }
    });
  }
  const createdTeachers = await User.insertMany(teachers);

  // Create Forms
  const formCount = 50;
  const forms = [];
  for (let i = 0; i < formCount; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      adminId: admin._id,
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);
  const activeForms = createdForms.filter(f => f.status === 'active');

  // Create Nominations for Functionary
  const nominations = [];
  for (let i = 0; i < 50; i++) {
    nominations.push({
      form_id: activeForms[i % activeForms.length]._id,
      functionary_id: functionary._id,
      teacher_name: createdTeachers[i].profile.fullName,
      teacher_email: createdTeachers[i].email,
      school_code: 'SCH001',
      status: i % 3 === 0 ? 'completed' : (i % 3 === 1 ? 'invited' : 'pending'),
      unique_token: `token-${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Create Submissions
  const submissionCount = 1000;
  const submissions = [];
  const statuses = ['submitted', 'under_review', 'approved', 'rejected'];

  for (let i = 0; i < submissionCount; i++) {
    const t = createdTeachers[i % createdTeachers.length];
    submissions.push({
      formId: activeForms[i % activeForms.length]._id,
      userId: t._id,
      userEmail: t.email,
      schoolCode: t.profile.schoolCode,
      status: statuses[i % statuses.length],
      responses: []
    });
  }
  await Submission.insertMany(submissions);

  const iterations = 20;

  async function benchmark(user: any, label: string) {
    const req = { user } as any;
    const res = {
      status: () => res,
      json: () => res,
    } as any;

    // Warm up
    await getStats(req, res);

    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await getStats(req, res);
    }
    const end = Date.now();
    console.log(`${label} - Average execution time: ${(end - start) / iterations}ms`);
  }

  console.log('\n--- BASELINE PERFORMANCE ---');
  await benchmark(admin, 'Admin');
  await benchmark(functionary, 'Functionary');

  await mongoose.disconnect();
  await mongo.stop();
}

runBenchmark().catch(console.error);

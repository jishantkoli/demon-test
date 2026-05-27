import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../models/User.js';
import { Form } from '../models/Form.js';
import { Submission } from '../models/Submission.js';
import { Nomination } from '../models/Nomination.js';
import { getStats } from '../controllers/stats.js';

async function benchmark() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);

  console.log('--- Generating Mock Data ---');

  // Create an admin user
  const admin = await User.create({
    email: 'admin@school.edu',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  // Create 500 users
  const users = [];
  for (let i = 0; i < 500; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: i % 4 === 0 ? 'teacher' : i % 4 === 1 ? 'reviewer' : i % 4 === 2 ? 'functionary' : 'admin',
      profile: { fullName: `User ${i}`, schoolCode: `SCH${i % 50}` }
    });
  }
  await User.insertMany(users);
  console.log('Added 500 users');

  // Create 100 forms
  const forms = [];
  for (let i = 0; i < 100; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'draft' : 'expired',
      adminId: admin._id,
      shareableLink: `link-${i}`
    });
  }
  const createdForms = await Form.insertMany(forms);
  console.log('Added 100 forms');

  // Create 1000 submissions
  const submissions = [];
  const statuses = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let i = 0; i < 1000; i++) {
    submissions.push({
      formId: createdForms[i % 100]._id,
      userId: admin._id,
      status: statuses[i % 4],
      schoolCode: `SCH${i % 50}`,
      submittedAt: new Date()
    });
  }
  await Submission.insertMany(submissions);
  console.log('Added 1000 submissions');

  // Create 500 nominations
  const nominations = [];
  const nomStatuses = ['pending', 'invited', 'completed'];
  for (let i = 0; i < 500; i++) {
    nominations.push({
      form_id: createdForms[0]._id,
      functionary_id: admin._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@example.com`,
      school_code: `SCH${i % 50}`,
      status: nomStatuses[i % 3],
      unique_token: `token-${i}` // Manually add token because pre-save doesn't run on insertMany
    });
  }
  await Nomination.insertMany(nominations);
  console.log('Added 500 nominations');

  console.log('\n--- Starting Benchmark ---');

  const req: any = {
    user: admin
  };
  const res: any = {
    status: () => res,
    json: () => {}
  };

  const start = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    await getStats(req, res);
  }
  const end = performance.now();

  const avgTime = (end - start) / iterations;
  console.log(`Average getStats (Admin) execution time over ${iterations} iterations: ${avgTime.toFixed(2)}ms`);

  await mongoose.disconnect();
  await mongo.stop();
}

benchmark().catch(console.error);


import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function benchmark() {
  console.log('Starting benchmark...');
  const mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '6.0.4',
    },
    instance: {
       launchTimeout: 120000
    }
  });
  await mongoose.connect(mongoServer.getUri());

  console.log('Generating mock data...');

  // Create users
  const users = [];
  for (let i = 0; i < 200; i++) {
    users.push({
      email: `user${i}@example.com`,
      role: i % 10 === 0 ? 'admin' : (i % 10 < 3 ? 'reviewer' : (i % 10 < 6 ? 'functionary' : 'teacher')),
      profile: { fullName: `User ${i}`, schoolCode: `SCHOOL${i % 10}` }
    });
  }
  await User.insertMany(users);

  // Create forms
  const forms = [];
  for (let i = 0; i < 20; i++) {
    forms.push({
      title: `Form ${i}`,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired')
    });
  }
  await Form.insertMany(forms);

  const functionaries = await User.find({ role: 'functionary' }).limit(5);
  const teachers = await User.find({ role: 'teacher' }).limit(5);
  const activeForms = await Form.find({ status: 'active' }).limit(5);

  // Create nominations
  const nominations = [];
  for (let i = 0; i < 200; i++) {
    nominations.push({
      form_id: activeForms[i % activeForms.length]._id,
      functionary_id: functionaries[i % functionaries.length]._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@example.com`,
      school_code: `SCHOOL${i % 10}`,
      status: i % 4 === 0 ? 'pending' : (i % 4 === 1 ? 'invited' : (i % 4 === 2 ? 'in_progress' : 'completed')),
      unique_token: `token${i}`
    });
  }
  await Nomination.insertMany(nominations);

  // Create submissions
  const submissions = [];
  for (let i = 0; i < 200; i++) {
    submissions.push({
      formId: activeForms[i % activeForms.length]._id,
      userId: teachers[i % teachers.length]._id,
      schoolCode: `SCHOOL${i % 10}`,
      status: i % 4 === 0 ? 'submitted' : (i % 4 === 1 ? 'under_review' : (i % 4 === 2 ? 'approved' : 'rejected'))
    });
  }
  await Submission.insertMany(submissions);

  console.log('Mock data generated.');

  const adminUser = await User.findOne({ role: 'admin' });
  const functionaryUser = await User.findOne({ role: 'functionary' });

  let responseData: any = null;
  const mockRes = {
    status: (code: number) => ({
      json: (data: any) => {
        responseData = data;
      }
    })
  } as any;

  console.log('Benchmarking Admin getStats...');
  let start = Date.now();
  for (let i = 0; i < 20; i++) {
    await getStats({ user: adminUser } as any, mockRes);
  }
  console.log(`Admin getStats took average: ${(Date.now() - start) / 20}ms`);
  console.log('Admin Response Keys:', Object.keys(responseData));

  console.log('Benchmarking Functionary getStats...');
  start = Date.now();
  for (let i = 0; i < 20; i++) {
    await getStats({ user: { ...functionaryUser.toObject(), _id: functionaryUser._id } } as any, mockRes);
  }
  console.log(`Functionary getStats took average: ${(Date.now() - start) / 20}ms`);
  console.log('Functionary Response Keys:', Object.keys(responseData));
  console.log('Functionary totalNominations:', responseData.totalNominations);

  await mongoose.disconnect();
  await mongoServer.stop();
}

benchmark().catch(console.error);

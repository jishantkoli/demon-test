import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Form } from '../models/Form.js';
import { Submission } from '../models/Submission.js';
import { Nomination } from '../models/Nomination.js';
import { getStats } from '../controllers/stats.js';
import { Request, Response } from 'express';

const seedBenchmarkData = async () => {
  // Create users
  const admin = await User.create({
    email: 'admin@school.edu',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  const functionary = await User.create({
    email: 'head@school.edu',
    role: 'functionary',
    profile: { fullName: 'Head', schoolCode: 'S001' }
  });

  const teacher = await User.create({
    email: 'teacher@school.edu',
    role: 'teacher',
    profile: { fullName: 'Teacher' }
  });

  // Create forms
  const forms = [];
  for (let i = 0; i < 50; i++) {
    forms.push({
      title: `Form ${i}`,
      adminId: admin._id,
      status: i % 3 === 0 ? 'active' : (i % 3 === 1 ? 'draft' : 'expired'),
      shareableLink: `link-${i}`
    });
  }
  await Form.insertMany(forms);

  // Create nominations
  const nominations = [];
  for (let i = 0; i < 200; i++) {
    nominations.push({
      form_id: new mongoose.Types.ObjectId(),
      functionary_id: functionary._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: `teacher${i}@school.edu`,
      school_code: 'S001',
      status: i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'invited' : 'completed'),
      unique_token: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    });
  }
  await Nomination.insertMany(nominations);

  // Create submissions
  const submissions = [];
  for (let i = 0; i < 500; i++) {
    submissions.push({
      formId: new mongoose.Types.ObjectId(),
      userId: i % 2 === 0 ? teacher._id : null,
      userEmail: `teacher${i}@school.edu`,
      schoolCode: 'S001',
      status: ['pending', 'submitted', 'under_review', 'approved', 'rejected'][i % 5]
    });
  }
  await Submission.insertMany(submissions);

  return { admin, functionary, teacher };
};

const runBenchmark = async () => {
  const mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '8.2.1',
    }
  });
  await mongoose.connect(mongoServer.getUri());

  const { admin, functionary, teacher } = await seedBenchmarkData();

  const mockRes = () => {
    const res: any = {};
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data: any) => {
      res.body = data;
      return res;
    };
    return res;
  };

  const measure = async (user: any, label: string) => {
    const req = { user } as any;
    const res = mockRes();

    // Warm up
    await getStats(req, res);

    const start = process.hrtime();
    for (let i = 0; i < 10; i++) {
      await getStats(req, res);
    }
    const end = process.hrtime(start);
    const ms = (end[0] * 1000 + end[1] / 1000000) / 10;
    console.log(`${label}: ${ms.toFixed(2)}ms`);

    // Basic functional verification
    if (res.statusCode !== 200) {
      throw new Error(`${label} failed with status ${res.statusCode}`);
    }
    if (typeof res.body.totalUsers !== 'number') {
      throw new Error(`${label} response missing totalUsers`);
    }

    return ms;
  };

  console.log('--- Benchmarking getStats (Average of 10 runs) ---');
  await measure(admin, 'Admin');
  await measure(functionary, 'Functionary');
  await measure(teacher, 'Teacher');

  await mongoose.disconnect();
  await mongoServer.stop();
};

runBenchmark().catch(console.error);

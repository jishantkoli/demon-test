import 'dotenv/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';

const benchmark = async () => {
  let mongoServer;
  try {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '6.0.4' }
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log('✅ Connected to in-memory MongoDB');

    // Seed data
    console.log('🌱 Seeding data for benchmark...');
    const userRoles = ['admin', 'reviewer', 'functionary', 'teacher'];
    const users = [];
    for (let i = 0; i < 1000; i++) {
      users.push({
        email: `user${i}@test.com`,
        passwordHash: 'hash',
        role: userRoles[i % 4],
        profile: { fullName: `User ${i}` }
      });
    }
    const createdUsers = await User.insertMany(users);
    const functionary = createdUsers.find(u => u.role === 'functionary');

    const forms = [];
    const statuses = ['active', 'draft', 'expired'];
    for (let i = 0; i < 20; i++) {
      forms.push({
        title: `Form ${i}`,
        adminId: createdUsers[0]._id,
        status: statuses[i % 3],
        formType: 'normal',
        shareableLink: `form-${i}-${Math.random().toString(36).substring(7)}`
      });
    }
    const createdForms = await Form.insertMany(forms);

    const submissions = [];
    const subStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
    for (let i = 0; i < 500; i++) {
      submissions.push({
        formId: createdForms[i % createdForms.length]._id,
        userId: createdUsers[i % createdUsers.length]._id,
        status: subStatuses[i % 4],
        schoolCode: 'SCH001',
        responses: []
      });
    }
    await Submission.insertMany(submissions);

    const nominations = [];
    const nomStatuses = ['pending', 'invited', 'completed'];
    if (functionary) {
      for (let i = 0; i < 100; i++) {
        nominations.push({
          form_id: createdForms[0]._id,
          functionary_id: functionary._id,
          teacher_name: `Teacher ${i}`,
          teacher_email: `teacher${i}@test.com`,
          school_code: 'SCH001',
          status: nomStatuses[i % 3],
          unique_token: `token-${i}-${Math.random().toString(36).substring(7)}`
        });
      }
      await Nomination.insertMany(nominations);
    }

    console.log('🚀 Starting benchmark...');

    // Functionary role typically has the most queries
    const role = 'functionary';
    const userId = functionary?._id;
    const subQuery = { schoolCode: 'SCH001' };
    const formQuery = { status: 'active' };

    const iterations = 10;
    let totalTimeOriginal = 0;
    let totalTimeOptimized = 0;

    for (let j = 0; j < iterations; j++) {
      // --- ORIGINAL LOGIC SIMULATION ---
      const startOrig = performance.now();
      await User.countDocuments();
      await Form.countDocuments({ ...formQuery, status: 'active' });
      await Form.countDocuments({ ...formQuery, status: 'draft' });
      await Form.countDocuments({ ...formQuery, status: 'expired' });
      await Submission.countDocuments(subQuery);
      await Submission.countDocuments({ ...subQuery, status: 'submitted' });
      await Submission.countDocuments({ ...subQuery, status: 'under_review' });
      await Submission.countDocuments({ ...subQuery, status: 'approved' });
      await Submission.countDocuments({ ...subQuery, status: 'rejected' });
      await User.countDocuments({ role: 'admin' });
      await User.countDocuments({ role: 'reviewer' });
      await User.countDocuments({ role: 'functionary' });
      await User.countDocuments({ role: 'teacher' });
      if (role === 'functionary') {
        await Nomination.countDocuments({ functionary_id: userId });
        await Nomination.countDocuments({ functionary_id: userId, status: 'pending' });
        await Nomination.countDocuments({ functionary_id: userId, status: 'invited' });
        await Nomination.countDocuments({ functionary_id: userId, status: 'completed' });
      }
      const endOrig = performance.now();
      totalTimeOriginal += (endOrig - startOrig);

      // --- OPTIMIZED LOGIC SIMULATION ---
      const startOpt = performance.now();
      await Promise.all([
        User.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }]
            }
          }
        ]),
        Form.aggregate([
          { $match: formQuery },
          {
            $facet: {
              active: [{ $match: { status: 'active' } }, { $count: 'count' }],
              draft: [{ $match: { status: 'draft' } }, { $count: 'count' }],
              expired: [{ $match: { status: 'expired' } }, { $count: 'count' }]
            }
          }
        ]),
        Submission.aggregate([
          { $match: subQuery },
          {
            $facet: {
              total: [{ $count: 'count' }],
              byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
            }
          }
        ]),
        role === 'functionary' ? Nomination.aggregate([
          { $match: { functionary_id: userId } },
          {
            $facet: {
              total: [{ $count: 'count' }],
              byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
            }
          }
        ]) : Promise.resolve([])
      ]);
      const endOpt = performance.now();
      totalTimeOptimized += (endOpt - startOpt);
    }

    console.log(`\nResults (Average of ${iterations} runs):`);
    console.log(`Original Logic:  ${(totalTimeOriginal / iterations).toFixed(2)}ms`);
    console.log(`Optimized Logic: ${(totalTimeOptimized / iterations).toFixed(2)}ms`);
    console.log(`Improvement:     ${(((totalTimeOriginal - totalTimeOptimized) / totalTimeOriginal) * 100).toFixed(2)}%`);

    await mongoose.disconnect();
    await mongoServer.stop();
  } catch (err) {
    console.error('❌ Benchmark failed:', err);
    process.exit(1);
  }
};

benchmark();

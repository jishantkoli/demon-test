import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
// @ts-ignore
import { getStats } from '../src/controllers/stats.js';

async function verifyStats() {
  const mongod = await MongoMemoryServer.create({
    binary: { version: '6.0.4' },
    instance: { launchTimeout: 120000 }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  console.log('Setting up verification data...');
  const functionary = await User.create({
    email: 'func@test.com',
    role: 'functionary',
    profile: { fullName: 'Functionary', schoolCode: 'S001' }
  });

  await Nomination.create({
    form_id: new mongoose.Types.ObjectId(),
    functionary_id: functionary._id,
    teacher_name: 'Teacher 1',
    teacher_email: 'teacher1@test.com',
    school_code: 'S001',
    status: 'completed'
  });

  await Submission.create({
    formId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    status: 'submitted',
    schoolCode: 'S001'
  });

  const mockReq: any = {
    user: {
      _id: functionary._id,
      role: 'functionary',
      email: 'func@test.com',
      school_code: 'S001'
    }
  };

  const mockRes: any = {
    status: (code: number) => {
      console.log('Status:', code);
      return mockRes;
    },
    json: (data: any) => {
      console.log('Response data:', JSON.stringify(data, null, 2));

      const expectedKeys = [
        'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
        'totalSubmissions', 'submissionsByStatus', 'usersByRole',
        'totalNominations', 'nominationsByStatus', 'completionRate'
      ];

      const missingKeys = expectedKeys.filter(key => !(key in data));
      if (missingKeys.length > 0) {
        console.error('❌ Verification failed: Missing keys:', missingKeys);
        process.exit(1);
      } else {
        console.log('✅ Verification passed: All keys present.');
      }

      if (data.totalNominations !== 1) {
          console.error(`❌ Verification failed: Expected totalNominations 1, got ${data.totalNominations}`);
          process.exit(1);
      }

      if (data.submissionsByStatus.submitted !== 1) {
          console.error(`❌ Verification failed: Expected submitted submissions 1, got ${data.submissionsByStatus.submitted}`);
          process.exit(1);
      }
    }
  };

  console.log('Executing getStats...');
  await getStats(mockReq, mockRes);

  await mongoose.disconnect();
  await mongod.stop();
}

verifyStats().catch(err => {
    console.error(err);
    process.exit(1);
});

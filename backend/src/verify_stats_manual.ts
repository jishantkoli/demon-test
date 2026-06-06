import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './models/User.js';
import { Form } from './models/Form.js';
import { Submission } from './models/Submission.js';
import { Nomination } from './models/Nomination.js';
import { getStats } from './controllers/stats.js';

async function verifyStructure() {
  const mongod = await MongoMemoryServer.create({
    binary: { version: '6.0.4' }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const user = await User.create({
    email: 'test@example.com',
    role: 'functionary',
    profile: { fullName: 'Test User', schoolCode: 'TEST' }
  });

  const req = { user } as any;
  let responseData: any = null;
  const res = {
    status: (code: number) => {
      if (code !== 200) console.error('Status code:', code);
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    }
  } as any;

  await getStats(req, res);

  const expectedKeys = [
    'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
    'totalSubmissions', 'submissionsByStatus', 'usersByRole',
    'totalNominations', 'nominationsByStatus', 'completionRate'
  ];

  console.log('Verifying response structure...');
  let missing = 0;
  for (const key of expectedKeys) {
    if (responseData[key] === undefined) {
      console.error(`Missing key: ${key}`);
      missing++;
    }
  }

  if (missing === 0) {
    console.log('✅ Structure verification passed!');
    console.log('Response:', JSON.stringify(responseData, null, 2));
  } else {
    console.error(`❌ Structure verification failed! Missing ${missing} keys.`);
    process.exit(1);
  }

  await mongoose.disconnect();
  await mongod.stop();
}

verifyStructure().catch(err => {
  console.error(err);
  process.exit(1);
});

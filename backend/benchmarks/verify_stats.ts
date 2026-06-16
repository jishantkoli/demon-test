import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function setup() {
  const mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
    binary: { version: '6.0.4' }
  });
  await mongoose.connect(mongoServer.getUri());

  // Seed minimal data
  const admin = await User.create({
    email: 'admin@test.com',
    role: 'admin',
    profile: { fullName: 'Admin' }
  });

  const func = await User.create({
    email: 'func@test.com',
    role: 'functionary',
    profile: { fullName: 'Func', schoolCode: 'SCH1' }
  });

  await Form.create({ title: 'Form 1', adminId: admin._id, status: 'active', shareableLink: 'link1' });
  await Form.create({ title: 'Form 2', adminId: admin._id, status: 'draft', shareableLink: 'link2' });

  await Submission.create({ formId: new mongoose.Types.ObjectId(), status: 'submitted', schoolCode: 'SCH1' });

  await Nomination.create({
    form_id: new mongoose.Types.ObjectId(),
    functionary_id: func._id,
    teacher_name: 'T1',
    teacher_email: 't1@test.com',
    school_code: 'SCH1',
    status: 'completed'
  });

  return { admin, func };
}

async function verify(user: any) {
  let responseData: any = null;
  const req = { user } as any;
  const res = {
    status: () => res,
    json: (data: any) => { responseData = data; return res; }
  } as any;

  await getStats(req, res);

  console.log(`\nVerifying response for ${user.role}:`);
  const expectedKeys = [
    'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
    'totalSubmissions', 'submissionsByStatus', 'usersByRole',
    'totalNominations', 'nominationsByStatus', 'completionRate'
  ];

  const missing = expectedKeys.filter(k => !(k in responseData));
  if (missing.length > 0) {
    console.error('❌ Missing keys:', missing);
    process.exit(1);
  } else {
    console.log('✅ All expected keys present');
  }

  // Basic value checks
  if (user.role === 'admin') {
    if (responseData.totalUsers >= 2) console.log('✅ totalUsers correct');
    else console.error('❌ totalUsers incorrect', responseData.totalUsers);
  }

  if (user.role === 'functionary') {
    if (responseData.totalNominations === 1) console.log('✅ totalNominations correct');
    else console.error('❌ totalNominations incorrect', responseData.totalNominations);
    if (responseData.completionRate === 100) console.log('✅ completionRate correct');
  }
}

async function main() {
  const { admin, func } = await setup();
  await verify(admin);
  await verify(func);
  console.log('\nVerification completed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

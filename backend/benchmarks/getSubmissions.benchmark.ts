import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Submission } from '../src/models/Submission';
import { Nomination } from '../src/models/Nomination';
import { User } from '../src/models/User';
import { Form } from '../src/models/Form';

async function runBenchmark() {
  const mongo = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 120000,
    }
  });
  const uri = mongo.getUri();
  await mongoose.connect(uri);

  console.log('Seeding data...');

  const functionary = await User.create({
    email: 'func@test.com',
    role: 'functionary',
    profile: { fullName: 'Functionary Test' }
  });

  const form = await Form.create({
    title: 'Test Form',
    status: 'active',
    shareableLink: 'test-form'
  });

  const NUM_NOMINATIONS = 1000;
  const nominations = [];
  const submissions = [];

  for (let i = 0; i < NUM_NOMINATIONS; i++) {
    const teacherEmail = `teacher${i}@test.com`;
    nominations.push({
      form_id: form._id,
      functionary_id: functionary._id,
      teacher_name: `Teacher ${i}`,
      teacher_email: teacherEmail,
      school_code: 'SCH001',
      unique_token: `token${i}`
    });

    submissions.push({
      formId: form._id,
      userEmail: teacherEmail,
      userName: `Teacher ${i}`,
      responses: [],
      status: 'submitted'
    });
  }

  await Nomination.insertMany(nominations);
  await Submission.insertMany(submissions);

  console.log(`Seeded ${NUM_NOMINATIONS} nominations and ${NUM_NOMINATIONS} submissions.`);

  const req: any = {
    user: functionary,
    query: {}
  };

  const benchmark = async (name: string, fn: () => Promise<any>) => {
    const start = Date.now();
    const results = await fn();
    const end = Date.now();
    console.log(`${name}: Found ${results.length} submissions in ${end - start}ms`);
  };

  // 1. Implementation before optimization (manually recreated logic)
  const legacyLogic = async () => {
    const myNominations = await Nomination.find({ functionary_id: req.user._id });
    const teacherEmails = myNominations.map(n => n.teacher_email);
    const query: any = {
      userEmail: { $in: teacherEmails.map(email => new RegExp(`^${email}$`, 'i')) }
    };
    const submissions = await Submission.find(query).populate('nominationId').sort({ createdAt: -1 });
    return submissions.map(s => {
        const obj = s.toObject();
        return { ...obj, id: obj._id };
    });
  };

  // 2. Implementation after optimization
  const optimizedLogic = async () => {
    const myNominations = await Nomination.find({ functionary_id: req.user._id })
      .select('teacher_email')
      .lean();
    const teacherEmails = myNominations.map(n => n.teacher_email);
    const query: any = {
      userEmail: { $in: teacherEmails }
    };
    const submissions = await Submission.find(query).populate('nominationId').sort({ createdAt: -1 }).lean();
    return submissions.map((obj: any) => {
        return { ...obj, id: obj._id };
    });
  };

  console.log('Running benchmark...');
  await benchmark('Legacy Logic', legacyLogic);
  await benchmark('Optimized Logic', optimizedLogic);

  await mongoose.disconnect();
  await mongo.stop();
}

runBenchmark().catch(console.error);

import 'dotenv/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

const SEED_USERS = 1000;
const SEED_FORMS = 50;
const SEED_SUBMISSIONS = 5000;
const SEED_NOMINATIONS = 500;

async function setupBenchmark() {
    const mongoServer = await MongoMemoryServer.create({
        instance: { launchTimeout: 120000 },
        binary: { version: '6.0.4' }
    });
    await mongoose.connect(mongoServer.getUri());

    console.log('Seeding data for benchmark...');

    // Seed Users
    const users = [];
    for (let i = 0; i < SEED_USERS; i++) {
        users.push({
            email: `user${i}@test.com`,
            role: i % 4 === 0 ? 'admin' : i % 4 === 1 ? 'reviewer' : i % 4 === 2 ? 'functionary' : 'teacher',
            profile: { fullName: `User ${i}`, schoolCode: `SCH${i % 10}` }
        });
    }
    await User.insertMany(users);
    const dbUsers = await User.find().limit(10);
    const functionary = await User.findOne({ role: 'functionary' });
    const teacher = await User.findOne({ role: 'teacher' });
    const admin = await User.findOne({ role: 'admin' });

    // Seed Forms
    const forms = [];
    for (let i = 0; i < SEED_FORMS; i++) {
        forms.push({
            title: `Form ${i}`,
            status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'draft' : 'expired',
            shareableLink: `link-${i}`
        });
    }
    await Form.insertMany(forms);
    const dbForms = await Form.find({ status: 'active' }).limit(5);

    // Seed Nominations
    const nominations = [];
    for (let i = 0; i < SEED_NOMINATIONS; i++) {
        nominations.push({
            form_id: dbForms[i % dbForms.length]._id,
            functionary_id: functionary?._id,
            teacher_name: `Teacher ${i}`,
            teacher_email: `teacher${i}@test.com`,
            school_code: 'SCH1',
            status: i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'invited' : 'completed',
            unique_token: `token-${i}`
        });
    }
    await Nomination.insertMany(nominations);

    // Seed Submissions
    const submissions = [];
    for (let i = 0; i < SEED_SUBMISSIONS; i++) {
        submissions.push({
            formId: dbForms[i % dbForms.length]._id,
            userId: users[i % users.length]._id,
            schoolCode: `SCH${i % 10}`,
            status: i % 4 === 0 ? 'submitted' : i % 4 === 1 ? 'under_review' : i % 4 === 2 ? 'approved' : 'rejected'
        });
    }
    await Submission.insertMany(submissions);

    console.log('Seeding complete.');
    return { admin, functionary, teacher };
}

async function runBenchmark(user: any, label: string) {
    const req = { user } as any;
    const res = {
        status: () => res,
        json: (data: any) => data
    } as any;

    const start = performance.now();
    await getStats(req, res);
    const end = performance.now();
    console.log(`${label} getStats took: ${(end - start).toFixed(2)}ms`);
    return end - start;
}

async function main() {
    try {
        const { admin, functionary, teacher } = await setupBenchmark();

        console.log('\nRunning Benchmarks (Cold):');
        await runBenchmark(admin, 'Admin');
        await runBenchmark(functionary, 'Functionary');
        await runBenchmark(teacher, 'Teacher');

        console.log('\nRunning Benchmarks (Warm):');
        let adminTotal = 0;
        let funcTotal = 0;
        let teacherTotal = 0;
        const iterations = 5;

        for (let i = 0; i < iterations; i++) {
            adminTotal += await runBenchmark(admin, `Admin [${i+1}]`);
            funcTotal += await runBenchmark(functionary, `Functionary [${i+1}]`);
            teacherTotal += await runBenchmark(teacher, `Teacher [${i+1}]`);
        }

        console.log(`\nAverage Admin: ${(adminTotal / iterations).toFixed(2)}ms`);
        console.log(`Average Functionary: ${(funcTotal / iterations).toFixed(2)}ms`);
        console.log(`Average Teacher: ${(teacherTotal / iterations).toFixed(2)}ms`);

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

main();

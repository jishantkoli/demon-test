import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';
import { getStats } from '../src/controllers/stats.js';

async function runBenchmark() {
    const mongoServer = await MongoMemoryServer.create({
        instance: {
            launchTimeout: 120000
        }
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    console.log('Connected to in-memory database');

    // Seed data
    const schoolCode = 'SCH001';
    const functionaryId = new mongoose.Types.ObjectId();
    const teacherId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();

    // Create many nominations and submissions
    const nominationCount = 500;
    const submissionCount = 500;
    const userCount = 1000;

    console.log(`Seeding ${userCount} users, ${nominationCount} nominations, ${submissionCount} submissions...`);

    const users = [];
    for (let i = 0; i < userCount; i++) {
        users.push({
            email: `user${i}@example.com`,
            passwordHash: 'hash',
            role: i < 10 ? 'admin' : (i < 100 ? 'functionary' : (i < 500 ? 'reviewer' : 'teacher')),
            school_code: schoolCode,
            profile: { fullName: `User ${i}`, schoolCode }
        });
    }
    await User.insertMany(users);

    const forms = [
        { title: 'Form 1', status: 'active', shareableLink: 'link1' },
        { title: 'Form 2', status: 'draft', shareableLink: 'link2' },
        { title: 'Form 3', status: 'expired', shareableLink: 'link3' },
    ];
    await Form.insertMany(forms);

    const nominations = [];
    for (let i = 0; i < nominationCount; i++) {
        nominations.push({
            form_id: new mongoose.Types.ObjectId(),
            functionary_id: functionaryId,
            teacher_name: `Teacher ${i}`,
            teacher_email: `teacher${i}@example.com`,
            school_code: schoolCode,
            status: i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'invited' : 'completed'),
            unique_token: `token${i}`
        });
    }
    await Nomination.insertMany(nominations);

    const submissions = [];
    for (let i = 0; i < submissionCount; i++) {
        submissions.push({
            formId: new mongoose.Types.ObjectId(),
            userId: teacherId,
            schoolCode: schoolCode,
            status: i % 4 === 0 ? 'submitted' : (i % 4 === 1 ? 'under_review' : (i % 4 === 2 ? 'approved' : 'rejected'))
        });
    }
    await Submission.insertMany(submissions);

    const mockRes: any = {
        status: function(code: number) { this.statusCode = code; return this; },
        json: function(data: any) { this.data = data; return this; }
    };

    const runTest = async (role: string, user: any) => {
        const mockReq: any = {
            user
        };
        const start = performance.now();
        await getStats(mockReq, mockRes);
        const end = performance.now();
        return end - start;
    };

    const functionaryUser = { _id: functionaryId, role: 'functionary', school_code: schoolCode };
    const adminUser = { _id: adminId, role: 'admin' };

    console.log('Running benchmark for functionary...');
    let totalTime = 0;
    const iterations = 10;
    for (let i = 0; i < iterations; i++) {
        totalTime += await runTest('functionary', functionaryUser);
    }
    console.log(`Average getStats time (Functionary): ${(totalTime / iterations).toFixed(2)}ms`);

    console.log('Running benchmark for admin...');
    totalTime = 0;
    for (let i = 0; i < iterations; i++) {
        totalTime += await runTest('admin', adminUser);
    }
    console.log(`Average getStats time (Admin): ${(totalTime / iterations).toFixed(2)}ms`);

    await mongoose.disconnect();
    await mongoServer.stop();
}

runBenchmark().catch(console.error);

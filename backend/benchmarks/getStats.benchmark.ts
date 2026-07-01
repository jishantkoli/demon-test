import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/models/User.js';
import { Form } from '../src/models/Form.js';
import { Submission } from '../src/models/Submission.js';
import { Nomination } from '../src/models/Nomination.js';

async function benchmark() {
    const mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    console.log('Seeding data...');
    // Create an admin user
    const admin = await User.create({
        email: 'admin@example.com',
        role: 'admin',
        profile: { fullName: 'Admin User' }
    });

    // Create some forms
    await Form.insertMany([
        { title: 'Form 1', status: 'active', adminId: admin._id, shareableLink: 'link1' },
        { title: 'Form 2', status: 'active', adminId: admin._id, shareableLink: 'link2' },
        { title: 'Form 3', status: 'draft', adminId: admin._id, shareableLink: 'link3' },
    ]);

    // Create some submissions
    const submissions = [];
    for (let i = 0; i < 100; i++) {
        submissions.push({
            formId: new mongoose.Types.ObjectId(),
            status: i % 2 === 0 ? 'submitted' : 'approved',
            userEmail: `user${i}@example.com`,
            userName: `User ${i}`
        });
    }
    await Submission.insertMany(submissions);

    const req = {
        user: admin
    } as any;

    console.log('Running benchmark for sequential getStats...');
    const start = Date.now();

    // Simulating the logic in getStats.ts (sequential)
    for (let i = 0; i < 50; i++) {
        const totalUsers = await User.countDocuments();
        const activeForms = await Form.countDocuments({ status: 'active' });
        const draftForms = await Form.countDocuments({ status: 'draft' });
        const expiredForms = await Form.countDocuments({ status: 'expired' });
        const totalSubmissions = await Submission.countDocuments({});

        const submissionsByStatus = {
            submitted: await Submission.countDocuments({ status: 'submitted' }),
            under_review: await Submission.countDocuments({ status: 'under_review' }),
            approved: await Submission.countDocuments({ status: 'approved' }),
            rejected: await Submission.countDocuments({ status: 'rejected' }),
        };

        const usersByRole = {
            admin: await User.countDocuments({ role: 'admin' }),
            reviewer: await User.countDocuments({ role: 'reviewer' }),
            functionary: await User.countDocuments({ role: 'functionary' }),
            teacher: await User.countDocuments({ role: 'teacher' }),
        };
    }

    const end = Date.now();
    console.log(`Sequential execution took: ${end - start}ms`);

    console.log('Running benchmark for optimized getStats (Promise.all)...');
    const startOpt = Date.now();

    for (let i = 0; i < 50; i++) {
        const [
            totalUsers,
            activeForms,
            draftForms,
            expiredForms,
            totalSubmissions,
            submittedSub,
            underReviewSub,
            approvedSub,
            rejectedSub,
            adminUsers,
            reviewerUsers,
            functionaryUsers,
            teacherUsers
        ] = await Promise.all([
            User.countDocuments(),
            Form.countDocuments({ status: 'active' }),
            Form.countDocuments({ status: 'draft' }),
            Form.countDocuments({ status: 'expired' }),
            Submission.countDocuments({}),
            Submission.countDocuments({ status: 'submitted' }),
            Submission.countDocuments({ status: 'under_review' }),
            Submission.countDocuments({ status: 'approved' }),
            Submission.countDocuments({ status: 'rejected' }),
            User.countDocuments({ role: 'admin' }),
            User.countDocuments({ role: 'reviewer' }),
            User.countDocuments({ role: 'functionary' }),
            User.countDocuments({ role: 'teacher' }),
        ]);
    }

    const endOpt = Date.now();
    console.log(`Optimized execution (Promise.all) took: ${endOpt - startOpt}ms`);

    await mongoose.disconnect();
    await mongoServer.stop();
}

benchmark().catch(console.error);

import 'dotenv/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Form } from './models/Form.js';
import { Submission } from './models/Submission.js';
import { Nomination } from './models/Nomination.js';
import { getStats } from './controllers/stats.js';

async function main() {
    const mongoServer = await MongoMemoryServer.create({
        instance: { launchTimeout: 120000 },
        binary: { version: '6.0.4' }
    });
    await mongoose.connect(mongoServer.getUri());

    // Create a functionary user
    const functionary = await User.create({
        email: 'func@test.com',
        role: 'functionary',
        profile: { fullName: 'Func', schoolCode: 'SCH1' }
    });

    const form = await Form.create({
        title: 'Form 1',
        status: 'active',
        shareableLink: 'link1'
    });

    await Nomination.create({
        form_id: form._id,
        functionary_id: functionary._id,
        teacher_name: 'Teacher 1',
        teacher_email: 'teacher1@test.com',
        school_code: 'SCH1',
        status: 'pending'
    });

    await Submission.create({
        formId: form._id,
        userId: new mongoose.Types.ObjectId(),
        schoolCode: 'SCH1',
        status: 'submitted'
    });

    const req = { user: functionary } as any;
    let responseData: any;
    const res = {
        status: () => res,
        json: (data: any) => {
            responseData = data;
            return data;
        }
    } as any;

    await getStats(req, res);

    const expectedKeys = [
        'totalUsers',
        'activeForms',
        'draftForms',
        'expiredForms',
        'totalSubmissions',
        'submissionsByStatus',
        'usersByRole',
        'totalNominations',
        'nominationsByStatus',
        'completionRate'
    ];

    const missingKeys = expectedKeys.filter(key => !(key in responseData));

    if (missingKeys.length > 0) {
        console.error('Verification failed. Missing keys:', missingKeys);
        process.exit(1);
    }

    console.log('Verification successful! All expected keys present.');
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

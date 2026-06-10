import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './models/User.js';
import { Form } from './models/Form.js';
import { Submission } from './models/Submission.js';
import { Nomination } from './models/Nomination.js';
import { getStats } from './controllers/stats.js';

async function verifyStats() {
    const mongoServer = await MongoMemoryServer.create({
        instance: {
            launchTimeout: 120000
        }
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    console.log('Connected to in-memory database');

    const schoolCode = 'SCH001';
    const functionaryId = new mongoose.Types.ObjectId();

    // Seed basic data
    await User.create({
        email: 'admin@test.com',
        role: 'admin',
        profile: { fullName: 'Admin', schoolCode }
    });

    await User.create({
        _id: functionaryId,
        email: 'func@test.com',
        role: 'functionary',
        school_code: schoolCode,
        profile: { fullName: 'Functionary', schoolCode }
    });

    await Form.create({ title: 'Active Form', status: 'active', shareableLink: 'active' });
    await Form.create({ title: 'Draft Form', status: 'draft', shareableLink: 'draft' });

    await Nomination.create({
        form_id: new mongoose.Types.ObjectId(),
        functionary_id: functionaryId,
        teacher_name: 'Teacher 1',
        teacher_email: 'teacher1@test.com',
        school_code: schoolCode,
        status: 'pending',
        unique_token: 'token1'
    });

    await Submission.create({
        formId: new mongoose.Types.ObjectId(),
        schoolCode: schoolCode,
        status: 'submitted'
    });

    const mockRes: any = {
        status: function(code: number) { this.statusCode = code; return this; },
        json: function(data: any) { this.data = data; return this; }
    };

    console.log('Testing Admin stats...');
    await getStats({ user: { role: 'admin' } } as any, mockRes);
    console.log('Admin Response:', JSON.stringify(mockRes.data, null, 2));

    const expectedKeys = [
        'totalUsers', 'activeForms', 'draftForms', 'expiredForms',
        'totalSubmissions', 'submissionsByStatus', 'usersByRole',
        'totalNominations', 'nominationsByStatus', 'completionRate'
    ];

    expectedKeys.forEach(key => {
        if (!(key in mockRes.data)) {
            throw new Error(`Missing key in response: ${key}`);
        }
    });

    console.log('Testing Functionary stats...');
    await getStats({ user: { _id: functionaryId, role: 'functionary', school_code: schoolCode, profile: { schoolCode } } } as any, mockRes);
    console.log('Functionary Response:', JSON.stringify(mockRes.data, null, 2));

    if (mockRes.data.totalNominations !== 1) {
        throw new Error(`Expected 1 nomination for functionary, got ${mockRes.data.totalNominations}`);
    }

    console.log('✅ Structural verification passed!');

    await mongoose.disconnect();
    await mongoServer.stop();
}

verifyStats().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});

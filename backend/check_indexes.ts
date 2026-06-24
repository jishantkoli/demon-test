import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import { Form } from './src/models/Form.js';
import { Submission } from './src/models/Submission.js';
import { Nomination } from './src/models/Nomination.js';
import { connectDB } from './src/config/db.js';
import 'dotenv/config';

async function checkIndexes() {
  await connectDB();
  const models = [User, Form, Submission, Nomination];
  for (const model of models) {
    const indexes = await model.collection.getIndexes();
    console.log(`Indexes for ${model.modelName}:`, JSON.stringify(indexes, null, 2));
  }
  await mongoose.connection.close();
}

checkIndexes().catch(console.error);

import mongoose from 'mongoose';
import { User } from '../server/src/models/User';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

async function testGoogleCreate() {
    try {
        console.log("Connecting to Mongo...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected!");

        const testId = "1043803990101_test_google_id_" + Date.now();
        const email = "test_user_" + Date.now() + "@example.com";

        console.log("Trying User.create with no username...");
        const user = await User.create({
            googleId: testId,
            name: "Test User",
            email: email,
        });

        console.log("Success! Created user id:", user._id);
        await User.findByIdAndDelete(user._id);

    } catch (err) {
        console.error("\n❌ CREATE FAILED WITH ERROR:");
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

testGoogleCreate();

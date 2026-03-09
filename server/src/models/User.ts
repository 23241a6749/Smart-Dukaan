import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Hashed
    phoneNumber: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    shopName: { type: String },
    avatar: { type: String },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            default: undefined
        }
    },
    address: { type: String } // Optional: store formatted address
}, { timestamps: true });

// Add geospatial index for efficient location queries
userSchema.index({ location: '2dsphere' });

export const User = mongoose.model('User', userSchema);

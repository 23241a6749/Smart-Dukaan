import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    shopkeeperId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    costPrice: { type: Number },
    stock: { type: Number, required: true },
    category: { type: String },
    unit: { type: String },
    icon: { type: String },
}, { timestamps: true });

export const Product = mongoose.model('Product', productSchema);

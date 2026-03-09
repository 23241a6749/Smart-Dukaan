import express from 'express';
import { Product } from '../models/Product.js';
import { SupplierBill } from '../models/SupplierBill.js';
import { auth } from '../middleware/auth.js';
import * as fuzzball from 'fuzzball';

const router = express.Router();

interface LineItem {
    productName: string;
    quantity: number;
    unit: string;
    totalAmount: number;
    customSellingPrice?: number;  // Custom selling price per unit
}

// Get Bill History
router.get('/', auth, async (req, res) => {
    try {
        const bills = await SupplierBill.find({ shopkeeperId: req.auth?.userId })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(bills);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Process Supplier Bill
router.post('/process', auth, async (req, res) => {
    const { lineItems } = req.body;
    const userId = req.auth?.userId;

    if (!lineItems || !Array.isArray(lineItems)) {
        return res.status(400).json({ message: 'Invalid line items' });
    }

    const results = [];
    const updates = [];
    const billItems = [];
    let billTotal = 0;

    try {
        // Fetch all products for fuzzy matching
        const allProducts = await Product.find({ shopkeeperId: userId });
        const productNames = allProducts.map(p => p.name);

        for (const item of lineItems) {
            const { productName, quantity, totalAmount, customSellingPrice } = item;
            const costParam = quantity > 0 ? totalAmount / quantity : 0;
            const costPrice = Math.round(costParam); // Round to whole number as requested

            billTotal += totalAmount || 0;
            const sellingPrice = customSellingPrice || Math.round(costPrice * 1.05);

            billItems.push({
                productName,
                quantity,
                unit: item.unit || 'unit',
                totalAmount,
                costPrice,
                sellingPrice
            });

            // Fuzzy Match
            const match = fuzzball.extract(productName, productNames, { limit: 1, scorer: fuzzball.token_set_ratio });

            let action = 'ignored';
            let matchedProduct = null;
            let priceUpdate = null;

            if (match && match.length > 0 && match[0][1] > 80) {
                // High confidence match
                const matchedName = match[0][0];
                matchedProduct = allProducts.find(p => p.name === matchedName);

                if (matchedProduct) {
                    action = 'updated';

                    const updateDoc: any = {
                        $inc: { stock: quantity },
                        costPrice: costPrice
                    };

                    if (customSellingPrice) {
                        updateDoc.price = customSellingPrice;
                        if (matchedProduct.price !== customSellingPrice) {
                            priceUpdate = { old: matchedProduct.price, new: customSellingPrice };
                        }
                    }

                    updates.push({
                        updateOne: {
                            filter: { _id: matchedProduct._id },
                            update: updateDoc
                        }
                    });
                }
            } else {
                // No match, create new product
                action = 'created';

                const newProduct = new Product({
                    shopkeeperId: userId,
                    name: productName,
                    price: sellingPrice,
                    costPrice: costPrice,
                    stock: quantity,
                    unit: item.unit || 'unit',
                    category: 'Uncategorized', // Default
                    icon: '📦'
                });

                await newProduct.save();
                matchedProduct = newProduct;
            }

            results.push({
                input: item,
                match: matchedProduct ? matchedProduct.name : null,
                score: match && match.length > 0 ? match[0][1] : 0,
                action,
                costPrice,
                sellingPrice: matchedProduct?.price,
                priceUpdate
            });
        }

        if (updates.length > 0) {
            await Product.bulkWrite(updates);
        }

        // Save Bill History
        const newBill = new SupplierBill({
            shopkeeperId: userId,
            items: billItems,
            totalAmount: billTotal,
            itemCount: billItems.length,
            date: new Date()
        });
        await newBill.save();

        res.json({ success: true, results, billId: newBill._id });

    } catch (err: any) {
        console.error('Supplier bill processing failed:', err);
        res.status(500).json({ message: err.message });
    }
});

export { router as supplierBillsRouter };

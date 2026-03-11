import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Bill } from '../models/Bill.js';
import { Product } from '../models/Product.js';
import { Customer } from '../models/Customer.js';
import { CustomerAccount } from '../models/CustomerAccount.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { OTP } from '../models/OTP.js';
import { auth } from '../middleware/auth.js';
import { recalculateGlobalKhataScore } from '../utils/khataScore.js';
import twilio from 'twilio';

const router = express.Router();
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Razorpay instance (uses test keys from .env)
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!
});

// Helper function to create a bill (reusable)
async function createBillInternal(session: mongoose.ClientSession, data: any, userId: string) {
    const { customerPhoneNumber: rawPhone, customerName, items, paymentType } = data;
    const customerPhoneNumber = rawPhone.startsWith('+91') ? rawPhone : '+91' + rawPhone.replace(/\D/g, '').slice(-10);

    // 1. Find or Create Customer
    let customer = await Customer.findOne({ phoneNumber: customerPhoneNumber }).session(session);
    if (!customer) {
        customer = new Customer({
            phoneNumber: customerPhoneNumber,
            name: customerName || ''
        });
        await customer.save({ session });
    } else if (customerName && !customer.name) {
        customer.name = customerName;
        await customer.save({ session });
    }

    let totalAmount = 0;
    const processedItems = [];

    // 2. Validate Stock and Calculate Total
    for (const item of items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

        product.stock -= item.quantity;
        await product.save({ session });

        totalAmount += product.price * item.quantity;
        processedItems.push({
            productId: product._id,
            name: product.name,
            quantity: item.quantity,
            price: product.price
        });
    }

    // 3. Create Bill
    const bill = new Bill({
        shopkeeperId: userId,
        customerId: customer._id,
        items: processedItems,
        totalAmount,
        paymentType
    });
    await bill.save({ session });

    // 4. Handle Ledger if applicable
    if (paymentType === 'ledger') {
        const ledgerEntry = new LedgerEntry({
            shopkeeperId: userId,
            customerId: customer._id,
            billId: bill._id,
            amount: totalAmount,
            type: 'debit',
            status: 'pending'
        });
        await ledgerEntry.save({ session });

        let account = await CustomerAccount.findOne({
            customerId: customer._id,
            shopkeeperId: userId
        }).session(session);

        if (!account) {
            account = new CustomerAccount({
                customerId: customer._id,
                shopkeeperId: userId,
                balance: totalAmount
            });
        } else {
            account.balance += totalAmount;
        }
        await account.save({ session });
    }

    // Recalculate Global Khata Score after any transaction (new debt or cash purchase)
    recalculateGlobalKhataScore(customer._id.toString()).catch(err => console.error('Score calculation error:', err));

    return bill;
}

function buildWhatsAppBillMessage(customerName: string, bill: any) {
    const itemLines = (bill.items || [])
        .map((item: any) => `- ${item.name} x ${item.quantity} = Rs.${(item.price * item.quantity).toFixed(0)}`)
        .join('\n');

    return [
        `Namaste ${customerName || 'Customer'},`,
        '',
        'Your bill has been generated:',
        itemLines,
        '',
        `Total: Rs.${Number(bill.totalAmount || 0).toFixed(0)}`,
        `Payment Type: ${bill.paymentType}`,
        `Date: ${new Date(bill.createdAt).toLocaleString('en-IN')}`,
        '',
        '- KiranaLink'
    ].join('\n');
}

// Create a new bill (Cash/Online)
router.post('/', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (req.body.paymentType === 'ledger') {
            throw new Error('Ledger payments require OTP verification');
        }

        if (!req.auth?.userId) throw new Error('Authentication required');
        const bill = await createBillInternal(session, req.body, req.auth.userId);
        await session.commitTransaction();
        res.status(201).json(bill);
    } catch (err: any) {
        await session.abortTransaction();
        res.status(400).json({ message: err.message });
    } finally {
        session.endSession();
    }
});

// Send OTP for Khata payment
router.post('/khata/send-otp', auth, async (req, res) => {
    try {
        const { customerPhoneNumber: rawPhone } = req.body;
        if (!rawPhone) return res.status(400).json({ message: 'Phone number is required' });
        const customerPhoneNumber = rawPhone.startsWith('+91') ? rawPhone : '+91' + rawPhone.replace(/\D/g, '').slice(-10);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OTP.findOneAndUpdate(
            { phoneNumber: customerPhoneNumber },
            { otp, expiresAt, attempts: 0 },
            { upsert: true }
        );


        if (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_SMS_NUMBER) {
            const twilioWhatsappNum = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
            const isWhatsApp = twilioWhatsappNum.startsWith('whatsapp:');
            const from = twilioWhatsappNum;

            const cleanPhone = customerPhoneNumber.replace(/\D/g, '').slice(-10);
            const to = isWhatsApp ? `whatsapp:+91${cleanPhone}` : `+91${cleanPhone}`;

            console.log(`[Twilio] Sending OTP via ${isWhatsApp ? 'WhatsApp' : 'SMS'} to ${to} from ${from}...`);
            try {
                await twilioClient.messages.create({
                    body: `Your KiranaLink code is ${otp}`, // Pre-approved Sandbox Template pattern
                    from: from,
                    to: to
                });
                console.log('[Twilio] OTP sent successfully');
            } catch (twilioErr: any) {
                console.error('[Twilio] Error:', twilioErr.message);
                // Fallback attempt with normal SMS if WhatsApp fails
                try {
                    const fromSms = process.env.TWILIO_PHONE_NUMBER?.replace('whatsapp:', '');
                    if (fromSms) {
                        await twilioClient.messages.create({
                            body: `Your KiranaLink OTP is: ${otp}`,
                            from: fromSms,
                            to: `+91${cleanPhone}`
                        });
                        console.log('[Twilio] Fallback SMS sent successfully');
                    }
                } catch (e) {
                    console.error('[Twilio Fallback] Error:', e);
                }
            }
        } else {
            console.log(`[MOCK OTP] Phone: ${customerPhoneNumber}, OTP: ${otp}`);
        }

        const isDemo = process.env.DEMO_MODE === 'true';
        res.json({
            message: 'OTP sent',
            ...(isDemo && { demoOtp: otp }) // Include OTP in payload for zero-fail hackathon demo
        });
    } catch (err: any) {
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

// Verify OTP and complete Khata payment
router.post('/khata/verify-otp', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { customerPhoneNumber: rawPhone, otp, billData } = req.body;
        const customerPhoneNumber = rawPhone.startsWith('+91') ? rawPhone : '+91' + rawPhone.replace(/\D/g, '').slice(-10);

        const otpRecord = await OTP.findOne({ phoneNumber: customerPhoneNumber });
        if (!otpRecord) throw new Error('OTP expired or not requested');

        if (otpRecord.attempts >= 3) {
            await OTP.deleteOne({ phoneNumber: customerPhoneNumber });
            throw new Error('Max attempts reached. Please resend OTP.');
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            throw new Error('Invalid OTP');
        }

        await OTP.deleteOne({ phoneNumber: customerPhoneNumber });

        if (!req.auth?.userId) throw new Error('Authentication required');
        const bill = await createBillInternal(session, { ...billData, paymentType: 'ledger' }, req.auth.userId);
        await session.commitTransaction();
        res.status(201).json(bill);
    } catch (err: any) {
        await session.abortTransaction();
        res.status(400).json({ message: err.message });
    } finally {
        session.endSession();
    }
});

// ─────────────────────────────────────────────
// RAZORPAY: Create Order
// Frontend calls this to get an order_id before opening the checkout popup.
// ─────────────────────────────────────────────
router.post('/razorpay/create-order', auth, async (req, res) => {
    try {
        const { amount } = req.body; // amount in PAISE (rupees * 100)
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        const order = await razorpay.orders.create({
            amount: Math.round(amount), // must be integer paise
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`,
        });

        // Send back both order details AND the public key_id so the frontend
        // can open Razorpay checkout without hard-coding the key.
        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (err: any) {
        console.error('[Razorpay] create-order error:', err);
        res.status(500).json({ message: err.error?.description || 'Failed to create Razorpay order' });
    }
});

// ─────────────────────────────────────────────
// RAZORPAY: Verify Payment & Complete Bill
// Called after the user successfully pays in the Razorpay popup.
// Verifies the HMAC signature, then creates the bill exactly like a
// regular cash/online payment would.
// ─────────────────────────────────────────────
router.post('/razorpay/verify-payment', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            billData // same shape as the regular /bills POST body
        } = req.body;

        // 1. Verify HMAC-SHA256 signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            throw new Error('Payment signature verification failed');
        }

        // 2. Signature valid → complete the bill (paymentType = 'online')
        if (!req.auth?.userId) throw new Error('Authentication required');
        const bill = await createBillInternal(
            session,
            { ...billData, paymentType: 'online' },
            req.auth.userId
        );

        await session.commitTransaction();
        res.status(201).json({ bill, razorpayPaymentId: razorpay_payment_id });
    } catch (err: any) {
        await session.abortTransaction();
        console.error('[Razorpay] verify-payment error:', err);
        res.status(400).json({ message: err.message });
    } finally {
        session.endSession();
    }
});

// Get all bills
router.get('/', auth, async (req, res) => {
    try {
        const bills = await Bill.find({ shopkeeperId: req.auth?.userId }).populate('customerId').sort({ createdAt: -1 });
        res.json(bills);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/:id/send-whatsapp', auth, async (req, res) => {
    try {
        if (!req.auth?.userId) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        const bill = await Bill.findOne({ _id: req.params.id, shopkeeperId: req.auth.userId })
            .populate('customerId', 'name phoneNumber whatsappLastInboundAt');

        if (!bill) {
            res.status(404).json({ message: 'Bill not found' });
            return;
        }

        const customer = bill.customerId as any;
        if (!customer?.phoneNumber) {
            res.status(400).json({ message: 'Customer phone number missing' });
            return;
        }

        const lastInboundAt = customer.whatsappLastInboundAt ? new Date(customer.whatsappLastInboundAt).getTime() : 0;
        const in24hWindow = lastInboundAt > 0 && (Date.now() - lastInboundAt) <= (24 * 60 * 60 * 1000);

        if (!in24hWindow) {
            res.status(400).json({
                message: 'Customer is outside WhatsApp 24h free window. Ask customer to send any WhatsApp message first, then retry.',
                requires24hWindow: true
            });
            return;
        }

        const to = `whatsapp:${String(customer.phoneNumber).startsWith('+91') ? customer.phoneNumber : `+91${String(customer.phoneNumber).replace(/\D/g, '').slice(-10)}`}`;
        const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
        const body = buildWhatsAppBillMessage(customer.name || 'Customer', bill);

        await twilioClient.messages.create({
            from,
            to,
            body
        });

        res.json({
            success: true,
            message: 'Bill sent on WhatsApp within 24h window'
        });
    } catch (err: any) {
        console.error('send-whatsapp bill error:', err);
        res.status(500).json({ message: err.message || 'Failed to send bill on WhatsApp' });
    }
});

export { router as billRouter };


import express from 'express';
import twilio from 'twilio';
const { MessagingResponse } = twilio.twiml;
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

// === INSANE HACK: FREE MOCK DATABASE ===
const DB = {
    customers: new Map<string, any>([
        // TEST NUMBER (User's device)
        ['whatsapp:+918712316204', { name: 'Test User (Raju)', pending: 550, dueSince: '10 days', lang: 'en' }],
        // Dummy
        ['whatsapp:+919999999999', { name: 'Lakshmi Akka', pending: 1200, dueSince: '5 days', lang: 'hi' }]
    ]),
    orders: [] as any[]
};

const INVENTORY: Record<string, number> = { rice: 55, sugar: 40, oil: 110, dal: 90, atta: 45 };

// === MOCK AUDIO DB ===
const MOCK_AUDIO_DB: Record<string, string> = {
    // Normalize phone numbers to match sender format usually whatapp:+...
    'whatsapp:+918712316204': 'order rice 5kg and sugar 2kg',
    '+918712316204': 'order rice 5kg and sugar 2kg',
    'whatsapp:+919999999999': 'do kilo chawal aur ek dal'
};

// === AI SETUP ===
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'mock_key',
    dangerouslyAllowBrowser: true
});
let geminiModel: any = null;
try {
    if (process.env.GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
    }
} catch (e) {
    console.warn("Gemini AI init failed, using fallbacks");
}

// === HANDLERS ===

router.post('/webhook', async (req: any, res) => {
    const twiml = new MessagingResponse();
    const sender = req.body.From || 'whatsapp:+unknown';
    const messageType = req.body.NumMedia && parseInt(req.body.NumMedia) > 0 ? 'audio' : 'text';
    let incomingMsg = req.body.Body?.toLowerCase().trim() || '';

    // 1. VOICE NOTE HANDLER
    if (messageType === 'audio') {
        // HACKATHON SIMULATION: Pre-parsed audio based on sender

        // Try to find a mock message for this sender, or default
        const mockedMsg = Object.entries(MOCK_AUDIO_DB).find(([k, v]) => sender.includes(k))?.[1];
        incomingMsg = mockedMsg || 'order atta 1kg';

        // Simulate processing delay notification
        // twiml.message is synchronous in XML generation vs async logic. 
        // We send the final response directly. 
        // To show "Processing...", in real world we'd send a status update. 
        // Here we just prepend text to the response or acknowledge it.
        // We will assume the response generation handles the reply.
    }

    // 2. LANGUAGE DETECTION
    // Register customer if unknown
    if (!DB.customers.has(sender)) {
        // Default new customer
        DB.customers.set(sender, {
            name: 'New Customer',
            pending: 0,
            dueSince: 'now',
            lang: 'en'
        });
    }
    const customer = DB.customers.get(sender);
    const lang = detectLanguage(incomingMsg, customer.lang);

    // 3. GENERATE RESPONSE
    const response: any = await generateResponse(incomingMsg, sender, customer, lang);

    // 4. SEND MESSAGE (Construct TwiML)
    // @ts-ignore
    const twimlMsg = twiml.message();
    twimlMsg.body(response.text);

    if (messageType === 'audio') {
        // Add a little meta-text for the demo
        twimlMsg.body(`🎤 *Voice Parsed*: "${incomingMsg}"\n\n${response.text}`);
    }

    // 5. DASHBOARD PUSH
    if (req.io && response.event) {
        req.io.emit('whatsapp-event', {
            type: response.event,
            data: {
                sender: customer.name,
                customerPhone: sender,
                ...response.data,
                timestamp: new Date()
            }
        });
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

router.get('/analytics', (req, res) => {
    // Return simulated collection amount
    res.json(85400);
});

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

router.post('/broadcast-reminders', async (req: any, res) => {
    // 1. Send Simulated UI Events (for the Demo Effect)
    if (req.io) {
        req.io.emit('whatsapp-event', {
            type: 'SYSTEM',
            data: { item: `🚀 Sending payment reminders to ${DB.customers.size} customers...`, customer: 'ShopOS AI' }
        });
    }

    // 2. Actually Send via Twilio (Real World)
    let sentCount = 0;
    const errors: any[] = [];

    try {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
            console.warn("Missing Twilio Credentials - Skipping real send.");
        } else {
            // Loop through our "DB" customers
            for (const [phone, customer] of DB.customers) {
                try {
                    // Create personalized message
                    const { text } = createDuesResponse(customer, customer.lang || 'en');

                    const twilioWhatsappNum = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
                    await twilioClient.messages.create({
                        body: text,
                        from: twilioWhatsappNum, // e.g., 'whatsapp:+14155238886'
                        to: phone
                    });
                    sentCount++;
                    console.log(`Sent reminder to ${phone}`);
                } catch (err: any) {
                    console.error(`Failed to send to ${phone}:`, err.message);

                    let errorMsg = err.message;
                    if (err.code === 63015) {
                        const twilioWhatsappNum = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
                        errorMsg = `User has not joined Sandbox. Reply 'join <keyword>' to the Sandbox number ${twilioWhatsappNum}.`;
                        console.warn(`⚠️ SANDBOX RESTRICTION: ${phone} must message ${twilioWhatsappNum} first.`);
                    }
                    errors.push({ phone, error: errorMsg });
                }
            }
        }
    } catch (e) {
        console.error("Critical Twilio Error:", e);
    }

    // Simulate a reply coming in shortly (for the demo flow)
    if (req.io) {
        setTimeout(() => {
            req.io.emit('whatsapp-event', {
                type: 'PAYMENT_RECEIVED',
                data: { sender: 'Raju Bhai', amount: 550, customer: 'Raju Bhai', timestamp: new Date() }
            });
        }, 4000);
    }

    res.json({ success: true, count: sentCount, attempted: DB.customers.size, errors });
});


// === HELPERS ===

function detectLanguage(msg: string, defaultLang: string) {
    if (msg.includes('है') || msg.includes('भैया') || msg.includes('kijiye') || msg.includes('bhejo')) return 'hi';
    return defaultLang;
}

async function generateResponse(msg: string, sender: string, customer: any, lang: string) {
    // 1. DUES / NEGOTIATION
    if (msg.includes('due') || msg.includes('pending') || msg.includes('baki') || msg.includes('kitna')) {
        return createDuesResponse(customer, lang);
    }

    // 2. ORDER
    if (msg.startsWith('order') || msg.includes('pack') || msg.includes('kilo') || msg.includes('chawal') || msg.includes('rice') || msg.includes('bhejo') || msg.includes('send')) {
        return await createOrderResponse(msg, sender, customer, lang);
    }

    // 3. PAYMENT PROMISE
    if (msg.includes('tomorrow') || msg.includes('kal') || msg.includes('later') || msg.includes('bad me')) {
        return createPromiseResponse(customer, lang);
    }

    // 4. UPI PAYMENT
    if (msg.includes('pay') || msg.includes('paisa') || msg.includes('rupee') || msg.includes('qr')) {
        return createPaymentResponse(customer, lang);
    }

    return { text: getFallbackText(lang) };
}

function createDuesResponse(customer: any, lang: string) {
    const texts: any = {
        en: `📅 *Your Account: ${customer.name}*\nPending: *₹${customer.pending}*\nDue: ${customer.dueSince}\n\nReply 'PAY' for UPI or 'TOMORROW' to promise.`,
        hi: `📅 ${customer.name} जी, आपका बकाया: *₹${customer.pending}*\nअवधि: ${customer.dueSince}\n\nभुगतान के लिए 'PAY' लिखें या 'कल' वादा करें।`
    };

    // Gamification: Discount if due > certain amount or time (simulated)
    let text = texts[lang];
    if (customer.pending > 500) {
        text += lang === 'hi' ? '\n🎁 *1 घंटे में दें: 2% छूट!*' : '\n🎁 *Pay in 1hr: 2% OFF!*';
    }

    return { text: text, event: 'DUES_CHECKED', data: { amount: customer.pending } };
}

async function createOrderResponse(msg: string, sender: string, customer: any, lang: string) {
    const extracted = await extractOrderDetails(msg);
    const total = extracted.qty * (INVENTORY[extracted.item] || 100);

    const orderId = `ORD-${Date.now().toString().slice(-4)}`;
    DB.orders.unshift({ id: orderId, customer: sender, ...extracted, total, status: 'New' });

    const texts: any = {
        en: `✅ *Order #${orderId}*\n${extracted.item.toUpperCase()} x ${extracted.qty}kg = ₹${total}\n📦 Ready in 15 mins\n\nTrack: Reply 'STATUS'`,
        hi: `✅ ऑर्डर #${orderId}\n${extracted.item} x ${extracted.qty}कि.ग्रा = ₹${total}\n📦 15 मिनट में तैयार\n\nट्रैक: 'STATUS' लिखें`
    };

    return {
        text: texts[lang],
        event: 'NEW_ORDER',
        data: { orderId, item: extracted.item, qty: extracted.qty, total }
    };
}

async function extractOrderDetails(msg: string) {
    // Regex fallback if AI not available or for speed
    // Look for number provided followed by kg/unit or item
    // Very naive parser for hackathon
    // "order rice 5kg" -> item: rice, qty: 5

    let item = 'rice';
    let qty = 1;

    const items = Object.keys(INVENTORY);
    const foundItem = items.find(i => msg.includes(i));
    if (foundItem) item = foundItem;
    else if (msg.includes('chawal')) item = 'rice';
    else if (msg.includes('dal')) item = 'dal';
    else if (msg.includes('tel')) item = 'oil';

    const qtyMatch = msg.match(/(\d+)\s*(kg|l|pack|packet)/);
    if (qtyMatch) qty = parseInt(qtyMatch[1]);

    return { item, qty };
}

function createPromiseResponse(customer: any, lang: string) {
    const texts: any = {
        en: `👍 Okay ${customer.name}, noted for tomorrow.\nWe will remind you.\n\n_System updated promise date._`,
        hi: `👍 ठीक है ${customer.name} जी, कल का नोट कर लिया।\nहम आपको याद दिला देंगे।`
    };
    return { text: texts[lang], event: 'PROMISE_MADE', data: { date: 'Tomorrow' } };
}

function createPaymentResponse(customer: any, lang: string) {
    const upiLink = `upi://pay?pa=rajukirana@oksbi&pn=Raju Store&am=${customer.pending}&cu=INR`;
    const texts: any = {
        en: `💳 *Pay Instantly*\nAmount: ₹${customer.pending}\n\n👉 *Click here:* ${upiLink}\n\nOr screenshot & pay manually.`,
        hi: `💳 *तुरंत भुगतान करें*\nराशि: ₹${customer.pending}\n\n👉 *यहाँ क्लिक करें:* ${upiLink}`
    };
    return {
        text: texts[lang],
        event: 'PAYMENT_INITIATED',
        data: { amount: customer.pending }
    };
}

function getFallbackText(lang: string) {
    return lang === 'hi'
        ? '🤖 माफ़ कीजिए! समझ नहीं आया। "ORDER", "PAY" या "DUE" लिखें।'
        : '🤖 Sorry! I didn\'t understand. Reply ORDER, PAY, or DUE.';
}

export { router as whatsappRouter };

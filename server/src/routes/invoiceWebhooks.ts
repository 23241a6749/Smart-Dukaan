import { Router, Request, Response } from 'express';
import { Invoice } from '../models/Invoice.js';
import { CustomerAccount } from '../models/CustomerAccount.js';
import { classifyIntent, Intent } from '../services/intentClassifier.js';
import { sendGenericMessage } from '../services/communicationService.js';
import { appendToHistory, getHistory, clearHistory } from '../services/conversationMemory.js';
import OpenAI from 'openai';

export const invoiceWebhooksRouter = Router();

// ─── HELPERS ───────────────────────────────────────────────────────────────

// Sanitize ANY text for safe inclusion inside TwiML <Say> tags
function sanitizeForTwiml(text: string): string {
    return (text || '')
        .replace(/&/g, ' and ')
        .replace(/</g, '')
        .replace(/>/g, '')
        .replace(/₹/g, 'rupees ')
        .replace(/"/g, '')
        .replace(/'/g, '')
        .replace(/\n/g, '. ')
        .replace(/\r/g, '')
        .trim() || 'Thank you. Goodbye.';
}

// Build valid <Gather> TwiML for multi-turn voice conversation
function buildGatherTwiml(text: string, backendUrl: string): string {
    const safe = sanitizeForTwiml(text);
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${backendUrl}/api/invoices/webhook/voice" method="POST" timeout="5" speechTimeout="auto" language="en-IN" enhanced="true" speechModel="phone_call"><Say voice="alice" language="en-IN">${safe}</Say></Gather><Say voice="alice" language="en-IN">I did not hear anything. Goodbye.</Say></Response>`;
}

// Build valid hangup TwiML
function buildHangupTwiml(text: string): string {
    const safe = sanitizeForTwiml(text);
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="en-IN">${safe}</Say><Hangup/></Response>`;
}

// Build error TwiML — guaranteed to never fail
function buildErrorTwiml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="en-IN">Sorry, there was a connection issue. We will call you back. Goodbye.</Say><Hangup/></Response>`;
}

// Post-call WhatsApp follow-up with UPI payment link
async function sendWhatsAppFollowUp(invoice: any) {
    try {
        const upiUrl = `upi://pay?pa=kiranalink@oksbi&pn=KiranaLink&am=${invoice.amount}&cu=INR`;
        const message = `Hi ${invoice.client_name}! Thanks for talking with us.\n\nYour pending amount: *Rs.${invoice.amount}*\n\nPay via UPI: ${upiUrl}\n\n- KiranaLink AI Agent`;
        await sendGenericMessage(invoice.client_phone, message, 'whatsapp');
        console.log(`[Agent] WhatsApp follow-up sent to ${invoice.client_name}`);
    } catch (e) {
        console.error('[Agent] WhatsApp follow-up failed:', e);
    }
}

// ─── TEXT REPLY WEBHOOK ────────────────────────────────────────────────────

invoiceWebhooksRouter.post('/reply', async (req: Request, res: Response) => {
    try {
        const { From, Body } = req.body;
        if (!From || !Body) {
            res.status(200).send('<Response></Response>');
            return;
        }

        const cleanPhone = From.replace('whatsapp:', '');
        const invoice = await Invoice.findOne({
            client_phone: { $regex: new RegExp(cleanPhone.slice(-10) + '$') },
            status: { $in: ['unpaid', 'overdue'] }
        });

        if (!invoice) {
            res.status(200).send('<Response></Response>');
            return;
        }

        const intent: Intent = await classifyIntent(Body);
        console.log(`[Reply] ${invoice.client_name}: "${Body}" -> ${intent}`);

        if (intent === 'PAYMENT_PROMISED') {
            invoice.status = 'promised';
            invoice.last_contacted_at = new Date();
            invoice.reminder_history.push({ timestamp: new Date(), channel: 'customer_reply', message_content: `[PROMISED] "${Body}"`, delivery_status: 'received' });
            sendGenericMessage(cleanPhone, `Thank you ${invoice.client_name}! Payment promise noted. We will remind you tomorrow.`, 'whatsapp').catch(console.error);
        } else if (intent === 'EXTENSION_REQUESTED') {
            const ext = new Date(); ext.setDate(ext.getDate() + 3);
            invoice.due_date = ext;
            invoice.reminder_level = Math.max(0, invoice.reminder_level - 1);
            invoice.reminder_history.push({ timestamp: new Date(), channel: 'customer_reply', message_content: `[EXTENSION 3 days] "${Body}"`, delivery_status: 'received' });
            sendGenericMessage(cleanPhone, `Understood ${invoice.client_name}. You have 3 more days. Please pay Rs.${invoice.amount} by then.`, 'whatsapp').catch(console.error);
        } else if (intent === 'DISPUTE') {
            invoice.status = 'disputed';
            invoice.reminder_history.push({ timestamp: new Date(), channel: 'customer_reply', message_content: `[DISPUTE] "${Body}"`, delivery_status: 'received' });
            sendGenericMessage(cleanPhone, `We apologize ${invoice.client_name}. Your dispute is logged. Our team will review within 24 hours.`, 'whatsapp').catch(console.error);
        } else {
            invoice.reminder_history.push({ timestamp: new Date(), channel: 'customer_reply', message_content: `[UNKNOWN] "${Body}"`, delivery_status: 'received' });
        }

        await invoice.save();
        res.status(200).send('<Response></Response>');
    } catch (error) {
        console.error('Reply Webhook Error:', error);
        res.status(200).send('<Response></Response>');
    }
});

// ─── VOICE CALL WEBHOOK (BULLET-PROOF) ─────────────────────────────────────

invoiceWebhooksRouter.post('/voice', async (req: Request, res: Response) => {
    // ALWAYS set content type first — Twilio requires XML
    res.type('text/xml');

    const backendUrl = process.env.BACKEND_URL || '';

    try {
        const speechResult = req.body?.SpeechResult || '';
        const from = req.body?.From || '';
        const to = req.body?.To || '';

        console.log(`[Voice] From=${from} To=${to} Speech="${speechResult}"`);

        // Determine which phone is the customer (not our Twilio number)
        const voiceNum = (process.env.TWILIO_VOICE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').replace('whatsapp:', '');
        let customerPhone = from;
        if (from === voiceNum) {
            customerPhone = to;
        }

        // If no speech detected, re-prompt
        if (!speechResult) {
            console.log('[Voice] No speech detected, re-prompting...');
            return res.send(buildGatherTwiml('Hello? Are you there? Please tell me when you can pay.', backendUrl));
        }

        // Find invoice for this phone number
        const last10 = customerPhone.replace(/[^0-9]/g, '').slice(-10);
        if (!last10 || last10.length < 10) {
            console.log('[Voice] Invalid phone number, hanging up.');
            return res.send(buildHangupTwiml('Sorry, I could not identify your account. Goodbye.'));
        }

        const invoice = await Invoice.findOne({
            client_phone: { $regex: new RegExp(last10 + '$') },
            status: { $in: ['unpaid', 'overdue'] }
        });

        if (!invoice) {
            console.log(`[Voice] No active invoice for phone ...${last10}`);
            return res.send(buildHangupTwiml('Thank you. We have no pending dues for you. Goodbye.'));
        }

        console.log(`[Voice] Found invoice ${invoice.invoice_id} for ${invoice.client_name}`);

        // Classify intent (non-blocking — we don't await yet)
        const intentPromise = classifyIntent(speechResult).catch(() => 'UNKNOWN' as Intent);

        // Build AI response with conversation memory
        const invoiceId = invoice.invoice_id;
        appendToHistory(invoiceId, 'user', speechResult);
        const history = getHistory(invoiceId);

        const systemPrompt = `You are a Kirana shop owner in India calling your customer ${invoice.client_name} to collect a pending payment of rupees ${invoice.amount}. Be polite and friendly like a real Indian shopkeeper. Talk in short 1-2 sentences only. Do NOT use special characters, emojis, or the rupee symbol. If customer promises to pay, say something like "Thank you, please pay soon. Goodbye!" and add the word END_CALL at the very end. If they ask for more time, say "Okay, I will give you some more days. Please pay soon. Goodbye!" and add END_CALL. If they say the bill is wrong, say "I understand, I will check. Goodbye!" and add END_CALL. Today is ${new Date().toLocaleDateString('en-IN')}.`;

        let aiReply = '';
        try {
            const isOR = (process.env.OPENAI_API_KEY || '').startsWith('sk-or');
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY || 'dummy',
                ...(isOR ? { baseURL: 'https://openrouter.ai/api/v1' } : {})
            });

            const completion = await openai.chat.completions.create({
                model: isOR ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history
                ],
                max_tokens: 80,
                temperature: 0.6,
            });

            aiReply = completion.choices?.[0]?.message?.content || '';
        } catch (llmErr) {
            console.error('[Voice] LLM call failed:', llmErr);
            // Fallback: simple hardcoded response
            aiReply = `${invoice.client_name}, you have a pending payment of rupees ${invoice.amount}. When can you pay? END_CALL`;
        }

        if (!aiReply) {
            aiReply = 'I did not understand. Please pay your pending dues. Thank you. Goodbye. END_CALL';
        }

        // Save AI reply to memory
        appendToHistory(invoiceId, 'assistant', aiReply);

        // Check if AI wants to end the call
        const shouldEnd = aiReply.includes('END_CALL');
        aiReply = aiReply.replace(/END_CALL/g, '').trim();

        // Get intent result
        const intent = await intentPromise;
        console.log(`[Voice] ${invoice.client_name}: "${speechResult}" -> AI: "${aiReply}" | Intent: ${intent} | End: ${shouldEnd}`);

        // Log conversation
        invoice.reminder_history.push({
            timestamp: new Date(),
            channel: 'voice_call',
            message_content: `[Customer]: ${speechResult} | [Agent]: ${aiReply} | [Intent: ${intent}]`,
            delivery_status: 'delivered'
        });

        if (shouldEnd) {
            clearHistory(invoiceId);

            if (intent === 'PAYMENT_PROMISED') {
                invoice.status = 'promised';
                invoice.reminder_history.push({ timestamp: new Date(), channel: 'system', message_content: '[AUTO] Promised. WhatsApp UPI link sent. Scheduler paused.', delivery_status: 'delivered' });
                // Fire-and-forget WhatsApp follow-up
                sendWhatsAppFollowUp(invoice).catch(console.error);
            } else if (intent === 'DISPUTE') {
                invoice.status = 'disputed';
            } else if (intent === 'EXTENSION_REQUESTED') {
                const ext = new Date(); ext.setDate(ext.getDate() + 3);
                invoice.due_date = ext;
                invoice.reminder_level = Math.max(0, invoice.reminder_level - 1);
                invoice.reminder_history.push({ timestamp: new Date(), channel: 'system', message_content: `[AUTO] Extension granted. New due: ${ext.toDateString()}`, delivery_status: 'delivered' });
            }

            await invoice.save();
            return res.send(buildHangupTwiml(aiReply));
        }

        // Continue conversation
        await invoice.save();
        return res.send(buildGatherTwiml(aiReply, backendUrl));

    } catch (e) {
        console.error('[Voice] CRITICAL ERROR:', e);
        // ALWAYS return valid TwiML even on catastrophic failure
        return res.send(buildErrorTwiml());
    }
});

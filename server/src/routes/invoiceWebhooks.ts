import { Router, Request, Response } from 'express';
import { Invoice } from '../models/Invoice.js';
import { CustomerAccount } from '../models/CustomerAccount.js';
import { classifyIntent, classifyIntentAndPromise, Intent } from '../services/intentClassifier.js';
import { sendGenericMessage } from '../services/communicationService.js';
import { appendToHistory, getHistory, clearHistory } from '../services/conversationMemory.js';
import { Customer } from '../models/Customer.js';
import OpenAI from 'openai';
import { transcribeAudioWithDeepgram } from '../services/deepgram.js';

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
function buildGatherTwiml(text: string, backendUrl: string, callCount: number = 0): string {
    const safe = sanitizeForTwiml(text);
    const nextCount = callCount + 1;
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${backendUrl}/api/invoices/webhook/voice?CallCount=${nextCount}" method="POST" timeout="5" speechTimeout="auto" language="en-IN" enhanced="true" speechModel="phone_call"><Say voice="alice" language="en-IN">${safe}</Say></Gather><Say voice="alice" language="en-IN">I did not hear anything. Goodbye.</Say></Response>`;
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
async function sendWhatsAppFollowUp(invoice: any, promisedDate?: Date | null) {
    try {
        const upiUrl = `upi://pay?pa=kiranalink@oksbi&pn=KiranaLink&am=${invoice.amount}&cu=INR`;
        const promiseLine = promisedDate
            ? `Promise recorded for *${promisedDate.toLocaleDateString('en-IN')}*.`
            : 'Promise noted by our recovery assistant.';
        const message = `Hi ${invoice.client_name}! Thanks for talking with us.\n\n${promiseLine}\nPending amount: *Rs.${invoice.amount}*\n\nPay via UPI: ${upiUrl}\n\n- KiranaLink AI Agent`;
        const status = await sendGenericMessage(invoice.client_phone, message, 'whatsapp');
        if (status === 'delivered' || status === 'simulated_delivered') {
            console.log(`[Agent] WhatsApp follow-up sent to ${invoice.client_name} (${status})`);
        } else {
            console.warn(`[Agent] WhatsApp follow-up not delivered for ${invoice.client_name} (${status})`);
        }
    } catch (e) {
        console.error('[Agent] WhatsApp follow-up failed:', e);
    }
}

function fallbackRetryDate(hours = 4): Date {
    const retry = new Date();
    retry.setHours(retry.getHours() + hours);
    return retry;
}

async function syncCustomerRecoveryByPhone(phone: string, update: { nextCallDate?: number | null; recoveryStatus?: string; recoveryNotes?: string }) {
    const last10 = phone.replace(/[^0-9]/g, '').slice(-10);
    if (last10.length < 10) return;

    const customer = await Customer.findOne({
        phoneNumber: { $regex: new RegExp(`${last10}$`) }
    });

    if (!customer) return;

    const patch: Record<string, unknown> = {};
    if (typeof update.nextCallDate !== 'undefined') patch.nextCallDate = update.nextCallDate;
    if (typeof update.recoveryStatus !== 'undefined') patch.recoveryStatus = update.recoveryStatus;
    if (typeof update.recoveryNotes !== 'undefined') patch.recoveryNotes = update.recoveryNotes;

    await Customer.findByIdAndUpdate(customer._id, { $set: patch });
}

function pickCustomerPhoneFromCall(from: string, to: string): string {
    const voiceNum = (process.env.TWILIO_VOICE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').replace('whatsapp:', '');
    const normalize = (value: string) => value.replace(/[^0-9]/g, '').slice(-10);
    return normalize(from) === normalize(voiceNum) ? to : from;
}

async function findInvoiceByCallParties(from: string, to: string) {
    const customerPhone = pickCustomerPhoneFromCall(from, to);
    const last10 = customerPhone.replace(/[^0-9]/g, '').slice(-10);
    if (last10.length < 10) {
        return null;
    }

    const invoice = await Invoice.findOne({
        client_phone: { $regex: new RegExp(`${last10}$`) },
        status: { $in: ['unpaid', 'overdue', 'promised', 'disputed'] }
    });

    return invoice;
}

async function applyVoiceIntentOutcome(args: {
    invoice: any;
    transcript: string;
    intent: Intent;
    promisedDate: Date | null;
    confidence: number;
}) {
    const { invoice, transcript, intent, promisedDate, confidence } = args;

    invoice.last_intent = intent;
    invoice.ai_confidence = confidence;
    invoice.last_contacted_at = new Date();
    invoice.no_speech_count = 0;

    invoice.reminder_history.push({
        timestamp: new Date(),
        channel: 'voice_call',
        message_content: `[Deepgram]: ${transcript} | [Intent: ${intent}] | [Conf: ${confidence.toFixed(2)}]${promisedDate ? ` | [Date: ${promisedDate.toISOString()}]` : ''}`,
        delivery_status: 'delivered'
    });

    if (intent === 'PAYMENT_PROMISED') {
        const promiseDate = promisedDate || new Date(Date.now() + (24 * 60 * 60 * 1000));
        invoice.status = 'promised';
        invoice.promised_date = promiseDate;
        invoice.due_date = promiseDate;
        invoice.next_retry_at = promiseDate;
        invoice.reminder_history.push({
            timestamp: new Date(),
            channel: 'system',
            message_content: `[AUTO] Promise captured via voice. Follow-up on ${promiseDate.toDateString()}.`,
            delivery_status: 'delivered'
        });
        await syncCustomerRecoveryByPhone(invoice.client_phone, {
            nextCallDate: promiseDate.getTime(),
            recoveryStatus: 'Promised',
            recoveryNotes: `Promise captured by voice agent (${promiseDate.toDateString()}).`
        });
        await sendWhatsAppFollowUp(invoice, promiseDate);
        await invoice.save();
        return 'Thank you. We have noted your promise. We will send a reminder on your promised date. Goodbye.';
    }

    if (intent === 'EXTENSION_REQUESTED') {
        const extDate = promisedDate || new Date(Date.now() + (24 * 60 * 60 * 1000));
        invoice.status = 'promised';
        invoice.promised_date = extDate;
        invoice.due_date = extDate;
        invoice.next_retry_at = extDate;
        invoice.reminder_level = Math.max(0, invoice.reminder_level - 1);
        invoice.reminder_history.push({
            timestamp: new Date(),
            channel: 'system',
            message_content: `[AUTO] Extension accepted via voice. New due: ${extDate.toDateString()}`,
            delivery_status: 'delivered'
        });
        await syncCustomerRecoveryByPhone(invoice.client_phone, {
            nextCallDate: extDate.getTime(),
            recoveryStatus: 'Promised',
            recoveryNotes: `Extension accepted by voice agent. Follow-up on ${extDate.toDateString()}.`
        });
        await invoice.save();
        return 'Okay, we have given you extension and updated your due date. Please pay by the promised date. Goodbye.';
    }

    if (intent === 'DISPUTE') {
        invoice.status = 'disputed';
        invoice.next_retry_at = null;
        await syncCustomerRecoveryByPhone(invoice.client_phone, {
            nextCallDate: null,
            recoveryStatus: 'Failed',
            recoveryNotes: 'Customer raised dispute on voice call. Manual review required.'
        });
        await invoice.save();
        return 'Understood. We have marked this as dispute and the shopkeeper will review it. Goodbye.';
    }

    const retryDate = fallbackRetryDate(24);
    invoice.next_retry_at = retryDate;
    await syncCustomerRecoveryByPhone(invoice.client_phone, {
        nextCallDate: retryDate.getTime(),
        recoveryStatus: 'Call Again',
        recoveryNotes: 'Voice response unclear. Auto retry in 1 day.'
    });
    await invoice.save();
    return 'We could not clearly capture your payment commitment. We will follow up again tomorrow. Goodbye.';
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

invoiceWebhooksRouter.post('/voice-recording', async (req: Request, res: Response) => {
    res.type('text/xml');

    try {
        const from = String(req.body?.From || '');
        const to = String(req.body?.To || '');
        const recordingUrlRaw = String(req.body?.RecordingUrl || '');
        const recordingSid = String(req.body?.RecordingSid || '');
        console.log(`[Voice Recording] From=${from} To=${to} RecordingUrl=${recordingUrlRaw ? 'yes' : 'no'}`);

        const invoice = await findInvoiceByCallParties(from, to);
        if (!invoice) {
            console.warn('[Voice Recording] No active invoice found for call parties');
            return res.send(buildHangupTwiml('No active due account found. Goodbye.'));
        }
        console.log(`[Voice Recording] Matched invoice ${invoice.invoice_id} for ${invoice.client_phone}`);

        if (recordingSid) {
            const sidMarker = `[RECORDING_SID:${recordingSid}]`;
            const duplicate = invoice.reminder_history.some((entry: any) =>
                entry.channel === 'voice_call' && String(entry.message_content || '').includes(sidMarker)
            );
            if (duplicate) {
                console.log(`[Voice Recording] Duplicate callback ignored for ${recordingSid}`);
                return res.send(buildHangupTwiml('Thank you. Goodbye.'));
            }

            invoice.reminder_history.push({
                timestamp: new Date(),
                channel: 'voice_call',
                message_content: `${sidMarker} received`,
                delivery_status: 'received'
            });
            await invoice.save();
        }

        if (!recordingUrlRaw) {
            const retry = fallbackRetryDate(24);
            invoice.next_retry_at = retry;
            invoice.reminder_history.push({
                timestamp: new Date(),
                channel: 'voice_call',
                message_content: '[NO_RECORDING] Twilio did not provide a recording URL.',
                delivery_status: 'received'
            });
            await invoice.save();
            await syncCustomerRecoveryByPhone(invoice.client_phone, {
                nextCallDate: retry.getTime(),
                recoveryStatus: 'Call Again',
                recoveryNotes: 'No audio captured in call. Retry scheduled.'
            });
            return res.send(buildHangupTwiml('We could not capture your response. We will call you again later. Goodbye.'));
        }

        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            return res.send(buildHangupTwiml('System configuration issue. Please contact shopkeeper. Goodbye.'));
        }

        const recordingUrl = recordingUrlRaw.endsWith('.mp3') ? recordingUrlRaw : `${recordingUrlRaw}.mp3`;
        const twilioAuth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const recordingResponse = await fetch(recordingUrl, {
            headers: {
                Authorization: `Basic ${twilioAuth}`,
            }
        });

        if (!recordingResponse.ok) {
            const retry = fallbackRetryDate(24);
            invoice.next_retry_at = retry;
            invoice.reminder_history.push({
                timestamp: new Date(),
                channel: 'voice_call',
                message_content: `[RECORDING_FETCH_FAILED] ${recordingResponse.status}`,
                delivery_status: 'failed'
            });
            await invoice.save();
            await syncCustomerRecoveryByPhone(invoice.client_phone, {
                nextCallDate: retry.getTime(),
                recoveryStatus: 'Call Again',
                recoveryNotes: 'Recording fetch failed. Retry scheduled.'
            });
            return res.send(buildHangupTwiml('We could not process your response. We will call you again later. Goodbye.'));
        }

        const audioArrayBuffer = await recordingResponse.arrayBuffer();
        const transcript = await transcribeAudioWithDeepgram({
            audioBuffer: Buffer.from(audioArrayBuffer),
            mimeType: 'audio/mpeg',
            language: 'multi',
        });
        console.log(`[Voice Recording] Deepgram transcript: ${transcript || '[empty]'}`);

        if (!transcript) {
            const retry = fallbackRetryDate(24);
            invoice.next_retry_at = retry;
            invoice.reminder_history.push({
                timestamp: new Date(),
                channel: 'voice_call',
                message_content: '[TRANSCRIPTION_FAILED] Deepgram returned empty transcript.',
                delivery_status: 'failed'
            });
            await invoice.save();
            await syncCustomerRecoveryByPhone(invoice.client_phone, {
                nextCallDate: retry.getTime(),
                recoveryStatus: 'Call Again',
                recoveryNotes: 'Voice transcription failed. Retry scheduled.'
            });
            return res.send(buildHangupTwiml('We could not clearly understand your response. We will call again tomorrow. Goodbye.'));
        }

        const analysis = await classifyIntentAndPromise(transcript);
        const goodbyeText = await applyVoiceIntentOutcome({
            invoice,
            transcript,
            intent: analysis.intent,
            promisedDate: analysis.promisedDate,
            confidence: analysis.confidence,
        });

        return res.send(buildHangupTwiml(goodbyeText));
    } catch (error) {
        console.error('[Voice Recording] Error:', error);
        return res.send(buildErrorTwiml());
    }
});

invoiceWebhooksRouter.post('/voice', async (req: Request, res: Response) => {
    // ALWAYS set content type first — Twilio requires XML
    res.type('text/xml');

    const backendUrl = process.env.BACKEND_URL || '';
    const callCountHeader = String(req.query?.CallCount || req.body?.CallCount || '0');
    const callCount = parseInt(callCountHeader, 10) || 0;

    // Prevent infinite loops - max 3 back-and-forth exchanges
    const MAX_CALL_TURNS = 3;
    if (callCount >= MAX_CALL_TURNS) {
        console.log('[Voice] Max call turns reached, ending call');
        return res.send(buildHangupTwiml('Thank you for your time. We will follow up with you shortly. Goodbye.'));
    }

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

        // If no speech detected, re-prompt with retry cap
        if (!speechResult) {
            const last10 = ((from || to || '').replace(/[^0-9]/g, '')).slice(-10);
            const invoice = last10.length === 10
                ? await Invoice.findOne({ client_phone: { $regex: new RegExp(last10 + '$') }, status: { $in: ['unpaid', 'overdue', 'promised'] } })
                : null;

            // Check if we've tried too many times (either via callCount or no_speech_count)
            const totalAttempts = callCount + (invoice?.no_speech_count || 0);
            if (totalAttempts >= 3) {
                // Too many attempts - end the call
                if (invoice) {
                    const retry = fallbackRetryDate(24);
                    invoice.no_speech_count = 0;
                    invoice.next_retry_at = retry;
                    invoice.last_contacted_at = new Date();
                    invoice.reminder_history.push({
                        timestamp: new Date(),
                        channel: 'voice_call',
                        message_content: `[NO_SPEECH] Max retries reached. Scheduled retry.`,
                        delivery_status: 'received'
                    });
                    await invoice.save();
                    await syncCustomerRecoveryByPhone(invoice.client_phone, {
                        nextCallDate: retry.getTime(),
                        recoveryStatus: 'Call Again',
                        recoveryNotes: 'No speech detected after multiple attempts. Auto retry scheduled.'
                    });
                }
                return res.send(buildHangupTwiml('I could not hear your response. We will call you again later. Goodbye.'));
            }

            if (invoice) {
                invoice.no_speech_count = (invoice.no_speech_count || 0) + 1;
                invoice.last_contacted_at = new Date();
                invoice.next_retry_at = fallbackRetryDate(4);
                invoice.reminder_history.push({
                    timestamp: new Date(),
                    channel: 'voice_call',
                    message_content: `[NO_SPEECH] Attempt ${invoice.no_speech_count}`,
                    delivery_status: 'received'
                });
                await invoice.save();
            }

            console.log('[Voice] No speech detected, re-prompting...');
            return res.send(buildGatherTwiml('Hello, I could not hear you clearly. Please tell me when you can pay your pending amount.', backendUrl, callCount));
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

        const speechConfidence = Number.parseFloat(req.body?.Confidence || '0');
        const analysis = await classifyIntentAndPromise(speechResult);
        const intent: Intent = analysis.intent;
        const parsedDate = analysis.promisedDate;
        const finalConfidence = Math.max(analysis.confidence, Number.isNaN(speechConfidence) ? 0 : speechConfidence);

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
        const shouldEndByModel = aiReply.includes('END_CALL');
        aiReply = aiReply.replace(/END_CALL/g, '').trim();

        const shouldEnd = shouldEndByModel || intent !== 'UNKNOWN' || finalConfidence < 0.4;
        console.log(`[Voice] ${invoice.client_name}: "${speechResult}" -> AI: "${aiReply}" | Intent: ${intent} | Conf: ${finalConfidence.toFixed(2)} | End: ${shouldEnd}`);

        // Log conversation
        invoice.reminder_history.push({
            timestamp: new Date(),
            channel: 'voice_call',
            message_content: `[Customer]: ${speechResult} | [Agent]: ${aiReply} | [Intent: ${intent}] | [Conf: ${finalConfidence.toFixed(2)}]${parsedDate ? ` | [Date: ${parsedDate.toISOString()}]` : ''}`,
            delivery_status: 'delivered'
        });

        invoice.last_intent = intent;
        invoice.ai_confidence = finalConfidence;
        invoice.last_contacted_at = new Date();
        invoice.no_speech_count = 0;

        if (shouldEnd) {
            clearHistory(invoiceId);

            if (intent === 'PAYMENT_PROMISED') {
                const promisedDate = parsedDate || new Date(Date.now() + (24 * 60 * 60 * 1000));
                invoice.status = 'promised';
                invoice.promised_date = promisedDate;
                invoice.due_date = promisedDate;
                invoice.next_retry_at = promisedDate;
                invoice.reminder_history.push({ timestamp: new Date(), channel: 'system', message_content: `[AUTO] Promised. Next follow-up on ${promisedDate.toDateString()}.`, delivery_status: 'delivered' });
                // Fire-and-forget WhatsApp follow-up
                sendWhatsAppFollowUp(invoice, promisedDate).catch(console.error);
                await syncCustomerRecoveryByPhone(invoice.client_phone, {
                    nextCallDate: promisedDate.getTime(),
                    recoveryStatus: 'Promised',
                    recoveryNotes: `Promise captured from live call (${promisedDate.toDateString()}).`
                });
            } else if (intent === 'DISPUTE') {
                invoice.status = 'disputed';
                invoice.next_retry_at = null;
                await syncCustomerRecoveryByPhone(invoice.client_phone, {
                    nextCallDate: null,
                    recoveryStatus: 'Failed',
                    recoveryNotes: 'Customer raised dispute. Requires manual review.'
                });
            } else if (intent === 'EXTENSION_REQUESTED') {
                const ext = parsedDate || new Date(Date.now() + (24 * 60 * 60 * 1000));
                invoice.due_date = ext;
                invoice.promised_date = ext;
                invoice.next_retry_at = ext;
                invoice.reminder_level = Math.max(0, invoice.reminder_level - 1);
                invoice.reminder_history.push({ timestamp: new Date(), channel: 'system', message_content: `[AUTO] Extension granted. New due: ${ext.toDateString()}`, delivery_status: 'delivered' });
                await syncCustomerRecoveryByPhone(invoice.client_phone, {
                    nextCallDate: ext.getTime(),
                    recoveryStatus: 'Promised',
                    recoveryNotes: `Extension accepted on call. Follow-up on ${ext.toDateString()}.`
                });
            } else {
                const retry = fallbackRetryDate(24);
                invoice.next_retry_at = retry;
                await syncCustomerRecoveryByPhone(invoice.client_phone, {
                    nextCallDate: retry.getTime(),
                    recoveryStatus: 'Call Again',
                    recoveryNotes: 'Low confidence or unclear response. Auto retry in 1 day.'
                });
            }

            await invoice.save();
            return res.send(buildHangupTwiml(aiReply));
        }

        // Continue conversation
        await invoice.save();
        return res.send(buildGatherTwiml(aiReply, backendUrl, callCount));

    } catch (e) {
        console.error('[Voice] CRITICAL ERROR:', e);
        // ALWAYS return valid TwiML even on catastrophic failure
        return res.send(buildErrorTwiml());
    }
});

invoiceWebhooksRouter.post('/voice-status', async (req: Request, res: Response) => {
    try {
        const callStatus = req.body?.CallStatus || 'unknown';
        const from = req.body?.From || '';
        const to = req.body?.To || '';
        const last10 = (from || to).replace(/[^0-9]/g, '').slice(-10);

        if (last10.length === 10) {
            const invoice = await Invoice.findOne({
                client_phone: { $regex: new RegExp(`${last10}$`) },
                status: { $in: ['unpaid', 'overdue', 'promised'] }
            });

            if (invoice) {
                invoice.reminder_history.push({
                    timestamp: new Date(),
                    channel: 'voice_status',
                    message_content: `[TWILIO] ${callStatus}`,
                    delivery_status: 'delivered'
                });

                if (['busy', 'failed', 'no-answer', 'canceled'].includes(callStatus)) {
                    const retry = fallbackRetryDate(6);
                    invoice.next_retry_at = retry;
                    await syncCustomerRecoveryByPhone(invoice.client_phone, {
                        nextCallDate: retry.getTime(),
                        recoveryStatus: 'Call Again',
                        recoveryNotes: `Call status ${callStatus}. Auto retry scheduled.`
                    });
                }

                await invoice.save();
            }
        }
    } catch (error) {
        console.error('[Voice Status] Error:', error);
    }

    res.status(200).json({ ok: true });
});

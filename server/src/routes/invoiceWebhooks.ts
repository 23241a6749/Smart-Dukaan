import { Router, Request, Response } from 'express';
import { Invoice } from '../models/Invoice.js';
import { CustomerAccount } from '../models/CustomerAccount.js';
import { classifyIntent, classifyIntentAndPromise, Intent } from '../services/intentClassifier.js';
import { sendGenericMessage } from '../services/communicationService.js';
import { appendToHistory, getHistory, clearHistory } from '../services/conversationMemory.js';
import { Customer } from '../models/Customer.js';
import { VoiceCallSession } from '../models/VoiceCallSession.js';
import OpenAI from 'openai';
import { transcribeAudioWithDeepgram } from '../services/deepgram.js';
import { detectLanguageFromTranscript, getDeepgramLanguage, normalizeLanguage, type VoiceLang } from '../services/voiceLanguage.js';
import { getVoicePrompt, formatDateForVoice } from '../services/voicePrompts.js';
import {
    buildErrorTwimlLocalized,
    buildGatherTwimlLocalized,
    buildHangupTwimlLocalized,
    buildRecordFollowupTwimlLocalized,
} from '../services/voiceTwiML.js';

export const invoiceWebhooksRouter = Router();

// ─── HELPERS ───────────────────────────────────────────────────────────────

function getSessionLanguage(session?: any, fallback: VoiceLang = 'en'): VoiceLang {
    return normalizeLanguage(session?.detectedLanguage || fallback);
}

function buildGatherTwiml(text: string, backendUrl: string, callCount = 0, lang: VoiceLang = 'en'): string {
    return buildGatherTwimlLocalized({
        text,
        backendUrl,
        callCount,
        lang,
        withDtmfFallback: false,
    });
}

function buildHangupTwiml(text: string, lang: VoiceLang = 'en'): string {
    return buildHangupTwimlLocalized(text, lang);
}

function buildErrorTwiml(lang: VoiceLang = 'en'): string {
    return buildErrorTwimlLocalized(lang);
}

// Post-call WhatsApp follow-up with UPI payment link
async function sendWhatsAppFollowUp(invoice: any, promisedDate?: Date | null, lang: VoiceLang = 'en') {
    try {
        const upiUrl = `upi://pay?pa=sdukaan@oksbi&pn=SDukaan&am=${invoice.amount}&cu=INR`;
        const dateText = promisedDate ? formatDateForVoice(promisedDate, lang) : '';
        const message = lang === 'hi'
            ? `Namaste ${invoice.client_name}! Dhanyavaad.\n\n${promisedDate ? `Aapki promise date *${dateText}* note kar li gayi hai.` : 'Aapka payment commitment note kar liya gaya hai.'}\nPending amount: *Rs.${invoice.amount}*\n\nUPI se pay karein: ${upiUrl}\n\n- SDukaan AI Agent`
            : lang === 'te'
                ? `Namaskaram ${invoice.client_name}! Dhanyavadalu.\n\n${promisedDate ? `Mee promise date *${dateText}* note chesam.` : 'Mee payment commitment note chesam.'}\nPending amount: *Rs.${invoice.amount}*\n\nUPI link: ${upiUrl}\n\n- SDukaan AI Agent`
                : `Hi ${invoice.client_name}! Thanks for talking with us.\n\n${promisedDate ? `Promise recorded for *${dateText}*.` : 'Promise noted by our recovery assistant.'}\nPending amount: *Rs.${invoice.amount}*\n\nPay via UPI: ${upiUrl}\n\n- SDukaan AI Agent`;
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

async function sendWhatsAppSettlementFollowUp(args: {
    invoice: any;
    partialAmountNow: number;
    remainingAmount: number;
    promisedDate: Date | null;
    lang?: VoiceLang;
}) {
    const { invoice, partialAmountNow, remainingAmount, promisedDate, lang = 'en' } = args;

    try {
        const dueDateText = promisedDate ? formatDateForVoice(promisedDate, lang) : (lang === 'hi' ? 'promise date' : lang === 'te' ? 'promise date' : 'the promised date');
        const immediateAmount = Math.max(0, Math.round(partialAmountNow));
        const upiAmount = immediateAmount > 0 ? immediateAmount : Math.round(invoice.amount);
        const upiUrl = `upi://pay?pa=sdukaan@oksbi&pn=SDukaan&am=${upiAmount}&cu=INR`;

        const summary = immediateAmount > 0
            ? (lang === 'hi'
                ? `Plan confirm: *Rs.${immediateAmount} abhi* aur *Rs.${remainingAmount}* *${dueDateText}* tak.`
                : lang === 'te'
                    ? `Plan confirm: *Rs.${immediateAmount} ippude* mariyu *Rs.${remainingAmount}* *${dueDateText}* ki.`
                    : `Plan confirmed: pay *Rs.${immediateAmount} now* and *Rs.${remainingAmount}* by *${dueDateText}*.`)
            : (lang === 'hi'
                ? `Plan confirm: poora amount *Rs.${remainingAmount}* *${dueDateText}* tak.`
                : lang === 'te'
                    ? `Plan confirm: full amount *Rs.${remainingAmount}* *${dueDateText}* ki.`
                    : `Plan confirmed: pay full amount *Rs.${remainingAmount}* by *${dueDateText}*.`);

        const message = lang === 'hi'
            ? `Namaste ${invoice.client_name},\n\n${summary}\n\nUPI link se pay karein:\n${upiUrl}\n\n- SDukaan Recovery Agent`
            : lang === 'te'
                ? `Namaskaram ${invoice.client_name},\n\n${summary}\n\nUPI link dwara pay cheyyandi:\n${upiUrl}\n\n- SDukaan Recovery Agent`
                : `Hi ${invoice.client_name},\n\n${summary}\n\nPay now using this UPI link:\n${upiUrl}\n\n- SDukaan Recovery Agent`;
        const status = await sendGenericMessage(invoice.client_phone, message, 'whatsapp');

        if (status === 'delivered' || status === 'simulated_delivered') {
            console.log(`[Agent] Settlement follow-up sent to ${invoice.client_name} (${status})`);
        } else {
            console.warn(`[Agent] Settlement follow-up not delivered for ${invoice.client_name} (${status})`);
        }
    } catch (error) {
        console.error('[Agent] Settlement follow-up failed:', error);
    }
}

function buildRecordFollowupTwiml(text: string, backendUrl: string, lang: VoiceLang = 'en'): string {
    return buildRecordFollowupTwimlLocalized({ text, backendUrl, lang });
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

async function syncCustomerVoiceLanguageByPhone(phone: string, lang: VoiceLang, confidence: number) {
    const last10 = phone.replace(/[^0-9]/g, '').slice(-10);
    if (last10.length < 10) return;
    await Customer.findOneAndUpdate(
        { phoneNumber: { $regex: new RegExp(`${last10}$`) } },
        {
            $set: {
                preferredVoiceLanguage: lang,
                voiceLanguageUpdatedAt: new Date(),
            }
        }
    );
    if (confidence >= 0.75) {
        await Customer.findOneAndUpdate(
            { phoneNumber: { $regex: new RegExp(`${last10}$`) } },
            { $set: { preferredLanguage: lang } }
        );
    }
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

type NegotiationIntent = Intent | 'PARTIAL_PAYMENT' | 'REFUSAL';

type NegotiationExtraction = {
    intent: NegotiationIntent;
    confidence: number;
    promisedDateISO: string | null;
    partialAmountNow: number | null;
    wantsPartialPlan: boolean | null;
    customerConfirmed: boolean;
    nextBestQuestion: string;
};

function clampCurrency(value: number, maxAmount: number): number {
    const rounded = Math.round(value);
    if (!Number.isFinite(rounded)) return 0;
    if (rounded < 0) return 0;
    if (rounded > maxAmount) return maxAmount;
    return rounded;
}

function parsePromisedDateFromISO(iso: string | null): Date | null {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function detectAffirmative(text: string): boolean {
    return /(yes|haan|ha|okay|ok|sure|done|confirm|correct)/i.test(text);
}

function detectNegative(text: string): boolean {
    return /(no|nahi|cannot|cant|not possible|impossible)/i.test(text);
}

function detectImmediateFullPayment(text: string): boolean {
    return /(full payment|pay full|pay all|entire amount|complete amount|settle now|pay now|today itself|right now|aaj hi|abhi pay|abhi de dunga|abhi de dungi)/i.test(text);
}

function parseAmountFallback(text: string, maxAmount: number): number | null {
    const amountMatch = text.match(/(?:rs\.?|rupees?)?\s*(\d{2,6})/i);
    if (!amountMatch || !amountMatch[1]) return null;
    const amount = Number.parseInt(amountMatch[1], 10);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return clampCurrency(amount, maxAmount);
}

async function extractNegotiationTurn(args: {
    invoiceAmount: number;
    stage: string;
    transcript: string;
    existingPartialAmount: number;
    existingPromisedDate: Date | null;
    language: VoiceLang;
}): Promise<NegotiationExtraction> {
    const { invoiceAmount, stage, transcript, existingPartialAmount, existingPromisedDate, language } = args;

    const fallbackIntentAnalysis = await classifyIntentAndPromise(transcript);
    const fallbackAmount = parseAmountFallback(transcript, invoiceAmount);
    const fallback: NegotiationExtraction = {
        intent: fallbackAmount && fallbackAmount > 0 ? 'PARTIAL_PAYMENT' : fallbackIntentAnalysis.intent,
        confidence: fallbackIntentAnalysis.confidence,
        promisedDateISO: fallbackIntentAnalysis.promisedDate ? fallbackIntentAnalysis.promisedDate.toISOString() : existingPromisedDate?.toISOString() || null,
        partialAmountNow: fallbackAmount,
        wantsPartialPlan: detectAffirmative(transcript) ? true : detectNegative(transcript) ? false : null,
        customerConfirmed: detectAffirmative(transcript),
        nextBestQuestion: 'Could you confirm how much you can pay now and by which date you will pay the rest?',
    };

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy_key_for_build') {
        return fallback;
    }

    try {
        const isOR = (process.env.OPENAI_API_KEY || '').startsWith('sk-or');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            ...(isOR ? { baseURL: 'https://openrouter.ai/api/v1' } : {})
        });

        const systemPrompt = `You are a strict extraction engine for debt recovery voice negotiation.
Return ONLY JSON with keys:
intent, confidence, promisedDateISO, partialAmountNow, wantsPartialPlan, customerConfirmed, nextBestQuestion.

intent must be one of: PAYMENT_PROMISED, EXTENSION_REQUESTED, DISPUTE, PARTIAL_PAYMENT, REFUSAL, UNKNOWN.
Use PARTIAL_PAYMENT when customer states an immediate amount.
If customer agrees to pay something now but no amount, set wantsPartialPlan=true and partialAmountNow=null.
Set customerConfirmed=true only when customer clearly confirms previous plan.
Keep nextBestQuestion short and practical for Smart Dukaan collection calls.`;

        const userPrompt = JSON.stringify({
            stage,
            transcript,
            language,
            invoiceAmount,
            existingPartialAmount,
            existingPromisedDate: existingPromisedDate?.toISOString() || null,
        });

        const response = await openai.chat.completions.create({
            model: isOR ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
            temperature: 0.1,
            max_tokens: 180,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        });

        const raw = response.choices[0]?.message?.content?.trim() || '{}';
        const parsed = JSON.parse(raw) as Partial<NegotiationExtraction>;

        const allowedIntents: NegotiationIntent[] = ['PAYMENT_PROMISED', 'EXTENSION_REQUESTED', 'DISPUTE', 'PARTIAL_PAYMENT', 'REFUSAL', 'UNKNOWN'];
        const intent = parsed.intent && allowedIntents.includes(parsed.intent as NegotiationIntent)
            ? parsed.intent as NegotiationIntent
            : fallback.intent;
        const confidence = typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(1, parsed.confidence))
            : fallback.confidence;
        const partialAmountNow = typeof parsed.partialAmountNow === 'number'
            ? clampCurrency(parsed.partialAmountNow, invoiceAmount)
            : fallback.partialAmountNow;

        return {
            intent,
            confidence,
            promisedDateISO: typeof parsed.promisedDateISO === 'string' ? parsed.promisedDateISO : fallback.promisedDateISO,
            partialAmountNow,
            wantsPartialPlan: typeof parsed.wantsPartialPlan === 'boolean' ? parsed.wantsPartialPlan : fallback.wantsPartialPlan,
            customerConfirmed: typeof parsed.customerConfirmed === 'boolean' ? parsed.customerConfirmed : fallback.customerConfirmed,
            nextBestQuestion: typeof parsed.nextBestQuestion === 'string' && parsed.nextBestQuestion.trim().length > 0
                ? parsed.nextBestQuestion.trim()
                : fallback.nextBestQuestion,
        };
    } catch (error) {
        console.error('[Voice Recording] Negotiation extraction fallback:', error);
        return fallback;
    }
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
        await sendWhatsAppFollowUp(invoice, promiseDate, 'en');
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

function computeMinimumPartial(invoiceAmount: number): number {
    return Math.min(invoiceAmount, Math.max(100, Math.round(invoiceAmount * 0.1)));
}

function formatDateForSpeech(date: Date, lang: VoiceLang = 'en'): string {
    return formatDateForVoice(date, lang);
}

async function getOrCreateVoiceSession(callSid: string, invoice: any): Promise<any> {
    const existing = await VoiceCallSession.findOne({ callSid });
    if (existing) return existing;

    const last10 = String(invoice.client_phone || '').replace(/[^0-9]/g, '').slice(-10);
    const customer = last10.length === 10
        ? await Customer.findOne({ phoneNumber: { $regex: new RegExp(`${last10}$`) } })
        : null;
    const initialLang = normalizeLanguage(customer?.preferredVoiceLanguage || customer?.preferredLanguage || 'en');

    const session = new VoiceCallSession({
        callSid,
        invoiceId: invoice.invoice_id,
        customerPhone: invoice.client_phone,
        stage: 'OPENING',
        status: 'active',
        turnCount: 0,
        maxTurns: 6,
        partialAmountNow: 0,
        remainingAmount: Math.max(0, Math.round(invoice.amount || 0)),
        detectedLanguage: initialLang,
        languageConfidence: customer ? 0.7 : 0,
        isCodeMixed: false,
        fallbackMode: 'none',
    });
    await session.save();
    return session;
}

async function finalizeNegotiationSession(args: {
    session: any;
    invoice: any;
    intent: NegotiationIntent;
    confidence: number;
    transcript: string;
    lang: VoiceLang;
}): Promise<string> {
    const { session, invoice, intent, confidence, transcript, lang } = args;

    const promisedDate = session.promisedDate ? new Date(session.promisedDate) : null;
    const partialAmountNow = clampCurrency(session.partialAmountNow || 0, Math.round(invoice.amount || 0));
    const remainingAmount = Math.max(0, Math.round(invoice.amount || 0) - partialAmountNow);

    session.stage = 'CLOSED';
    session.status = 'completed';
    session.outcomeIntent = intent;
    session.confidence = confidence;
    session.remainingAmount = remainingAmount;
    session.finalSummary = promisedDate
        ? (partialAmountNow > 0
            ? `Customer committed Rs.${partialAmountNow} now and Rs.${remainingAmount} by ${formatDateForSpeech(promisedDate, lang)}`
            : `Customer committed full payment by ${formatDateForSpeech(promisedDate, lang)}`)
        : 'Negotiation incomplete. Promise date not captured.';
    await session.save();

    invoice.last_intent = intent;
    invoice.ai_confidence = confidence;
    invoice.last_contacted_at = new Date();
    invoice.no_speech_count = 0;
    invoice.reminder_history.push({
        timestamp: new Date(),
        channel: 'voice_call',
        message_content: `[Deepgram]: ${transcript} | [Intent: ${intent}] | [PartialNow: ${partialAmountNow}] | [Remaining: ${remainingAmount}]${promisedDate ? ` | [Date: ${promisedDate.toISOString()}]` : ''}`,
        delivery_status: 'delivered'
    });

    if (intent === 'DISPUTE') {
        invoice.status = 'disputed';
        invoice.next_retry_at = null;
        await syncCustomerRecoveryByPhone(invoice.client_phone, {
            nextCallDate: null,
            recoveryStatus: 'Failed',
            recoveryNotes: 'Customer raised dispute during multi-turn voice negotiation.'
        });
        await invoice.save();
        return getVoicePrompt(lang, 'closureDispute');
    }

    if (!promisedDate) {
        const retryDate = fallbackRetryDate(24);
        invoice.next_retry_at = retryDate;
        invoice.last_intent = 'UNKNOWN';
        invoice.reminder_history.push({
            timestamp: new Date(),
            channel: 'system',
            message_content: '[AUTO] Negotiation ended without valid promise date. Retry scheduled in 1 day.',
            delivery_status: 'delivered'
        });
        await invoice.save();
        await syncCustomerRecoveryByPhone(invoice.client_phone, {
            nextCallDate: retryDate.getTime(),
            recoveryStatus: 'Call Again',
            recoveryNotes: 'Call completed but no valid promise date captured. Retry in 1 day.'
        });
        return getVoicePrompt(lang, 'unableToUnderstand');
    }

    invoice.status = 'promised';
    invoice.promised_date = promisedDate;
    invoice.due_date = promisedDate;
    invoice.next_retry_at = promisedDate;
    invoice.reminder_history.push({
        timestamp: new Date(),
        channel: 'system',
        message_content: `[AUTO] Multi-turn plan captured. Partial now: ${partialAmountNow}, Remaining: ${remainingAmount}, Due: ${formatDateForSpeech(promisedDate, lang)}`,
        delivery_status: 'delivered'
    });
    await invoice.save();

    await syncCustomerRecoveryByPhone(invoice.client_phone, {
        nextCallDate: promisedDate.getTime(),
        recoveryStatus: 'Promised',
        recoveryNotes: partialAmountNow > 0
            ? `Voice plan: Rs.${partialAmountNow} now and Rs.${remainingAmount} by ${formatDateForSpeech(promisedDate, lang)}.`
            : `Voice plan: full payment by ${formatDateForSpeech(promisedDate, lang)}.`
    });

    await sendWhatsAppSettlementFollowUp({
        invoice,
        partialAmountNow,
        remainingAmount,
        promisedDate,
        lang,
    });

    if (partialAmountNow > 0) {
        return getVoicePrompt(lang, 'closurePartial', {
            partialAmount: partialAmountNow,
            remainingAmount,
            promisedDateText: formatDateForSpeech(promisedDate, lang),
        });
    }
    return getVoicePrompt(lang, 'closurePromised', {
        promisedDateText: formatDateForSpeech(promisedDate, lang),
    });
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
        const backendUrl = process.env.BACKEND_URL || '';
        if (!/^https?:\/\//.test(backendUrl)) {
            return res.send(buildHangupTwiml('Server callback configuration is incomplete. Please contact shopkeeper.', 'en'));
        }
        const from = String(req.body?.From || '');
        const to = String(req.body?.To || '');
        const recordingUrlRaw = String(req.body?.RecordingUrl || '');
        const recordingSid = String(req.body?.RecordingSid || '');
        const callSid = String(req.body?.CallSid || '');
        console.log(`[Voice Recording] From=${from} To=${to} RecordingUrl=${recordingUrlRaw ? 'yes' : 'no'}`);

        const invoice = await findInvoiceByCallParties(from, to);
        if (!invoice) {
            console.warn('[Voice Recording] No active invoice found for call parties');
            return res.send(buildHangupTwiml(getVoicePrompt('en', 'noInvoice'), 'en'));
        }
        console.log(`[Voice Recording] Matched invoice ${invoice.invoice_id} for ${invoice.client_phone}`);

        if (!callSid) {
            console.warn('[Voice Recording] Missing CallSid in webhook payload');
            return res.send(buildHangupTwiml(getVoicePrompt('en', 'recordingMissing'), 'en'));
        }

        const session = await getOrCreateVoiceSession(callSid, invoice);
        let activeLang = getSessionLanguage(session, 'en');

        if (recordingSid) {
            const sidMarker = `[RECORDING_SID:${recordingSid}]`;
            const duplicate = session.lastRecordingSid === recordingSid
                || session.transcriptTurns.some((turn: any) => String(turn.text || '').includes(sidMarker));
            if (duplicate) {
                console.log(`[Voice Recording] Duplicate callback ignored for ${recordingSid}`);
                return res.send(buildHangupTwiml('Thank you. Goodbye.', activeLang));
            }
            session.lastRecordingSid = recordingSid;
            session.transcriptTurns.push({ speaker: 'system', text: `${sidMarker} received` });
            await session.save();
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
            session.status = 'failed';
            session.stage = 'CLOSED';
            session.finalSummary = 'No recording received from Twilio.';
            await session.save();
            return res.send(buildHangupTwiml(getVoicePrompt(activeLang, 'recordingMissing'), activeLang));
        }

        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            return res.send(buildHangupTwiml('System configuration issue. Please contact shopkeeper. Goodbye.', activeLang));
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
            session.status = 'failed';
            session.stage = 'CLOSED';
            session.finalSummary = 'Recording fetch failed.';
            await session.save();
            return res.send(buildHangupTwiml(getVoicePrompt(activeLang, 'recordingFetchFailed'), activeLang));
        }

        const audioArrayBuffer = await recordingResponse.arrayBuffer();
        const transcript = await transcribeAudioWithDeepgram({
            audioBuffer: Buffer.from(audioArrayBuffer),
            mimeType: 'audio/mpeg',
            language: session.languageConfidence >= 0.6 ? getDeepgramLanguage(activeLang) : 'multi',
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
            session.status = 'failed';
            session.stage = 'CLOSED';
            session.finalSummary = 'Deepgram transcription failed.';
            await session.save();
            return res.send(buildHangupTwiml(getVoicePrompt(activeLang, 'transcriptionFailed'), activeLang));
        }

        const detected = await detectLanguageFromTranscript(transcript);
        const shouldSwitchLang = detected.confidence >= 0.6 || session.languageConfidence < 0.55;
        if (shouldSwitchLang) {
            const normalized = normalizeLanguage(detected.lang);
            session.detectedLanguage = normalized;
            session.languageConfidence = detected.confidence;
            session.isCodeMixed = detected.isCodeMixed;
            activeLang = normalized;
            await syncCustomerVoiceLanguageByPhone(invoice.client_phone, normalized, detected.confidence);
        }

        session.turnCount = (session.turnCount || 0) + 1;
        session.transcriptTurns.push({ speaker: 'customer', text: transcript });

        const extraction = await extractNegotiationTurn({
            invoiceAmount: Math.round(invoice.amount || 0),
            stage: session.stage,
            transcript,
            existingPartialAmount: session.partialAmountNow || 0,
            existingPromisedDate: session.promisedDate || null,
            language: activeLang,
        });

        session.outcomeIntent = extraction.intent;
        session.confidence = extraction.confidence;
        const extractedDate = parsePromisedDateFromISO(extraction.promisedDateISO);
        if (extractedDate) {
            session.promisedDate = extractedDate;
        }

        const minimumPartial = computeMinimumPartial(Math.round(invoice.amount || 0));
        if (typeof extraction.partialAmountNow === 'number' && extraction.partialAmountNow > 0) {
            session.partialAmountNow = clampCurrency(extraction.partialAmountNow, Math.round(invoice.amount || 0));
            session.remainingAmount = Math.max(0, Math.round(invoice.amount || 0) - session.partialAmountNow);
        }

        const immediateFull = extraction.intent === 'PAYMENT_PROMISED' && detectImmediateFullPayment(transcript);
        if (immediateFull) {
            session.partialAmountNow = Math.round(invoice.amount || 0);
            session.remainingAmount = 0;
            session.promisedDate = new Date();
            const finalText = await finalizeNegotiationSession({
                session,
                invoice,
                intent: 'PAYMENT_PROMISED',
                confidence: extraction.confidence,
                transcript,
                lang: activeLang,
            });
            return res.send(buildHangupTwiml(finalText, activeLang));
        }

        if (session.turnCount >= (session.maxTurns || 6)) {
            const finalIntent: NegotiationIntent = extraction.intent === 'DISPUTE'
                ? 'DISPUTE'
                : session.partialAmountNow > 0
                    ? 'PARTIAL_PAYMENT'
                    : 'EXTENSION_REQUESTED';
            const finalText = await finalizeNegotiationSession({
                session,
                invoice,
                intent: finalIntent,
                confidence: extraction.confidence,
                transcript,
                lang: activeLang,
            });
            return res.send(buildHangupTwiml(finalText, activeLang));
        }

        if (extraction.intent === 'DISPUTE') {
            const finalText = await finalizeNegotiationSession({
                session,
                invoice,
                intent: 'DISPUTE',
                confidence: extraction.confidence,
                transcript,
                lang: activeLang,
            });
            return res.send(buildHangupTwiml(finalText, activeLang));
        }

        if (session.stage === 'OPENING') {
            if (session.partialAmountNow > 0) {
                session.stage = session.promisedDate ? 'CONFIRM_PLAN' : 'ASK_REMAINING_DATE';
            } else {
                session.stage = 'ASK_PARTIAL_NOW';
            }
        } else if (session.stage === 'ASK_PARTIAL_NOW') {
            if (session.partialAmountNow > 0) {
                session.stage = session.promisedDate ? 'CONFIRM_PLAN' : 'ASK_REMAINING_DATE';
            } else if (extraction.wantsPartialPlan === true || detectAffirmative(transcript)) {
                session.stage = 'ASK_PARTIAL_AMOUNT';
            } else if (extraction.wantsPartialPlan === false || detectNegative(transcript) || extraction.intent === 'REFUSAL') {
                session.partialAmountNow = 0;
                session.remainingAmount = Math.round(invoice.amount || 0);
                session.stage = 'ASK_REMAINING_DATE';
            }
        } else if (session.stage === 'ASK_PARTIAL_AMOUNT') {
            if (session.partialAmountNow >= minimumPartial) {
                session.stage = session.promisedDate ? 'CONFIRM_PLAN' : 'ASK_REMAINING_DATE';
            }
        } else if (session.stage === 'ASK_REMAINING_DATE') {
            if (session.promisedDate) {
                session.stage = 'CONFIRM_PLAN';
            }
        } else if (session.stage === 'CONFIRM_PLAN') {
            if ((extraction.customerConfirmed || detectAffirmative(transcript) || extraction.intent === 'PAYMENT_PROMISED') && session.promisedDate) {
                const finalText = await finalizeNegotiationSession({
                    session,
                    invoice,
                    intent: session.partialAmountNow > 0 ? 'PARTIAL_PAYMENT' : 'PAYMENT_PROMISED',
                    confidence: extraction.confidence,
                    transcript,
                    lang: activeLang,
                });
                return res.send(buildHangupTwiml(finalText, activeLang));
            }
            if (!session.promisedDate) {
                session.stage = 'ASK_REMAINING_DATE';
            }
            if (detectNegative(transcript)) {
                session.stage = 'ASK_PARTIAL_AMOUNT';
            }
        }

        let nextPrompt = extraction.nextBestQuestion;
        if (session.stage === 'ASK_PARTIAL_NOW') {
            nextPrompt = getVoicePrompt(activeLang, 'askPartialNow', { minimumPartial });
        } else if (session.stage === 'ASK_PARTIAL_AMOUNT') {
            nextPrompt = getVoicePrompt(activeLang, 'askPartialAmount', { minimumPartial });
        } else if (session.stage === 'ASK_REMAINING_DATE') {
            nextPrompt = getVoicePrompt(activeLang, 'askRemainingDate', {
                remainingAmount: session.remainingAmount || Math.round(invoice.amount || 0)
            });
        } else if (session.stage === 'CONFIRM_PLAN') {
            const partialNow = session.partialAmountNow || 0;
            const remaining = Math.max(0, Math.round(invoice.amount || 0) - partialNow);
            if (!session.promisedDate) {
                nextPrompt = getVoicePrompt(activeLang, 'askDateExample', { remainingAmount: remaining });
            } else {
                const promised = new Date(session.promisedDate);
                nextPrompt = partialNow > 0
                    ? getVoicePrompt(activeLang, 'confirmPlanPartial', {
                        partialAmount: partialNow,
                        remainingAmount: remaining,
                        promisedDateText: formatDateForSpeech(promised, activeLang),
                    })
                    : getVoicePrompt(activeLang, 'confirmPlanFull', {
                        remainingAmount: remaining,
                        promisedDateText: formatDateForSpeech(promised, activeLang),
                    });
            }
        }

        if (extraction.confidence < 0.55 && session.turnCount >= 2) {
            session.fallbackMode = session.turnCount >= 3 ? 'manual_callback' : 'simple_prompt';
            if (session.fallbackMode === 'manual_callback') {
                const retry = fallbackRetryDate(8);
                invoice.next_retry_at = retry;
                invoice.reminder_history.push({
                    timestamp: new Date(),
                    channel: 'system',
                    message_content: `[AUTO] Low-confidence multilingual capture. Escalated to manual callback.`,
                    delivery_status: 'delivered'
                });
                await invoice.save();
                await syncCustomerRecoveryByPhone(invoice.client_phone, {
                    nextCallDate: retry.getTime(),
                    recoveryStatus: 'Call Again',
                    recoveryNotes: 'Low-confidence speech capture. Manual callback required.',
                });
                session.status = 'failed';
                session.stage = 'CLOSED';
                session.finalSummary = 'Low-confidence multi-language capture. Escalated to manual callback.';
                await session.save();
                return res.send(buildHangupTwiml(getVoicePrompt(activeLang, 'manualCallback'), activeLang));
            }
            nextPrompt = getVoicePrompt(activeLang, 'askDateExample', {
                remainingAmount: session.remainingAmount || Math.round(invoice.amount || 0),
            });
        }

        session.lastPrompt = nextPrompt;
        session.transcriptTurns.push({ speaker: 'agent', text: nextPrompt });
        await session.save();

        return res.send(buildRecordFollowupTwiml(nextPrompt, backendUrl, activeLang));
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
        return res.send(buildHangupTwiml('Thank you for your time. We will follow up with you shortly. Goodbye.', 'en'));
    }

    try {
        const speechResult = req.body?.SpeechResult || '';
        const dtmfDigits = String(req.body?.Digits || '');
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
            const customer = last10.length === 10
                ? await Customer.findOne({ phoneNumber: { $regex: new RegExp(`${last10}$`) } })
                : null;
            const retryLang = normalizeLanguage(customer?.preferredVoiceLanguage || customer?.preferredLanguage || 'en');

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
                return res.send(buildHangupTwiml(getVoicePrompt(retryLang, 'noSpeechFinal'), retryLang));
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
            return res.send(buildGatherTwiml(getVoicePrompt(retryLang, 'noSpeechRetry'), backendUrl, callCount, retryLang));
        }

        // Find invoice for this phone number
        const last10 = customerPhone.replace(/[^0-9]/g, '').slice(-10);
        if (!last10 || last10.length < 10) {
            console.log('[Voice] Invalid phone number, hanging up.');
            return res.send(buildHangupTwiml('Sorry, I could not identify your account. Goodbye.', 'en'));
        }

        const invoice = await Invoice.findOne({
            client_phone: { $regex: new RegExp(last10 + '$') },
            status: { $in: ['unpaid', 'overdue'] }
        });

        if (!invoice) {
            console.log(`[Voice] No active invoice for phone ...${last10}`);
            return res.send(buildHangupTwiml(getVoicePrompt('en', 'noInvoice'), 'en'));
        }

        const customer = await Customer.findOne({ phoneNumber: { $regex: new RegExp(`${last10}$`) } });
        let activeLang = normalizeLanguage(customer?.preferredVoiceLanguage || customer?.preferredLanguage || 'en');

        if (dtmfDigits) {
            if (dtmfDigits === '1') {
                invoice.status = 'promised';
                invoice.promised_date = new Date();
                invoice.next_retry_at = new Date();
                await invoice.save();
                return res.send(buildHangupTwiml(getVoicePrompt(activeLang, 'closurePromised', {
                    promisedDateText: formatDateForSpeech(new Date(), activeLang),
                }), activeLang));
            }
            if (dtmfDigits === '4') {
                invoice.status = 'disputed';
                invoice.next_retry_at = null;
                await invoice.save();
                return res.send(buildHangupTwiml(getVoicePrompt(activeLang, 'closureDispute'), activeLang));
            }
        }

        console.log(`[Voice] Found invoice ${invoice.invoice_id} for ${invoice.client_name}`);

        const speechConfidence = Number.parseFloat(req.body?.Confidence || '0');
        const langDetected = await detectLanguageFromTranscript(speechResult);
        if (langDetected.confidence >= 0.6) {
            activeLang = normalizeLanguage(langDetected.lang);
            await syncCustomerVoiceLanguageByPhone(invoice.client_phone, activeLang, langDetected.confidence);
        }
        const analysis = await classifyIntentAndPromise(speechResult);
        const intent: Intent = analysis.intent;
        const parsedDate = analysis.promisedDate;
        const finalConfidence = Math.max(analysis.confidence, Number.isNaN(speechConfidence) ? 0 : speechConfidence);

        // Build AI response with conversation memory
        const invoiceId = invoice.invoice_id;
        appendToHistory(invoiceId, 'user', speechResult);
        const history = getHistory(invoiceId);

        const systemPrompt = `You are a Smart Dukaan shop owner in India calling your customer ${invoice.client_name} to collect a pending payment of rupees ${invoice.amount}. Respond in language ${activeLang}. Be polite and friendly like a local shopkeeper. Keep response short in 1-2 sentences. If customer promises to pay, end with END_CALL. If they ask for more time, end with END_CALL. If they dispute, end with END_CALL. Today is ${new Date().toLocaleDateString('en-IN')}.`;

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
            aiReply = `${getVoicePrompt(activeLang, 'unableToUnderstand')} END_CALL`;
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
                sendWhatsAppFollowUp(invoice, promisedDate, activeLang).catch(console.error);
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
            return res.send(buildHangupTwiml(aiReply, activeLang));
        }

        // Continue conversation
        await invoice.save();
        return res.send(buildGatherTwiml(aiReply, backendUrl, callCount, activeLang));

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

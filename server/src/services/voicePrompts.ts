import { VoiceLang } from './voiceLanguage.js';

type PromptKey =
    | 'opening'
    | 'noSpeechRetry'
    | 'noSpeechFinal'
    | 'askPartialNow'
    | 'askPartialAmount'
    | 'askRemainingDate'
    | 'confirmPlanFull'
    | 'confirmPlanPartial'
    | 'askDateExample'
    | 'unableToUnderstand'
    | 'manualCallback'
    | 'systemError'
    | 'noInvoice'
    | 'recordingMissing'
    | 'recordingFetchFailed'
    | 'transcriptionFailed'
    | 'closurePromised'
    | 'closurePartial'
    | 'closureDispute';

function fmtAmount(amount: number): string {
    return `rupees ${Math.max(0, Math.round(amount))}`;
}

function fmtAmountTe(amount: number): string {
    const num = Math.max(0, Math.round(amount));
    return `${num} rupees`;
}

function fmtAmountHi(amount: number): string {
    const num = Math.max(0, Math.round(amount));
    return `${num} rupees`;
}

export function formatDateForVoice(date: Date, lang: VoiceLang): string {
    if (lang === 'hi') {
        return date.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (lang === 'te') {
        return date.toLocaleDateString('te-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PROMPTS: Record<VoiceLang, Record<PromptKey, (ctx?: Record<string, unknown>) => string>> = {
    en: {
        opening: () => 'Hello. This is Smart Dukkan calling. When can you pay your pending amount?',
        noSpeechRetry: () => 'We could not hear you. Please tell your payment plan after the beep.',
        noSpeechFinal: () => 'We could not hear your response. We will call again later. Goodbye.',
        askPartialNow: (ctx) => `Can you pay at least ${fmtAmount(Number(ctx?.minimumPartial || 0))} today?`,
        askPartialAmount: (ctx) => `How much can you pay now? Minimum is ${fmtAmount(Number(ctx?.minimumPartial || 0))}.`,
        askRemainingDate: (ctx) => `By when will you pay ${fmtAmount(Number(ctx?.remainingAmount || 0))}?`,
        confirmPlanFull: (ctx) => `Confirm: pay ${fmtAmount(Number(ctx?.remainingAmount || 0))} by ${String(ctx?.promisedDateText || '')}. Yes or no?`,
        confirmPlanPartial: (ctx) => `Confirm: pay ${fmtAmount(Number(ctx?.partialAmount || 0))} now, ${fmtAmount(Number(ctx?.remainingAmount || 0))} by ${String(ctx?.promisedDateText || '')}. Yes or no?`,
        askDateExample: (ctx) => `Tell the date to pay ${fmtAmount(Number(ctx?.remainingAmount || 0))}. Like tomorrow or in 3 days.`,
        unableToUnderstand: () => 'We could not understand. We will call again tomorrow. Goodbye.',
        manualCallback: () => 'Connecting you to the shopkeeper. Thank you.',
        systemError: () => 'Sorry, connection issue. We will call back. Goodbye.',
        noInvoice: () => 'No pending amount found. Goodbye.',
        recordingMissing: () => 'Could not capture response. We will call again later. Goodbye.',
        recordingFetchFailed: () => 'Could not process response. We will call again later. Goodbye.',
        transcriptionFailed: () => 'Could not understand. We will call again tomorrow. Goodbye.',
        closurePromised: (ctx) => `Thank you. Payment noted for ${String(ctx?.promisedDateText || 'promised date')}. Goodbye.`,
        closurePartial: (ctx) => `Thank you. Plan noted: ${fmtAmount(Number(ctx?.partialAmount || 0))} now, ${fmtAmount(Number(ctx?.remainingAmount || 0))} by ${String(ctx?.promisedDateText || '')}. Goodbye.`,
        closureDispute: () => 'Understood. Case marked for shopkeeper review. Thank you.',
    },
    hi: {
        opening: () => 'Namaste. Smart Dukkan se call aaya hai. Aapke baaki hai. Yeh baaki kab denge? Minimum mein iddaru rupees de sakte hain?',
        noSpeechRetry: () => 'Suna nahi. Kripya baat keejiye. Kitna dene honge?',
        noSpeechFinal: () => 'Suna nahi. Baad mein call karenge. Dhanyavaad.',
        askPartialNow: (ctx) => `Iddaru rupees de sakte hain? Minimum ${fmtAmountHi(Number(ctx?.minimumPartial || 0))} rupees.`,
        askPartialAmount: (ctx) => `Kitna de sakte hain? Minimum ${fmtAmountHi(Number(ctx?.minimumPartial || 0))} rupees.`,
        askRemainingDate: (ctx) => `${fmtAmountHi(Number(ctx?.remainingAmount || 0))} rupees kab denge?`,
        confirmPlanFull: (ctx) => `Confirm: ${fmtAmountHi(Number(ctx?.remainingAmount || 0))} rupees ${String(ctx?.promisedDateText || '')} tak. Thik hai?`,
        confirmPlanPartial: (ctx) => `Confirm: ${fmtAmountHi(Number(ctx?.partialAmount || 0))} rupees abhi, ${fmtAmountHi(Number(ctx?.remainingAmount || 0))} rupees ${String(ctx?.promisedDateText || '')} tak. Thik hai?`,
        askDateExample: (ctx) => `${fmtAmountHi(Number(ctx?.remainingAmount || 0))} rupees kab denge? Kal ya teen din mein?`,
        unableToUnderstand: () => 'Samajh nahi aaya. Kal call karenge. Dhanyavaad.',
        manualCallback: () => 'Case shopkeeper ko jaayega. Dhanyavaad.',
        systemError: () => 'Connection mein problem hai. Baad mein call karenge. Dhanyavaad.',
        noInvoice: () => 'Baaki nahi hai. Dhanyavaad.',
        recordingMissing: () => 'Recording nahi mila. Baad mein call karenge. Dhanyavaad.',
        recordingFetchFailed: () => 'Process fail hua. Baad mein call karenge. Dhanyavaad.',
        transcriptionFailed: () => 'Samajh nahi aaya. Baad mein call karenge. Dhanyavaad.',
        closurePromised: (ctx) => `Dhanyavaad. ${String(ctx?.promisedDateText || 'taareekh')} tak baaki note kiya.`,
        closurePartial: (ctx) => `Dhanyavaad. Plan: ${fmtAmountHi(Number(ctx?.partialAmount || 0))} abhi, ${fmtAmountHi(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} tak.`,
        closureDispute: () => 'Samajh gaya. Case manual review ke liye bheja. Dhanyavaad.',
    },
    te: {
        opening: () => 'Namaste. This is Smart Dukkan calling. You have a pending payment of rupees. When can you pay this amount?',
        noSpeechRetry: () => 'Sorry, I did not hear. Please tell me when you can pay the amount.',
        noSpeechFinal: () => 'We will call you later. Thank you.',
        askPartialNow: (ctx) => `Can you pay at least ${fmtAmountTe(Number(ctx?.minimumPartial || 0))} rupees today?`,
        askPartialAmount: (ctx) => `How much can you pay right now? Minimum is ${fmtAmountTe(Number(ctx?.minimumPartial || 0))} rupees.`,
        askRemainingDate: (ctx) => `When will you pay the remaining ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees?`,
        confirmPlanFull: (ctx) => `So you will pay ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees by ${String(ctx?.promisedDateText || 'this date')}. Is that correct?`,
        confirmPlanPartial: (ctx) => `So you will pay ${fmtAmountTe(Number(ctx?.partialAmount || 0))} rupees now, and ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees by ${String(ctx?.promisedDateText || 'this date')}. Is that correct?`,
        askDateExample: (ctx) => `When can you pay the ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees? Like tomorrow or in three days?`,
        unableToUnderstand: () => 'I did not understand. We will call you again later. Thank you.',
        manualCallback: () => 'We will connect you to the shopkeeper. Please hold on.',
        systemError: () => 'There is a connection problem. We will call you later.',
        noInvoice: () => 'You have no pending payment. Thank you.',
        recordingMissing: () => 'Could not record your response. We will call again.',
        recordingFetchFailed: () => 'Could not process your response. We will call again.',
        transcriptionFailed: () => 'Could not understand your response. We will call again.',
        closurePromised: (ctx) => `Thank you. We have noted your payment promise for ${String(ctx?.promisedDateText || 'this date')}.`,
        closurePartial: (ctx) => `Thank you. You will pay ${fmtAmountTe(Number(ctx?.partialAmount || 0))} rupees now, and ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees by ${String(ctx?.promisedDateText || 'this date')}.`,
        closureDispute: () => 'Understood. We will review your case. Thank you.',
    },
    ta: {} as Record<PromptKey, (ctx?: Record<string, unknown>) => string>,
    mr: {} as Record<PromptKey, (ctx?: Record<string, unknown>) => string>,
    bn: {} as Record<PromptKey, (ctx?: Record<string, unknown>) => string>,
    ur: {} as Record<PromptKey, (ctx?: Record<string, unknown>) => string>,
    mixed: {} as Record<PromptKey, (ctx?: Record<string, unknown>) => string>,
};

for (const fallbackLang of ['ta', 'mr', 'bn', 'ur', 'mixed'] as VoiceLang[]) {
    PROMPTS[fallbackLang] = PROMPTS.en;
}

export function getVoicePrompt(lang: VoiceLang, key: PromptKey, context?: Record<string, unknown>): string {
    const table = PROMPTS[lang] || PROMPTS.en;
    const fn = table[key] || PROMPTS.en[key];
    return fn(context);
}

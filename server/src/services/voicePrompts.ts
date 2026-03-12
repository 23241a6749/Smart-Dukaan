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
        opening: () => 'Namaste. Smart Dukkan nundi call vachindi. Mariyu mee baaki undi. Ee baaki etlaandi? Mee paata entha amount undho cheppandi. Kaani minimum ga iddaru rupees isthara?',
        noSpeechRetry: () => 'Maata kanabadaledu. Mee baaki enti cheppandi. Iddaru rupees minimum ga isthara?',
        noSpeechFinal: () => 'Maata kanabadaledu. Kshamachey. Tarwatha call chesthamu. Sugam.',
        askPartialNow: (ctx) => `Iddaru rupees isthara? Iddaru minimum undi. Kanimiki ${fmtAmountTe(Number(ctx?.minimumPartial || 0))} rupees isthara?`,
        askPartialAmount: (ctx) => `Ipudu enta isthari? Kanimiki ${fmtAmountTe(Number(ctx?.minimumPartial || 0))} rupees minimum. Ee amount cheppandi.`,
        askRemainingDate: (ctx) => `${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees ela istharu? Eppa? Neeokati?`,
        confirmPlanFull: (ctx) => `Confirm: ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees ${String(ctx?.promisedDateText || '')} ki. Accha?`,
        confirmPlanPartial: (ctx) => `Confirm: ${fmtAmountTe(Number(ctx?.partialAmount || 0))} rupees ipudu, ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees ${String(ctx?.promisedDateText || '')} ki. Accha?`,
        askDateExample: (ctx) => `${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees eppudu isthari? Neeokati leda 3 roju lo.`,
        unableToUnderstand: () => 'Artham kaadu. Repu malli call chesthamu. Sugam.',
        manualCallback: () => 'Case shopkeeper ki royindhi. Dhanyavaadalu.',
        systemError: () => 'Connection lo problem undi. Malli call chesthamu. Sugam.',
        noInvoice: () => 'Baaki ledu. Sugam.',
        recordingMissing: () => 'Javaabu recording kanabadaledu. Malli call chesthamu. Sugam.',
        recordingFetchFailed: () => 'Javaabu process ayipoyindi. Malli call chesthamu. Sugam.',
        transcriptionFailed: () => 'Maata artham kanabadaledu. Repu malli call chesthamu. Sugam.',
        closurePromised: (ctx) => `Dhanyavaadalu. ${String(ctx?.promisedDateText || 'tedi')} ki baaki nundi chesam. Sugam.`,
        closurePartial: (ctx) => `Dhanyavaadalu. ${fmtAmountTe(Number(ctx?.partialAmount || 0))} rupees ipudu, ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} rupees ${String(ctx?.promisedDateText || '')} ki. Sugam.`,
        closureDispute: () => 'Artham. Case manual review ki pampam. Dhanyavaadalu.',
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

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
        opening: () => 'Hello, this is Smart Dukkan. Please tell us when you can clear your pending amount.',
        noSpeechRetry: () => 'Hello, we could not hear you clearly. Please tell us your payment plan after the beep.',
        noSpeechFinal: () => 'We could not hear your response. We will call you again later. Goodbye.',
        askPartialNow: (ctx) => `Can you pay at least ${fmtAmount(Number(ctx?.minimumPartial || 0))} today and pay the rest by a promised date?`,
        askPartialAmount: (ctx) => `Please tell the exact amount you can pay now. Minimum suggested is ${fmtAmount(Number(ctx?.minimumPartial || 0))}.`,
        askRemainingDate: (ctx) => `By which date will you pay the remaining amount of ${fmtAmount(Number(ctx?.remainingAmount || 0))}?`,
        confirmPlanFull: (ctx) => `Please confirm: you will pay ${fmtAmount(Number(ctx?.remainingAmount || 0))} by ${String(ctx?.promisedDateText || '')}. Is this correct?`,
        confirmPlanPartial: (ctx) => `Please confirm: you will pay ${fmtAmount(Number(ctx?.partialAmount || 0))} now and ${fmtAmount(Number(ctx?.remainingAmount || 0))} by ${String(ctx?.promisedDateText || '')}. Is this correct?`,
        askDateExample: (ctx) => `Please tell the exact date for paying ${fmtAmount(Number(ctx?.remainingAmount || 0))}. For example tomorrow or after 3 days.`,
        unableToUnderstand: () => 'We could not clearly understand your response. We will call you again tomorrow. Goodbye.',
        manualCallback: () => 'We are connecting your case for manual follow up by the shopkeeper. Thank you.',
        systemError: () => 'Sorry, there was a connection issue. We will call you back. Goodbye.',
        noInvoice: () => 'No active due account found. Goodbye.',
        recordingMissing: () => 'We could not capture your response. We will call you again later. Goodbye.',
        recordingFetchFailed: () => 'We could not process your response. We will call you again later. Goodbye.',
        transcriptionFailed: () => 'We could not clearly understand your response. We will call again tomorrow. Goodbye.',
        closurePromised: (ctx) => `Thank you. We noted your payment commitment for ${String(ctx?.promisedDateText || 'the promised date')}. Goodbye.`,
        closurePartial: (ctx) => `Thank you. We noted your plan: ${fmtAmount(Number(ctx?.partialAmount || 0))} now and ${fmtAmount(Number(ctx?.remainingAmount || 0))} by ${String(ctx?.promisedDateText || '')}. Goodbye.`,
        closureDispute: () => 'Understood. We marked this case for manual review by the shopkeeper. Thank you.',
    },
    hi: {
        opening: () => 'Namaste, Smart Dukkan se bol rahe hain. Kripya batayen aap baki payment kab karenge.',
        noSpeechRetry: () => 'Aapki awaaz clear nahi aayi. Kripya beep ke baad apna payment plan batayen.',
        noSpeechFinal: () => 'Hum aapki awaaz nahi sun paaye. Hum baad mein dobara call karenge. Dhanyavaad.',
        askPartialNow: (ctx) => `Kya aap aaj kam se kam ${fmtAmount(Number(ctx?.minimumPartial || 0))} de sakte hain aur baaki tareekh se de denge?`,
        askPartialAmount: (ctx) => `Kripya abhi dene wali exact amount batayen. Minimum ${fmtAmount(Number(ctx?.minimumPartial || 0))} suggest hai.`,
        askRemainingDate: (ctx) => `Baaki ${fmtAmount(Number(ctx?.remainingAmount || 0))} aap kis tareekh tak denge?`,
        confirmPlanFull: (ctx) => `Kripya confirm karein: aap ${fmtAmount(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} tak de denge. Kya yeh sahi hai?`,
        confirmPlanPartial: (ctx) => `Kripya confirm karein: aap ${fmtAmount(Number(ctx?.partialAmount || 0))} abhi aur ${fmtAmount(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} tak denge. Kya yeh sahi hai?`,
        askDateExample: (ctx) => `Kripya exact tareekh batayen jab aap ${fmtAmount(Number(ctx?.remainingAmount || 0))} denge. Jaise kal ya 3 din baad.`,
        unableToUnderstand: () => 'Hum aapki baat clear samajh nahi paaye. Hum kal dobara call karenge. Dhanyavaad.',
        manualCallback: () => 'Aapka case shopkeeper ke manual follow up ke liye bhej diya gaya hai. Dhanyavaad.',
        systemError: () => 'Maaf kijiye, connection mein dikkat aayi. Hum dobara call karenge. Dhanyavaad.',
        noInvoice: () => 'Aapke account mein koi pending due nahi mila. Dhanyavaad.',
        recordingMissing: () => 'Aapka response record nahi ho paya. Hum baad mein call karenge. Dhanyavaad.',
        recordingFetchFailed: () => 'Aapka response process nahi ho paya. Hum baad mein call karenge. Dhanyavaad.',
        transcriptionFailed: () => 'Aapki baat clear nahi sun paaye. Hum kal dobara call karenge. Dhanyavaad.',
        closurePromised: (ctx) => `Dhanyavaad. Aapka payment commitment ${String(ctx?.promisedDateText || 'promised date')} ke liye note kar liya hai.`,
        closurePartial: (ctx) => `Dhanyavaad. Plan note hua: ${fmtAmount(Number(ctx?.partialAmount || 0))} abhi aur ${fmtAmount(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} tak.`,
        closureDispute: () => 'Theek hai. Humne aapka dispute manual review ke liye mark kar diya hai. Dhanyavaad.',
    },
    te: {
        opening: () => 'Namaskaram, Smart Dukkan nundi maatladutunnam. Mee pending payment eppudu chestaro cheppandi.',
        noSpeechRetry: () => 'Mee maata clear ga vinapadaledu. Beep tarvata mee payment plan cheppandi.',
        noSpeechFinal: () => 'Mee response vinapadaledu. Memu malli call chestam. Dhanyavadalu.',
        askPartialNow: (ctx) => `Meeru ivala kanisam ${fmtAmount(Number(ctx?.minimumPartial || 0))} ivagalara, migata amount ni promised date ki istara?`,
        askPartialAmount: (ctx) => `Ippudu ivagalige exact amount cheppandi. Minimum suggest chesindi ${fmtAmount(Number(ctx?.minimumPartial || 0))}.`,
        askRemainingDate: (ctx) => `Migata ${fmtAmount(Number(ctx?.remainingAmount || 0))} ni e date ki istaru?`,
        confirmPlanFull: (ctx) => `Confirm cheyyandi: meeru ${fmtAmount(Number(ctx?.remainingAmount || 0))} ni ${String(ctx?.promisedDateText || '')} ki istaru. Idhi correct aa?`,
        confirmPlanPartial: (ctx) => `Confirm cheyyandi: meeru ${fmtAmount(Number(ctx?.partialAmount || 0))} ippude mariyu ${fmtAmount(Number(ctx?.remainingAmount || 0))} ni ${String(ctx?.promisedDateText || '')} ki istaru. Correct aa?`,
        askDateExample: (ctx) => `Exact date cheppandi, ${fmtAmount(Number(ctx?.remainingAmount || 0))} eppudu istaro. Udaharanam: repu leka 3 rojula tarvata.`,
        unableToUnderstand: () => 'Mee response clear ga ardham kaaledu. Memu repu malli call chestam. Dhanyavadalu.',
        manualCallback: () => 'Mee case ni shopkeeper manual follow up ki pampinchaam. Dhanyavadalu.',
        systemError: () => 'Kshaminchandi, connection samasya vachindi. Memu malli call chestam. Dhanyavadalu.',
        noInvoice: () => 'Mee account lo active due kanapadaledu. Dhanyavadalu.',
        recordingMissing: () => 'Mee response record kaaledu. Memu malli call chestam. Dhanyavadalu.',
        recordingFetchFailed: () => 'Mee response process kaaledu. Memu malli call chestam. Dhanyavadalu.',
        transcriptionFailed: () => 'Mee maata clear ga vinapadaledu. Memu repu malli call chestam. Dhanyavadalu.',
        closurePromised: (ctx) => `Dhanyavadalu. Mee payment commitment ${String(ctx?.promisedDateText || 'promised date')} ki note chesam.`,
        closurePartial: (ctx) => `Dhanyavadalu. Plan note chesam: ${fmtAmount(Number(ctx?.partialAmount || 0))} ippude mariyu ${fmtAmount(Number(ctx?.remainingAmount || 0))} ni ${String(ctx?.promisedDateText || '')} ki.`,
        closureDispute: () => 'Sare. Mee dispute ni manual review ki mark chesam. Dhanyavadalu.',
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

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
    return `₹${Math.max(0, Math.round(amount))}`;
}

function fmtAmountHi(amount: number): string {
    return `₹${Math.max(0, Math.round(amount))}`;
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
        opening: () => 'नमस्ते। Smart Dukkan से बोल रहे हैं। आपका बकाया कब तक देंगे?',
        noSpeechRetry: () => 'आवाज नहीं आई। बीप के बाद अपना भुगतान बताइए।',
        noSpeechFinal: () => 'जवाब नहीं मिला। फिर से कॉल करेंगे। धन्यवाद।',
        askPartialNow: (ctx) => `क्या आज ${fmtAmountHi(Number(ctx?.minimumPartial || 0))} दे सकते हैं?`,
        askPartialAmount: (ctx) => `अभी कितना देंगे? न्यूनतम ${fmtAmountHi(Number(ctx?.minimumPartial || 0))}।`,
        askRemainingDate: (ctx) => `${fmtAmountHi(Number(ctx?.remainingAmount || 0))} कब तक देंगे?`,
        confirmPlanFull: (ctx) => `पुष्टि: ${fmtAmountHi(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} तक देंगे। हाँ या नहीं?`,
        confirmPlanPartial: (ctx) => `पुष्टि: ${fmtAmountHi(Number(ctx?.partialAmount || 0))} अभी, ${fmtAmountHi(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} तक। हाँ या नहीं?`,
        askDateExample: (ctx) => `${fmtAmountHi(Number(ctx?.remainingAmount || 0))} कब देंगे? जैसे कल या 3 दिन में।`,
        unableToUnderstand: () => 'समझ नहीं आया। कल फिर कॉल करेंगे। धन्यवाद।',
        manualCallback: () => 'आपका केस दुकानदार को भेज रहे हैं। धन्यवाद।',
        systemError: () => 'संबंध में दिक्कत है। वापस कॉल करेंगे। धन्यवाद।',
        noInvoice: () => 'कोई बकाया नहीं मिला। धन्यवाद।',
        recordingMissing: () => 'जवाब रिकॉर्ड नहीं हुआ। फिर कॉल करेंगे। धन्यवाद।',
        recordingFetchFailed: () => 'जवाब प्रोसेस नहीं हुआ। फिर कॉल करेंगे। धन्यवाद।',
        transcriptionFailed: () => 'बोल नहीं समझा। कल फिर कॉल करेंगे। धन्यवाद।',
        closurePromised: (ctx) => `धन्यवाद। भुगतान ${String(ctx?.promisedDateText || 'तारीख')} के लिए नोट किया।`,
        closurePartial: (ctx) => `धन्यवाद। प्लान: ${fmtAmountHi(Number(ctx?.partialAmount || 0))} अभी, ${fmtAmountHi(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} तक।`,
        closureDispute: () => 'समझ गए। केस मैनुअल रिव्यू के लिए मार्क किया। धन्यवाद।',
    },
    te: {
        opening: () => 'నమస్కరం. Smart Dukkan నుండి కాల్ వచ్చింది. మీ బాకీ ఎప్పుడు చెల్లిస్తారు?',
        noSpeechRetry: () => 'మాట వినబడలేదు. బీప్ తర్వాత చెప్పండి.',
        noSpeechFinal: () => 'జవాబు రాకపోతే ఇలాగే ఉంటుంది. వెళ్ళాము.',
        askPartialNow: (ctx) => `నేటికి ${fmtAmountTe(Number(ctx?.minimumPartial || 0))} ఇస్తారా?`,
        askPartialAmount: (ctx) => `ఇప్పుడు ఎంత ఇస్తారు? కనిష్టం ${fmtAmountTe(Number(ctx?.minimumPartial || 0))}.`,
        askRemainingDate: (ctx) => `${fmtAmountTe(Number(ctx?.remainingAmount || 0))} ఎలా ఇస్తారు?`,
        confirmPlanFull: (ctx) => `కన్ఫర్మ్: ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} కు. అవ్వటా?`,
        confirmPlanPartial: (ctx) => `కన్ఫర్మ్: ${fmtAmountTe(Number(ctx?.partialAmount || 0))} ఇప్పుడు, ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')} కు. అవ్వటా?`,
        askDateExample: (ctx) => `${fmtAmountTe(Number(ctx?.remainingAmount || 0))} ఎప్పుడు ఇస్తారు? నాడు లేదా 3రోజులో.`,
        unableToUnderstand: () => 'అర్థం కాదు. రేపు మళ్ళी కాల్‌చేస్తాము. బై.',
        manualCallback: () => 'కేసు షాప్‌కీपर్‌కు వెళుతుంది. ధన్యావాదాలు.',
        systemError: () => 'కనెక్షన్‌లोపం వచ్చింది. మళ్ళी కాల్‌చేస్తాము. బై.',
        noInvoice: () => 'బాకీ లేదు. బై.',
        recordingMissing: () => 'జవాబు రికార్డు కాబోలే. మళ్ళी కాల్‌చేస్తాము. బై.',
        recordingFetchFailed: () => 'జవాబు ప్రాసెస్‌కాబోలే. మళ్ళీ కాల్‌చేస్తాము. బై.',
        transcriptionFailed: () => 'మాట అర్థం కాబోలే. రేపు మళ్ళీ కాల్‌చేస్తాము. బై.',
        closurePromised: (ctx) => `ధన్యావాదాలు. ${String(ctx?.promisedDateText || 'తేదी')}కి బాకీ నోట్‌చేశాము. బై.`,
        closurePartial: (ctx) => `ధన్యావాదాలు. ${fmtAmountTe(Number(ctx?.partialAmount || 0))} ఇప్పుడు, ${fmtAmountTe(Number(ctx?.remainingAmount || 0))} ${String(ctx?.promisedDateText || '')}కి. బై.`,
        closureDispute: () => 'అర్థం. కేసు మానువల్‌రివ్యూకు పంపాము. ధన్యావాదాలు.',
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

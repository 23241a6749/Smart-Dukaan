import { getTwilioGatherLanguage, VoiceLang } from './voiceLanguage.js';

function sanitizeForTwiml(text: string): string {
    return (text || '')
        .replace(/&/g, ' and ')
        .replace(/</g, '')
        .replace(/>/g, '')
        .replace(/₹/g, 'rupees ')
        .replace(/"/g, '')
        .replace(/\n/g, '. ')
        .replace(/\r/g, '')
        .trim() || 'Thank you. Goodbye.';
}

function voiceForLanguage(lang: VoiceLang): string {
    const explicit = process.env[`TWILIO_VOICE_${lang.toUpperCase()}` as keyof NodeJS.ProcessEnv];
    return explicit || process.env.TWILIO_VOICE_DEFAULT || 'alice';
}

export function buildGatherTwimlLocalized(args: {
    text: string;
    backendUrl: string;
    callCount?: number;
    lang: VoiceLang;
    withDtmfFallback?: boolean;
}): string {
    const safe = sanitizeForTwiml(args.text);
    const nextCount = (args.callCount || 0) + 1;
    const twilioLang = getTwilioGatherLanguage(args.lang);
    const voice = voiceForLanguage(args.lang);
    const inputMode = args.withDtmfFallback ? 'speech dtmf' : 'speech';
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="${inputMode}" action="${args.backendUrl}/api/invoices/webhook/voice?CallCount=${nextCount}" method="POST" timeout="5" speechTimeout="auto" language="${twilioLang}" speechModel="phone_call" numDigits="1"><Say voice="${voice}" language="${twilioLang}">${safe}</Say></Gather><Say voice="${voice}" language="${twilioLang}">We did not receive your response. Goodbye.</Say></Response>`;
}

export function buildRecordFollowupTwimlLocalized(args: {
    text: string;
    backendUrl: string;
    lang: VoiceLang;
}): string {
    const safe = sanitizeForTwiml(args.text);
    const twilioLang = getTwilioGatherLanguage(args.lang);
    const voice = voiceForLanguage(args.lang);
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${voice}" language="${twilioLang}">${safe}</Say><Record action="${args.backendUrl}/api/invoices/webhook/voice-recording" method="POST" maxLength="25" playBeep="true" timeout="4" trim="trim-silence" /><Say voice="${voice}" language="${twilioLang}">We could not hear your response clearly. We will follow up later. Goodbye.</Say><Hangup/></Response>`;
}

export function buildHangupTwimlLocalized(text: string, lang: VoiceLang): string {
    const safe = sanitizeForTwiml(text);
    const twilioLang = getTwilioGatherLanguage(lang);
    const voice = voiceForLanguage(lang);
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${voice}" language="${twilioLang}">${safe}</Say><Hangup/></Response>`;
}

export function buildErrorTwimlLocalized(lang: VoiceLang): string {
    const twilioLang = getTwilioGatherLanguage(lang);
    const voice = voiceForLanguage(lang);
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${voice}" language="${twilioLang}">Sorry, there was a connection issue. We will call you back. Goodbye.</Say><Hangup/></Response>`;
}

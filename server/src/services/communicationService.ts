import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { IInvoice } from '../models/Invoice.js';

// Setup Twilio
const twilioAvailable = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
const twilioClient = twilioAvailable ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

// Setup Nodemailer Ethanereal (mock testing) or real SMTP if provided
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
        user: process.env.SMTP_USER || 'ethereal.user@ethereal.email',
        pass: process.env.SMTP_PASS || 'ethereal_password'
    }
});

export async function sendNotification(invoice: IInvoice, message: string, channel: string): Promise<string> {
    try {
        if (channel === 'whatsapp') {
            if (!twilioAvailable || !twilioClient) {
                console.log(`[Mock WhatsApp] to ${invoice.client_phone}: ${message}`);
                return 'simulated_delivered';
            }
            // For Hackathons using the WhatsApp Sandbox, the From number is always +1 415 523 8886
            const twilioWhatsappNum = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
            const fromNum = twilioWhatsappNum.startsWith('whatsapp:')
                ? twilioWhatsappNum
                : `whatsapp:${twilioWhatsappNum}`;
            const toNum = invoice.client_phone.startsWith('whatsapp:')
                ? invoice.client_phone
                : `whatsapp:${invoice.client_phone}`;

            await twilioClient.messages.create({
                body: message,
                from: fromNum,
                to: toNum
            });
            return 'delivered';

        } else if (channel === 'sms') {
            if (!twilioAvailable || !twilioClient) {
                console.log(`[Mock SMS] to ${invoice.client_phone}: ${message}`);
                return 'simulated_delivered';
            }
            const fromNumSms = process.env.TWILIO_PHONE_NUMBER?.replace('whatsapp:', '') || '';
            const toNumSms = invoice.client_phone.replace('whatsapp:', '');

            await twilioClient.messages.create({
                body: message,
                from: fromNumSms,
                to: toNumSms
            });
            return 'delivered';

        } else if (channel === 'call') {
            if (!twilioAvailable || !twilioClient) {
                console.error('[Voice Agent] Missing Twilio credentials for call');
                return 'failed_config';
            }
            const voiceNumber = (process.env.TWILIO_VOICE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').replace('whatsapp:', '');
            const toNumCall = invoice.client_phone.replace('whatsapp:', '');

            const targetPhone = process.env.VOICE_AGENT_TARGET_PHONE || '+918712316204';
            const normalize = (value: string) => value.replace(/[^0-9]/g, '').slice(-10);
            if (normalize(toNumCall) !== normalize(targetPhone)) {
                console.log(`[Voice Agent] Skipping call to non-target number ${toNumCall}`);
                return 'skipped_non_target';
            }

            // Sanitize for TwiML XML
            const safeMessage = (message || '')
                .replace(/&/g, ' and ')
                .replace(/</g, '')
                .replace(/>/g, '')
                .replace(/₹/g, 'rupees ')
                .replace(/"/g, '')
                .replace(/'/g, '')
                .replace(/\n/g, '. ')
                .replace(/\r/g, '')
                .trim();

            // Voice agent: prompt + recording, transcript is handled by Deepgram in webhook.
            const backendUrl = process.env.BACKEND_URL || '';
            if (!/^https?:\/\//.test(backendUrl)) {
                console.error('[Voice Agent] BACKEND_URL is missing or invalid. It must be public http(s).');
                return 'failed_config';
            }
            const prompt = `${safeMessage}. Please tell us clearly when you will pay. Speak after the beep.`;
            const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="en-IN">${prompt}</Say><Record action="${backendUrl}/api/invoices/webhook/voice-recording" method="POST" maxLength="25" playBeep="true" timeout="4" trim="trim-silence" /><Say voice="alice" language="en-IN">We could not capture your response. We will call you again later. Goodbye.</Say><Hangup/></Response>`;

            await twilioClient.calls.create({
                twiml: twiml,
                to: toNumCall,
                from: voiceNumber,
                statusCallback: backendUrl ? `${backendUrl}/api/invoices/webhook/voice-status` : undefined,
                statusCallbackMethod: 'POST',
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
            });
            return 'delivered';

        } else if (channel === 'email') {
            // For email, we expect the LLM might have put 'Subject: ...' at the start
            let subject = `Invoice Reminder: KiranaLink`;
            let textBody = message;

            if (message.toLowerCase().startsWith('subject:')) {
                const parts = message.split('\n');
                subject = parts[0].replace(/subject:/i, '').trim();
                textBody = parts.slice(1).join('\n').trim();
            }

            console.log(`[Sending Email] to ${invoice.client_email}, Subject: ${subject}`);
            // In a real hackathon lacking keys, this might fail to ethereal if the auth is totally bogus,
            // so wrap it safely.
            try {
                await transporter.sendMail({
                    from: '"KiranaLink Billing" <billing@kiranalink.in>',
                    to: invoice.client_email,
                    subject: subject,
                    text: textBody
                });
                return 'delivered';
            } catch (smtpErr) {
                console.error('[Mock Email fallback] SMTP fail, but recorded as simulated:', smtpErr);
                return 'simulated_delivered';
            }
        }

        return 'failed_unknown_channel';
    } catch (error) {
        console.error(`Error sending ${channel} notification to ${invoice.client_name}:`, error);
        return 'failed';
    }
}

export async function sendGenericMessage(phone: string, message: string, channel: string): Promise<string> {
    try {
        if (channel === 'whatsapp') {
            if (!twilioAvailable || !twilioClient) return 'simulated_delivered';
            const twilioWhatsappNum = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
            const fromNum = twilioWhatsappNum.startsWith('whatsapp:')
                ? twilioWhatsappNum
                : `whatsapp:${twilioWhatsappNum}`;
            const toNum = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;

            await twilioClient.messages.create({
                body: message,
                from: fromNum,
                to: toNum
            });
            return 'delivered';
        }
        return 'unsupported';
    } catch (e) {
        console.error('Error sending generic message:', e);
        return 'failed';
    }
}

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
                console.log(`[Mock Call] to ${invoice.client_phone}: ${message}`);
                return 'simulated_delivered';
            }
            const voiceNumber = (process.env.TWILIO_VOICE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').replace('whatsapp:', '');
            const toNumCall = invoice.client_phone.replace('whatsapp:', '');

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

            // Interactive AI Agent: Uses <Gather> to listen for customer speech and bounce to our Webhook
            const backendUrl = process.env.BACKEND_URL || '';
            const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${backendUrl}/api/invoices/webhook/voice" method="POST" timeout="5" speechTimeout="auto" language="en-IN" enhanced="true" speechModel="phone_call"><Say voice="alice" language="en-IN">${safeMessage}</Say></Gather><Say voice="alice" language="en-IN">I did not hear anything from you. Goodbye.</Say><Hangup/></Response>`;

            await twilioClient.calls.create({
                twiml: twiml,
                to: toNumCall,
                from: voiceNumber
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

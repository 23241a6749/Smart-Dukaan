import cron from 'node-cron';
import { Invoice } from '../models/Invoice.js';
import { Customer } from '../models/Customer.js';
import { CustomerAccount } from '../models/CustomerAccount.js';
import { evaluateEscalation } from '../utils/escalationEngine.js';
import { generateMessage } from '../services/messageGenerator.js';
import { sendNotification } from '../services/communicationService.js';

const DEMO_MODE = process.env.DEMO_MODE === 'true';
const SCHEDULER_ENABLED = process.env.ENABLE_INVOICE_SCHEDULER === 'true';

// Smart channel selection based on escalation level
// Level 1-2: WhatsApp (polite nudge → firm follow-up)
// Level 3-4: Voice Call (urgent → final)
function selectChannel(invoice: any, level: number): string {
    if (!invoice.client_phone) return 'email';
    if (level <= 2) return 'whatsapp';
    return 'call';
}

function computeNextRetry(channel: string): Date {
    const next = new Date();
    if (DEMO_MODE) {
        next.setMinutes(next.getMinutes() + (channel === 'call' ? 3 : 1));
        return next;
    }

    next.setHours(next.getHours() + (channel === 'call' ? 24 : 12));
    return next;
}

async function runEscalationCycle() {
    try {
        const tag = DEMO_MODE ? '🎬 DEMO' : '⏰';
        console.log(`\n${tag} ─── Running Escalation Cycle ───`);

        const accounts = await CustomerAccount.find({ balance: { $gt: 0 } }).populate('customerId');
        for (const account of accounts) {
            const customer = account.customerId as any;
            if (!customer?.phoneNumber) continue;

            const existingInvoice = await Invoice.findOne({
                client_phone: { $regex: new RegExp(customer.phoneNumber.replace(/[^0-9]/g, '').slice(-10) + '$') },
                status: { $in: ['unpaid', 'overdue', 'promised', 'disputed'] }
            });

            if (!existingInvoice) {
                const fallbackDue = new Date();
                fallbackDue.setMinutes(fallbackDue.getMinutes() - 2);
                await Invoice.create({
                    invoice_id: `KHATA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    client_name: customer.name || 'Valued Customer',
                    client_email: `${(customer.name || 'user').replace(/\s/g, '').toLowerCase()}@example.com`,
                    client_phone: customer.phoneNumber,
                    amount: account.balance,
                    due_date: customer.nextCallDate ? new Date(customer.nextCallDate) : fallbackDue,
                    status: customer.nextCallDate && customer.nextCallDate > Date.now() ? 'promised' : 'overdue',
                    reminder_level: 0,
                    next_retry_at: customer.nextCallDate ? new Date(customer.nextCallDate) : null,
                });
            } else {
                existingInvoice.amount = account.balance;
                if (customer.nextCallDate) {
                    existingInvoice.due_date = new Date(customer.nextCallDate);
                    existingInvoice.next_retry_at = new Date(customer.nextCallDate);
                    existingInvoice.status = customer.nextCallDate > Date.now() ? 'promised' : existingInvoice.status;
                }
                await existingInvoice.save();
            }
        }

        const now = new Date();
        await Invoice.updateMany(
            {
                status: 'promised',
                due_date: { $lte: now }
            },
            {
                $set: { status: 'overdue' },
                $push: {
                    reminder_history: {
                        timestamp: now,
                        channel: 'system',
                        message_content: 'Promise date reached. Recovery resumed automatically.',
                        delivery_status: 'delivered'
                    }
                }
            }
        );

        const activeInvoices = await Invoice.find({
            status: { $in: ['unpaid', 'overdue'] }
        });

        if (activeInvoices.length === 0) {
            console.log(`${tag} No active invoices. Agent idle.`);
            return;
        }

        console.log(`${tag} Evaluating ${activeInvoices.length} invoices...`);

        for (const invoice of activeInvoices) {
            const last10 = invoice.client_phone.replace(/[^0-9]/g, '').slice(-10);
            const customer = await Customer.findOne({ phoneNumber: { $regex: new RegExp(last10 + '$') } });
            if (customer?.nextCallDate && customer.nextCallDate > Date.now()) {
                continue;
            }

            if (invoice.next_retry_at && new Date(invoice.next_retry_at).getTime() > Date.now()) {
                continue;
            }

            const linkedAccounts = customer
                ? await CustomerAccount.find({ customerId: customer._id, balance: { $gt: 0 } })
                : [];
            const pendingBalance = linkedAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

            if (pendingBalance <= 0) {
                invoice.status = 'paid';
                invoice.next_retry_at = null;
                invoice.reminder_history.push({
                    timestamp: new Date(),
                    channel: 'system',
                    message_content: 'Auto-closed: pending khata fully settled.',
                    delivery_status: 'delivered'
                });
                await invoice.save();
                continue;
            }

            invoice.amount = pendingBalance;

            const escalation = evaluateEscalation(invoice);

            if (!escalation.shouldRemind) continue;

            const channel = selectChannel(invoice, escalation.level);
            console.log(`${tag} 🎯 ${invoice.client_name} | ₹${invoice.amount} | Level ${escalation.level} (${escalation.tone}) → ${channel.toUpperCase()}`);

            try {
                const generatedMessage = await generateMessage(invoice, escalation.tone, channel);
                const delivery_status = await sendNotification(invoice, generatedMessage, channel);

                const now = new Date();
                invoice.status = 'overdue';
                invoice.reminder_level = escalation.level;
                invoice.last_contacted_at = now;
                invoice.next_retry_at = computeNextRetry(channel);

                invoice.reminder_history.push({
                    timestamp: now,
                    channel,
                    message_content: generatedMessage,
                    delivery_status
                });

                await invoice.save();
                console.log(`${tag} ✅ ${invoice.invoice_id} → ${channel} sent (${delivery_status})`);
            } catch (innerErr) {
                console.error(`${tag} ❌ Failed for ${invoice.client_name}:`, innerErr);
            }
        }
    } catch (error) {
        console.error('[Scheduler] Critical error:', error);
    }
}

export function startInvoiceScheduler() {
    if (!SCHEDULER_ENABLED) {
        console.log('⏸️ Invoice Auto-Pilot Scheduler disabled.');
        return;
    }

    if (DEMO_MODE) {
        // DEMO: Run every 30 seconds for real-time hackathon presentation
        console.log('🎬 [DEMO MODE] Voice Auto-Pilot running every 30 seconds for live demo!');
        setInterval(runEscalationCycle, 30 * 1000);
    } else {
        // PRODUCTION: Run every minute
        cron.schedule('* * * * *', runEscalationCycle);
        console.log('🚀 [PROD] Invoice Auto-Pilot Scheduler running (every 1 minute).');
    }
}

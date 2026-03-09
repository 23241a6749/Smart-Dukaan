import { IInvoice } from '../models/Invoice.js';

export interface EscalationResult {
    shouldRemind: boolean;
    level: number;
    tone: string;
}

const DEMO_MODE = process.env.DEMO_MODE === 'true';

// In DEMO MODE, the entire escalation plays out in ~2 minutes using SECONDS as the time unit
// In PRODUCTION, it uses DAYS (1, 3, 7, 14 days)
const THRESHOLDS = DEMO_MODE
    ? { L1: 0, L2: 1, L3: 2, L4: 3 }       // 0s, 1min, 2min, 3min
    : { L1: 1, L2: 3, L3: 7, L4: 14 };      // 1d, 3d, 7d, 14d

export function evaluateEscalation(invoice: IInvoice): EscalationResult {
    const now = new Date();
    const dueDate = new Date(invoice.due_date);

    const defaultResult: EscalationResult = { shouldRemind: false, level: invoice.reminder_level, tone: '' };

    // Don't remind if not overdue, paid, disputed, or promised
    if (now <= dueDate || ['paid', 'disputed', 'promised'].includes(invoice.status)) {
        return defaultResult;
    }

    if (invoice.last_contacted_at) {
        const timeSinceContact = now.getTime() - new Date(invoice.last_contacted_at).getTime();
        // Prevent autonomous double-calls. In demo mode, wait at least 2 minutes between contacts.
        if (DEMO_MODE && timeSinceContact < 120000) {
            return defaultResult;
        }
    }

    const timeDifferenceMs = now.getTime() - dueDate.getTime();

    // DEMO: use MINUTES as unit (so Level 1 triggers instantly, Level 3 in ~2 min)
    // PROD: use DAYS as unit
    const timeUnit = DEMO_MODE
        ? timeDifferenceMs / (1000 * 60)       // minutes
        : timeDifferenceMs / (1000 * 60 * 60 * 24); // days

    // Process from most severe to least severe
    if (timeUnit >= THRESHOLDS.L4 && invoice.reminder_level < 4) {
        return { shouldRemind: true, level: 4, tone: 'final notice' };
    }
    if (timeUnit >= THRESHOLDS.L3 && invoice.reminder_level < 3) {
        return { shouldRemind: true, level: 3, tone: 'urgent reminder' };
    }
    if (timeUnit >= THRESHOLDS.L2 && invoice.reminder_level < 2) {
        return { shouldRemind: true, level: 2, tone: 'polite follow-up' };
    }
    if (timeUnit >= THRESHOLDS.L1 && invoice.reminder_level < 1) {
        return { shouldRemind: true, level: 1, tone: 'friendly reminder' };
    }

    return defaultResult;
}

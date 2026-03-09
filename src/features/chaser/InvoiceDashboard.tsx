import React, { useEffect, useState } from 'react';
import { invoiceApi } from '../../services/api';
import {
    CheckCircle, Clock, Zap,
    RefreshCw, Smartphone, Mail, Phone,
    Activity, Bot, ShieldAlert, ChevronDown, ChevronUp, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ReplyHistory {
    timestamp: string;
    channel: string;
    message_content: string;
    delivery_status: string;
}

export interface Invoice {
    invoice_id: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    amount: number;
    due_date: string;
    status: string;
    reminder_level: number;
    last_contacted_at: string | null;
    reminder_history: ReplyHistory[];
}

export default function InvoiceDashboard() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [demoLoading, setDemoLoading] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const toggleRow = (id: string) => {
        const next = new Set(expandedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedRows(next);
    };

    const fetchInvoices = async () => {
        try {
            const { data } = await invoiceApi.getInvoices();
            setInvoices(data);
        } catch (err) {
            console.error('Failed to load invoices', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
        const interval = setInterval(fetchInvoices, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleMarkPaid = async (invoiceId: string) => {
        try {
            await invoiceApi.markInvoicePaid(invoiceId);
            await fetchInvoices();
        } catch (err) {
            console.error('Failed to mark paid', err);
        }
    };

    const handleStartDemo = async () => {
        setDemoLoading(true);
        try {
            await invoiceApi.importKhataDues();
            await fetchInvoices();
        } catch (err) {
            console.error('Demo trigger failed', err);
        } finally {
            setTimeout(() => setDemoLoading(false), 1000);
        }
    };

    const totalInvoices = invoices.length;
    const activeRecoveries = invoices.filter(i => ['overdue', 'unpaid'].includes(i.status)).length;
    const promisedCount = invoices.filter(i => i.status === 'promised').length;
    const disputedCount = invoices.filter(i => i.status === 'disputed').length;
    const recoveredInvoices = invoices.filter(i => i.status === 'paid').length;
    const totalAmountRecovered = invoices.filter(i => i.status === 'paid').reduce((acc, cv) => acc + cv.amount, 0);

    return (
        <div className="min-h-screen pb-24 text-gray-900 dark:text-gray-100 flex flex-col gap-8">
            {/* Header Hero */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-indigo-600 via-purple-700 to-indigo-900 p-8 shadow-2xl border border-white/10 shrink-0">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-purple-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-white/90 text-xs font-bold uppercase tracking-wider mb-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            Live GPT-4o Agent
                        </div>
                        <h1 className="text-4xl font-black text-white drop-shadow-md flex items-center gap-3 tracking-tight">
                            <Bot className="h-10 w-10 text-emerald-300" />
                            Voice Auto-Pilot
                        </h1>
                        <p className="text-indigo-100 font-medium text-lg max-w-xl">
                            Autonomous debt recovery. The AI actively calls customers, negotiates natively, and resolves pending payments while you sleep.
                        </p>
                    </div>

                    <button
                        onClick={handleStartDemo}
                        disabled={demoLoading}
                        className="group relative overflow-hidden bg-white hover:bg-gray-50 text-indigo-900 px-8 py-4 rounded-2xl shadow-[0_0_40px_rgba(255,255,255,0.3)] font-black flex items-center gap-3 transition-all hover:scale-105 active:scale-95 disabled:opacity-70 disabled:hover:scale-100 shrink-0"
                    >
                        {demoLoading ? (
                            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
                        ) : (
                            <Activity className="h-6 w-6 text-indigo-600 group-hover:animate-bounce" />
                        )}
                        <span className="text-lg">Sync Overdue Khata</span>
                        <div className="absolute inset-0 border-2 border-white/20 rounded-2xl scale-105 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all pointer-events-none" />
                    </button>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                    { title: 'Total Targets', val: totalInvoices, icon: <Clock className="h-6 w-6 text-blue-500 dark:text-blue-400" />, color: 'from-blue-500/10 to-transparent border-blue-200 dark:border-blue-900/50' },
                    { title: 'Active Chasing', val: activeRecoveries, icon: <Activity className="h-6 w-6 text-orange-500 dark:text-orange-400" />, color: 'from-orange-500/10 to-transparent border-orange-200 dark:border-orange-900/50' },
                    { title: 'Promised', val: promisedCount, icon: <CheckCircle className="h-6 w-6 text-cyan-500 dark:text-cyan-400" />, color: 'from-cyan-500/10 to-transparent border-cyan-200 dark:border-cyan-900/50' },
                    { title: 'Disputed', val: disputedCount, icon: <ShieldAlert className="h-6 w-6 text-rose-500 dark:text-rose-400" />, color: 'from-rose-500/10 to-transparent border-rose-200 dark:border-rose-900/50' },
                    { title: 'Resolved (Paid)', val: recoveredInvoices, icon: <CheckCircle className="h-6 w-6 text-green-500 dark:text-green-400" />, color: 'from-green-500/10 to-transparent border-green-200 dark:border-green-900/50' },
                    { title: 'Revenue Recovered', val: `\u20B9${totalAmountRecovered}`, icon: <Zap className="h-6 w-6 text-purple-500 dark:text-purple-400" />, color: 'from-purple-500/10 to-transparent border-purple-200 dark:border-purple-900/50' },
                ].map((card, idx) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx}
                        className={`p-6 rounded-[2rem] border bg-gradient-to-br ${card.color} bg-white dark:bg-[#151515] shadow-lg backdrop-blur-xl relative overflow-hidden`}
                    >
                        <div className="flex justify-between items-start relative z-10">
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{card.title}</p>
                                <h3 className="text-4xl font-black text-gray-900 dark:text-white drop-shadow-sm">{card.val}</h3>
                            </div>
                            <div className="p-3 bg-white dark:bg-black rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                                {card.icon}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Data Table */}
            <div className="bg-white dark:bg-[#111] rounded-[2rem] shadow-xl border border-gray-100 dark:border-white/5 overflow-hidden flex-1 flex flex-col">
                <div className="px-8 py-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-black/20">
                    <h2 className="text-xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <Zap className="text-amber-500 h-5 w-5" />
                        Active Mission Control
                    </h2>
                    {loading && <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />}
                </div>

                <div className="overflow-x-auto flex-1">
                    {invoices.length === 0 && !loading ? (
                        <div className="p-16 text-center flex flex-col items-center justify-center gap-4">
                            <div className="h-24 w-24 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center">
                                <Bot className="h-10 w-10 text-gray-400 dark:text-gray-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-500 dark:text-gray-400">Agent Idle. Sync Khata to start Auto-Pilot.</h3>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-[#151515] border-b border-gray-100 dark:border-white/5">
                                <tr>
                                    <th className="px-8 py-5 rounded-tl-2xl">Target</th>
                                    <th className="px-8 py-5">Amount</th>
                                    <th className="px-8 py-5">AI Status</th>
                                    <th className="px-8 py-5 text-center">Escalation</th>
                                    <th className="px-8 py-5">Action</th>
                                    <th className="px-8 py-5 rounded-tr-2xl text-right">Logs</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                <AnimatePresence>
                                    {invoices.map((inv) => {
                                        const isExpanded = expandedRows.has(inv.invoice_id);
                                        return (
                                            <React.Fragment key={inv.invoice_id}>
                                                <motion.tr
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                                                    onClick={() => toggleRow(inv.invoice_id)}
                                                >
                                                    <td className="px-8 py-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                                                                {inv.client_name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-gray-900 dark:text-white text-base">{inv.client_name}</div>
                                                                <div className="text-xs font-mono text-gray-400 dark:text-gray-500">{inv.invoice_id}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className="font-black text-gray-900 dark:text-white text-lg">₹{inv.amount}</span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black tracking-wide
                                                            ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                                                                inv.status === 'overdue' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 animate-pulse' :
                                                                    inv.status === 'promised' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400' :
                                                                        inv.status === 'disputed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                                                                            'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                                                            }`}>
                                                            {inv.status === 'overdue' && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                                                            {inv.status === 'paid' && <CheckCircle className="h-3 w-3" />}
                                                            {inv.status === 'promised' && <Clock className="h-3 w-3" />}
                                                            {inv.status === 'disputed' && <ShieldAlert className="h-3 w-3" />}
                                                            {inv.status.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {[1, 2, 3, 4].map((level) => (
                                                                <div key={level} className={`h-2.5 w-8 rounded-full transition-all duration-500 ${inv.reminder_level >= level ?
                                                                    (level > 2 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]') :
                                                                    'bg-gray-200 dark:bg-gray-800'
                                                                    }`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleMarkPaid(inv.invoice_id); }}
                                                            disabled={inv.status === 'paid'}
                                                            className="text-sm font-bold bg-gray-100 dark:bg-white/10 hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-gray-100 disabled:dark:hover:bg-white/10 disabled:hover:text-inherit"
                                                        >
                                                            Force Resolve
                                                        </button>
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <button className="p-2 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-400 hover:text-indigo-500 transition-colors">
                                                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                        </button>
                                                    </td>
                                                </motion.tr>

                                                {/* Expanded History Row */}
                                                <AnimatePresence>
                                                    {isExpanded && (
                                                        <motion.tr
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-gray-100 dark:border-white/5"
                                                        >
                                                            <td colSpan={6} className="px-8 py-6">
                                                                <div className="pl-14">
                                                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                                        <MessageSquare className="h-4 w-4" /> Agent Interaction Logs
                                                                    </h4>
                                                                    <div className="space-y-3">
                                                                        {inv.reminder_history.length === 0 ? (
                                                                            <p className="text-sm text-gray-500 italic">No interactions recorded yet.</p>
                                                                        ) : (
                                                                            inv.reminder_history.map((log, idx) => (
                                                                                <div key={idx} className="flex gap-4 items-start">
                                                                                    <div className="mt-1">
                                                                                        {log.channel === 'call' || log.channel === 'voice_call' ? <Phone className="h-4 w-4 text-rose-500" /> :
                                                                                            log.channel === 'sms' ? <Smartphone className="h-4 w-4 text-emerald-500" /> :
                                                                                                <Mail className="h-4 w-4 text-blue-500" />}
                                                                                    </div>
                                                                                    <div className="flex-1 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/10 p-4 rounded-2xl rounded-tl-sm shadow-sm">
                                                                                        <div className="flex justify-between items-center mb-1">
                                                                                            <span className="text-xs font-bold uppercase text-gray-500">{log.channel}</span>
                                                                                            <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                                                        </div>
                                                                                        <p className="text-sm text-gray-800 dark:text-gray-200 font-medium whitespace-pre-wrap leading-relaxed">
                                                                                            {log.message_content}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                            ))
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </motion.tr>
                                                    )}
                                                </AnimatePresence>
                                            </React.Fragment>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

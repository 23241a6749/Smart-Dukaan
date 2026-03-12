import { useState, useEffect, useCallback } from 'react';
import {
    AlertCircle,
    BookOpen,
    Calculator,
    ChevronDown,
    FileText,
    IndianRupee,
    Landmark,
    Loader2,
    RefreshCcw,
    ShieldCheck,
    Sparkles,
    TrendingDown,
    TrendingUp,
    Zap,
} from 'lucide-react';
import { gstApi } from '../../services/api';
import type { GSTSummary, ITRSummary } from '../../services/api';

import { useToast } from '../../contexts/ToastContext';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR];

function fmt(n: number): string {
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
    label, value, sub, color, icon,
}: {
    label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
    return (
        <div className={`rounded-3xl p-6 ${color} flex flex-col justify-between min-h-[128px] shadow-sm`}>
            <div className="flex items-start justify-between">
                <p className="text-xs font-black uppercase tracking-widest opacity-70">{label}</p>
                <div className="opacity-60">{icon}</div>
            </div>
            <div>
                <p className="text-2xl font-black tracking-tight">{value}</p>
                {sub && <p className="text-xs mt-1 opacity-60 font-medium">{sub}</p>}
            </div>
        </div>
    );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 ${highlight ? 'font-black text-gray-900 dark:text-white' : ''}`}>
            <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
            <span className={`text-sm font-bold ${highlight ? 'text-lg text-primary-green' : 'text-gray-900 dark:text-white'}`}>{value}</span>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function GSTReportPage() {
    const { addToast } = useToast();
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
    const [gstData, setGSTData] = useState<GSTSummary | null>(null);
    const [itrData, setITRData] = useState<ITRSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [classifying, setClassifying] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [gstRes, itrRes] = await Promise.all([
                gstApi.getGSTSummary(selectedMonth, selectedYear),
                gstApi.getITRSummary(selectedMonth, selectedYear),
            ]);
            setGSTData(gstRes.data);
            setITRData(itrRes.data);
        } catch (err: any) {
            addToast(err.response?.data?.message || 'Failed to load GST data', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, selectedYear, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleClassifyAll = async () => {
        setClassifying(true);
        try {
            const res = await gstApi.classifyAll();
            addToast(`Classified ${res.data.classified} products via AI ✓`, 'success');
            loadData();
        } catch (err: any) {
            addToast(err.response?.data?.message || 'Classification failed', 'error');
        } finally {
            setClassifying(false);
        }
    };

    const netPayable = gstData?.netGSTPayable ?? 0;

    return (
        <div className="space-y-6 pb-48">
            {/* ── Hero Header ── */}
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-indigo-700 to-slate-900 p-6 text-white shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_32%)]" />
                <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.35em] text-violet-200/80">
                            GST + ITR Assistance
                        </p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight">
                            Tax Intelligence Centre
                        </h1>
                        <p className="mt-1 max-w-lg text-sm text-indigo-100/80">
                            Auto-tracked GST on every sale &amp; purchase. Monthly summaries ready for GSTR filing.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {/* Month / Year pickers */}
                        <div className="relative">
                            <select
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(Number(e.target.value))}
                                className="appearance-none rounded-2xl border border-white/20 bg-white/10 px-4 py-3 pr-9 text-sm font-bold text-white backdrop-blur-md focus:outline-none"
                            >
                                {MONTHS.map((m, i) => (
                                    <option key={m} value={i + 1} className="text-gray-900">{m}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
                        </div>
                        <div className="relative">
                            <select
                                value={selectedYear}
                                onChange={e => setSelectedYear(Number(e.target.value))}
                                className="appearance-none rounded-2xl border border-white/20 bg-white/10 px-4 py-3 pr-9 text-sm font-bold text-white backdrop-blur-md focus:outline-none"
                            >
                                {YEARS.map(y => (
                                    <option key={y} value={y} className="text-gray-900">{y}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
                        </div>

                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold backdrop-blur-md transition hover:bg-white/20 disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                            Refresh
                        </button>

                        <button
                            onClick={handleClassifyAll}
                            disabled={classifying}
                            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-indigo-900 shadow-xl transition hover:scale-[1.02] disabled:opacity-60"
                        >
                            {classifying ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                            {classifying ? 'Classifying...' : 'AI-Classify Products'}
                        </button>
                    </div>
                </div>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={36} className="animate-spin text-violet-500" />
                </div>
            )}

            {!loading && gstData && (
                <>
                    {/* ── GST Stats ── */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <StatCard
                            label="Total Sales"
                            value={fmt(gstData.totalSales)}
                            sub="incl. GST"
                            color="bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
                            icon={<TrendingUp size={20} />}
                        />
                        <StatCard
                            label="Output GST"
                            value={fmt(gstData.totalOutputGST)}
                            sub="GST collected on sales"
                            color="bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
                            icon={<IndianRupee size={20} />}
                        />
                        <StatCard
                            label="Input GST"
                            value={fmt(gstData.totalInputGST)}
                            sub="GST paid on purchases"
                            color="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700"
                            icon={<TrendingDown size={20} className="text-gray-500" />}
                        />
                        <StatCard
                            label="Net GST Payable"
                            value={fmt(netPayable)}
                            sub={netPayable > 0 ? 'Due to government' : 'Credit / No dues'}
                            color={netPayable > 0
                                ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white'
                                : 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'}
                            icon={<Landmark size={20} />}
                        />
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* ── GST Breakdown ── */}
                        <div className="rounded-[2rem] border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="rounded-2xl bg-violet-100 dark:bg-violet-900/30 p-3 text-violet-600 dark:text-violet-300">
                                    <Calculator size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 dark:text-white">CGST / SGST Breakdown</h2>
                                    <p className="text-xs text-gray-500">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
                                </div>
                            </div>

                            <div className="mb-4 rounded-2xl bg-violet-50 dark:bg-violet-900/10 p-4">
                                <p className="mb-2 text-xs font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">Output (Sales)</p>
                                <Row label="CGST Collected" value={fmt(gstData.outputCGST)} />
                                <Row label="SGST Collected" value={fmt(gstData.outputSGST)} />
                                <Row label="Total Output GST" value={fmt(gstData.totalOutputGST)} highlight />
                            </div>

                            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 p-4">
                                <p className="mb-2 text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-300">Input Credit (Purchases)</p>
                                <Row label="CGST Paid" value={fmt(gstData.inputCGST)} />
                                <Row label="SGST Paid" value={fmt(gstData.inputSGST)} />
                                <Row label="Total Input Credit" value={fmt(gstData.totalInputGST)} highlight />
                            </div>

                            <div className="mt-4 flex items-center justify-between rounded-2xl bg-gray-900 dark:bg-white px-5 py-4">
                                <span className="text-sm font-black text-white dark:text-gray-900">Net GST Payable</span>
                                <span className={`text-lg font-black ${netPayable > 0 ? 'text-rose-300 dark:text-rose-600' : 'text-emerald-300 dark:text-emerald-600'}`}>
                                    {fmt(netPayable)}
                                </span>
                            </div>
                        </div>

                        {/* ── ITR Assistance ── */}
                        {itrData && (
                            <div className="rounded-[2rem] border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="rounded-2xl bg-amber-100 dark:bg-amber-900/30 p-3 text-amber-600 dark:text-amber-300">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 dark:text-white">ITR Assistance</h2>
                                        <p className="text-xs text-gray-500">Estimated income summary</p>
                                    </div>
                                </div>

                                <div className="space-y-0">
                                    <Row label="Gross Revenue (incl. GST)" value={fmt(itrData.revenue)} />
                                    <Row label="Revenue (ex-GST)" value={fmt(itrData.revenueExGST)} />
                                    <Row label="Purchase Cost" value={fmt(itrData.purchaseCost)} />
                                    <Row label="GST Collected (Output)" value={fmt(itrData.gstCollected)} />
                                    <Row label="GST Paid (Input Credit)" value={fmt(itrData.gstPaid)} />
                                    <Row label="Net GST Payable" value={fmt(itrData.netGSTPayable)} />
                                    <Row label="Gross Profit" value={fmt(itrData.grossProfit)} highlight />
                                    <Row label="Est. Taxable Income" value={fmt(itrData.estimatedTaxableIncome)} highlight />
                                </div>

                                <div className="mt-5 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 p-4">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <p className="text-xs text-amber-700 dark:text-amber-300">{itrData.disclaimer}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Info Cards ── */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <InfoCard
                            icon={<Zap size={18} />}
                            title="Auto CGST + SGST"
                            body="Every bill automatically splits GST into equal CGST and SGST components, matching GSTR-1 format."
                            color="bg-violet-50 dark:bg-violet-900/10 text-violet-700 dark:text-violet-300"
                        />
                        <InfoCard
                            icon={<ShieldCheck size={18} />}
                            title="HSN-Backed Rates"
                            body='Products are classified using their HSN code and OpenAI. Results are cached — "classify once, reuse forever".'
                            color="bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300"
                        />
                        <InfoCard
                            icon={<BookOpen size={18} />}
                            title="Input Tax Credit"
                            body="GST paid on supplier purchases is tracked as Input Credit, automatically reducing your net payable amount."
                            color="bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300"
                        />
                    </div>
                </>
            )}

            {!loading && !gstData && (
                <div className="rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 p-16 text-center text-gray-500 dark:text-gray-400">
                    No GST data found for {MONTHS[selectedMonth - 1]} {selectedYear}.<br />
                    <span className="text-sm">Create GST invoices or use the AI-Classify button to get started.</span>
                </div>
            )}
        </div>
    );
}

function InfoCard({ icon, title, body, color }: { icon: React.ReactNode; title: string; body: string; color: string }) {
    return (
        <div className="rounded-3xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
            <div className={`mb-3 inline-flex rounded-2xl p-3 ${color}`}>{icon}</div>
            <h3 className="mb-1 font-black text-gray-900 dark:text-white">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{body}</p>
        </div>
    );
}

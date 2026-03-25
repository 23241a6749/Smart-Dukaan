import { useState, useEffect, useCallback } from 'react';
import {
    AlertCircle,
    Calculator,
    ChevronDown,
    FileText,
    IndianRupee,
    Loader2,
    RefreshCcw,
    Sparkles,
    TrendingDown,
    TrendingUp,
    Download,
    Table as TableIcon,
    ShieldCheck,
    Calendar,
    Landmark,
    ArrowUpRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
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

// ── Animated Stat Card ────────────────────────────────────────────────────────
function StatCard({
    label, value, sub, gradient, icon, delay = 0
}: {
    label: string; value: string; sub?: string;
    gradient: string; icon: React.ReactNode; delay?: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay, ease: 'easeOut' }}
            className={`relative overflow-hidden rounded-2xl p-6 ${gradient} text-white shadow-lg flex flex-col justify-between min-h-[140px]`}
        >
            {/* Subtle inner circle decoration */}
            <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
            <div className="absolute -bottom-8 -right-2 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

            <div className="relative z-10 flex items-start justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{label}</p>
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                    {icon}
                </div>
            </div>
            <div className="relative z-10 mt-4">
                <p className="text-2xl font-black tracking-tight">{value}</p>
                {sub && <p className="text-[10px] mt-1 opacity-70 font-bold uppercase tracking-wider flex items-center gap-1">{sub} <ArrowUpRight size={10} /></p>}
            </div>
        </motion.div>
    );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0 ${highlight ? 'font-black' : ''}`}>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
            <span className={`text-sm font-bold ${highlight ? 'text-base text-primary-green' : 'text-gray-900 dark:text-white'}`}>{value}</span>
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
    const [yearlySummaries, setYearlySummaries] = useState<GSTSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [classifying, setClassifying] = useState(false);
    const [exporting, setExporting] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [gstRes, itrRes] = await Promise.all([
                gstApi.getGSTSummary(selectedMonth, selectedYear),
                gstApi.getITRSummary(selectedMonth, selectedYear),
            ]);
            setGSTData(gstRes.data);
            setITRData(itrRes.data);

            const promises = Array.from({ length: 12 }, (_, i) =>
                gstApi.getGSTSummary(i + 1, selectedYear).catch(() => ({ data: null }))
            );
            const results = await Promise.all(promises);
            setYearlySummaries(results.map(r => r.data).filter(Boolean) as GSTSummary[]);
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

    const handleExportCSV = async () => {
        setExporting(true);
        try {
            const invoicesRes = await gstApi.getInvoices({ month: selectedMonth, year: selectedYear });
            const invoices = invoicesRes.data;
            if (!invoices || invoices.length === 0) {
                addToast('No transaction data found to export', 'error');
                return;
            }
            const headers = ['Date', 'Type', 'Item Name', 'Taxable Amount', 'GST Amount', 'Total Amount'];
            const csvRows = [headers.join(',')];
            invoices.forEach((inv: any) => {
                inv.items.forEach((item: any) => {
                    csvRows.push([
                        new Date(inv.createdAt).toLocaleDateString('en-IN'),
                        inv.invoiceType === 'sale' ? 'Sale' : 'Purchase',
                        `"${item.name.replace(/"/g, '""')}"`,
                        item.baseAmount.toFixed(2),
                        (item.cgstAmount + item.sgstAmount).toFixed(2),
                        item.totalAmount.toFixed(2)
                    ].join(','));
                });
            });
            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.setAttribute('href', URL.createObjectURL(blob));
            link.setAttribute('download', `GST_Report_${MONTHS[selectedMonth - 1]}_${selectedYear}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            addToast('GST Report downloaded successfully', 'success');
        } catch {
            addToast('Failed to generate export', 'error');
        } finally {
            setExporting(false);
        }
    };

    const netPayable = gstData?.netGSTPayable ?? 0;

    return (
        <div className="space-y-6 pb-48">

            {/* ── Hero Header ─────────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 md:p-8 shadow-xl"
            >
                {/* background glows */}
                <div className="absolute top-0 right-0 w-72 h-72 bg-primary-green/20 rounded-full -mr-36 -mt-36 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500/10 rounded-full -ml-20 -mb-20 blur-2xl pointer-events-none" />

                <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-green/20 text-primary-green rounded-full mb-3 border border-primary-green/30">
                            <ShieldCheck size={13} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Verified Tax Centre</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-white">
                            GST &amp; ITR <span className="text-primary-green">Dashboard</span>
                        </h1>
                        <p className="text-gray-400 text-sm font-medium mt-1">
                            {MONTHS[selectedMonth - 1]} {selectedYear} · Auto-calculated from sales
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                        {/* Month / Year pickers */}
                        <div className="flex bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
                            <div className="relative">
                                <select
                                    value={selectedMonth}
                                    onChange={e => setSelectedMonth(Number(e.target.value))}
                                    className="appearance-none bg-transparent text-white pl-4 pr-8 py-2.5 text-sm font-bold focus:outline-none"
                                >
                                    {MONTHS.map((m, i) => (
                                        <option key={m} value={i + 1} className="text-gray-900">{m}</option>
                                    ))}
                                </select>
                                <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                            <div className="w-px bg-white/10 my-2" />
                            <div className="relative">
                                <select
                                    value={selectedYear}
                                    onChange={e => setSelectedYear(Number(e.target.value))}
                                    className="appearance-none bg-transparent text-white pl-4 pr-8 py-2.5 text-sm font-bold focus:outline-none"
                                >
                                    {YEARS.map(y => (
                                        <option key={y} value={y} className="text-gray-900">{y}</option>
                                    ))}
                                </select>
                                <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>

                        <motion.button
                            whileTap={{ scale: 0.94 }}
                            onClick={loadData}
                            disabled={loading}
                            className="p-2.5 bg-white/10 border border-white/10 rounded-xl text-white hover:bg-white/20 transition-all disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCcw size={18} />}
                        </motion.button>

                        <motion.button
                            whileTap={{ scale: 0.94 }}
                            onClick={handleClassifyAll}
                            disabled={classifying}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 border border-white/10 text-white rounded-xl text-sm font-black uppercase tracking-tighter hover:bg-white/20 transition-all disabled:opacity-60"
                        >
                            {classifying ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                            AI-Classify
                        </motion.button>

                        <motion.button
                            whileTap={{ scale: 0.94 }}
                            onClick={handleExportCSV}
                            disabled={exporting || loading}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-green text-white rounded-xl text-sm font-black uppercase tracking-tighter shadow-lg shadow-primary-green/30 hover:brightness-110 transition-all disabled:opacity-60"
                        >
                            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                            Export CSV
                        </motion.button>
                    </div>
                </div>
            </motion.div>

            {/* ── Loading ── */}
            {loading && (
                <div className="flex items-center justify-center py-24 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 size={40} className="animate-spin text-primary-green" />
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Recalculating Tax Data...</p>
                    </div>
                </div>
            )}

            {!loading && gstData && (
                <>
                    {/* ── Stat Cards ── */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <StatCard
                            label="GST Collected"
                            value={fmt(gstData.totalOutputGST)}
                            sub="Output GST on sales"
                            gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                            icon={<TrendingUp size={18} />}
                            delay={0}
                        />
                        <StatCard
                            label="Input Credit"
                            value={fmt(gstData.totalInputGST)}
                            sub="GST paid on purchases"
                            gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
                            icon={<TrendingDown size={18} />}
                            delay={0.08}
                        />
                        <StatCard
                            label="Net Liability"
                            value={fmt(netPayable)}
                            sub={netPayable > 0 ? 'Monthly Tax Due' : 'Balance Carryforward'}
                            gradient={netPayable > 0
                                ? 'bg-gradient-to-br from-orange-500 to-rose-600'
                                : 'bg-gradient-to-br from-violet-500 to-purple-700'}
                            icon={<IndianRupee size={18} />}
                            delay={0.16}
                        />
                    </div>

                    {/* ── Monthly Breakdown Table ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden"
                    >
                        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                            <div className="p-2 bg-primary-green/10 text-primary-green rounded-xl">
                                <TableIcon size={18} />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-gray-900 dark:text-white">Monthly GST Breakdown</h2>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">FY {selectedYear}</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 dark:bg-gray-900 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Month</th>
                                        <th className="px-6 py-4">Sales GST</th>
                                        <th className="px-6 py-4">Purchase GST</th>
                                        <th className="px-6 py-4 text-right">Net GST</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                    {yearlySummaries.map((s, i) => (
                                        <tr key={i} className={`transition-colors ${s.month === selectedMonth
                                            ? 'bg-primary-green/5 dark:bg-primary-green/10'
                                            : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {s.month === selectedMonth && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-primary-green flex-shrink-0" />
                                                    )}
                                                    <span className="font-black text-gray-900 dark:text-white text-sm">{MONTHS[s.month - 1]}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-bold text-gray-600 dark:text-gray-300">{fmt(s.totalOutputGST)}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-gray-600 dark:text-gray-300">{fmt(s.totalInputGST)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black ${s.netGSTPayable > 0
                                                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                                                    {fmt(s.netGSTPayable)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {yearlySummaries.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-bold italic text-sm">
                                                No monthly records found for {selectedYear}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>

                    {/* ── Detail Panels ── */}
                    <div className="grid gap-5 lg:grid-cols-2">
                        {/* Tax Type Breakdown */}
                        <motion.div
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: 0.25 }}
                            className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm"
                        >
                            <div className="mb-5 flex items-center gap-3">
                                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-600">
                                    <Calculator size={20} />
                                </div>
                                <div>
                                    <h2 className="text-base font-black text-gray-900 dark:text-white">Tax Type Breakdown</h2>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-600">Output GST — Sales</p>
                                    <Row label="CGST Collected" value={fmt(gstData.outputCGST)} />
                                    <Row label="SGST Collected" value={fmt(gstData.outputSGST)} />
                                    <Row label="Total Output GST" value={fmt(gstData.totalOutputGST)} highlight />
                                </div>

                                <div className="p-5 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.15em] text-blue-600">Input Credit — Purchases</p>
                                    <Row label="CGST Paid" value={fmt(gstData.inputCGST)} />
                                    <Row label="SGST Paid" value={fmt(gstData.inputSGST)} />
                                    <Row label="Total Input Credit" value={fmt(gstData.totalInputGST)} highlight />
                                </div>
                            </div>

                            {/* Net Due pill */}
                            <div className={`mt-5 flex items-center justify-between p-5 rounded-xl ${netPayable > 0
                                ? 'bg-gradient-to-r from-orange-500 to-rose-500'
                                : 'bg-gradient-to-r from-emerald-500 to-teal-600'} text-white shadow-md`}>
                                <div className="flex items-center gap-2">
                                    <Landmark size={18} />
                                    <span className="text-sm font-black uppercase tracking-wider">Net GST Due</span>
                                </div>
                                <span className="text-xl font-black">{fmt(netPayable)}</span>
                            </div>
                        </motion.div>

                        {/* ITR Assistance */}
                        {itrData && (
                            <motion.div
                                initial={{ opacity: 0, x: 12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.4, delay: 0.3 }}
                                className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm"
                            >
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 p-3 text-orange-500">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-black text-gray-900 dark:text-white">ITR Assistance</h2>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Estimated for {selectedYear}</p>
                                    </div>
                                </div>

                                <div className="space-y-0.5">
                                    <Row label="Gross Revenue (incl. GST)" value={fmt(itrData.revenue)} />
                                    <Row label="Revenue (ex-GST)" value={fmt(itrData.revenueExGST)} />
                                    <Row label="Purchase Cost" value={fmt(itrData.purchaseCost)} />
                                    <Row label="GST Collected (Output)" value={fmt(itrData.gstCollected)} />
                                    <Row label="GST Paid (Input Credit)" value={fmt(itrData.gstPaid)} />
                                    <Row label="Net GST Payable" value={fmt(itrData.netGSTPayable)} />
                                    <div className="h-3" />
                                    <Row label="Gross Profit" value={fmt(itrData.grossProfit)} highlight />
                                    <Row label="Est. Taxable Income" value={fmt(itrData.estimatedTaxableIncome)} highlight />
                                </div>

                                <div className="mt-5 flex gap-3 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30">
                                    <AlertCircle size={20} className="shrink-0 text-orange-500 mt-0.5" />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed italic">{itrData.disclaimer}</p>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </>
            )}

            {!loading && !gstData && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-20 text-center"
                >
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-5">
                        <Calendar size={28} className="text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-600 dark:text-gray-300 mb-2">No GST Records Found</h3>
                    <p className="text-sm text-gray-400 max-w-sm mx-auto">
                        Create GST invoices or use the AI-Classify button to populate tax data for {MONTHS[selectedMonth - 1]} {selectedYear}.
                    </p>
                </motion.div>
            )}
        </div>
    );
}

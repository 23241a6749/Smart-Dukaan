import { useState, useEffect } from 'react';
import { Phone, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import DefaulterCard from '../../components/recovery/DefaulterCard';
import LiveCallModal, { type RecoveryCustomer } from '../../components/recovery/LiveCallModal';
import RecoveryMissionControl from '../../components/recovery/RecoveryMissionControl';
import { useToast } from '../../contexts/ToastContext';
import { customerApi } from '../../services/api';
import type { Customer } from '../../db/db';

export default function RecoveryPage() {
    const { addToast } = useToast();

    // Fetch all customers from API
    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

    useEffect(() => {
        loadCustomers();
    }, []);

    const loadCustomers = async () => {
        try {
            const response = await customerApi.getAll();
            setAllCustomers(response.data);
        } catch (e) {
            console.error("Failed to load customers", e);
            addToast("Failed to sync customers", "error");
        }
    };

    const [activeCall, setActiveCall] = useState<RecoveryCustomer | null>(null);
    const [isMissionControlOpen, setIsMissionControlOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'ACTION' | 'SCHEDULED'>('ACTION');
    const nowTs = Date.now();

    // Action Queue
    const actionQueue = allCustomers?.filter((customer: Customer) => {
        const hasBalance = customer.khataBalance > 0;
        const isPastPromiseDate = !customer.nextCallDate || (typeof customer.nextCallDate === 'number' && customer.nextCallDate <= nowTs);
        return hasBalance && isPastPromiseDate;
    }) || [];

    // Scheduled Queue
    const scheduledQueue = allCustomers?.filter((customer: Customer) => {
        const hasBalance = customer.khataBalance > 0;
        const isFuturePromiseDate = customer.nextCallDate && (typeof customer.nextCallDate === 'number' && customer.nextCallDate > nowTs);
        return hasBalance && isFuturePromiseDate;
    }) || [];

    const displayCustomers = (viewMode === 'ACTION' ? actionQueue : scheduledQueue).map((customer: Customer) => {
        const createdAt = customer.createdAt
            ? (typeof customer.createdAt === 'string' ? new Date(customer.createdAt).getTime() : customer.createdAt)
            : nowTs;
        const daysOverdue = Math.floor((nowTs - createdAt) / (1000 * 60 * 60 * 24));
        let risk: 'LOW' | 'MEDIUM' | 'HIGH';
        const trustScore = customer.trustScore || 0;
        const khataBalance = customer.khataBalance || 0;

        if (trustScore >= 80 && khataBalance < 1000) risk = 'LOW';
        else if (trustScore >= 50 || khataBalance < 2000) risk = 'MEDIUM';
        else risk = 'HIGH';

        return {
            id: customer._id || (customer.id ? customer.id.toString() : 'unknown'),
            name: customer.name || 'Unknown',
            amount: khataBalance,
            days: daysOverdue > 0 ? daysOverdue : 1,
            phone: customer.phoneNumber,
            risk: risk,
            nextCallDate: customer.nextCallDate,
            recoveryStatus: customer.recoveryStatus
        };
    });

    const handleCallResult = (result: { status: string; promiseDate: string }) => {
        if (result.status === 'success') {
            addToast(`✅ Promise recorded: ${result.promiseDate}`, 'success');
            loadCustomers();
            return;
        }

        if (result.status === 'initiated') {
            addToast('📞 Voice call initiated. Agent will auto-update dues from customer response.', 'success');
            window.setTimeout(() => loadCustomers(), 6000);
            window.setTimeout(() => loadCustomers(), 15000);
            window.setTimeout(() => loadCustomers(), 30000);
        }
    };

    const totalPending = (allCustomers?.filter((c: Customer) => c.khataBalance > 0) || []).reduce((sum: number, d: Customer) => sum + d.khataBalance, 0);

    return (
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-900 pb-24 font-sans text-gray-900">
            {/* CLEAN HERO SECTION */}
            <div className="bg-white dark:bg-gray-800 pt-6 pb-8 px-6 rounded-b-3xl shadow-sm border-b border-gray-100 dark:border-gray-700">
                {/* Top Row: Title + Status */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                        <ShieldCheck className="text-blue-600 h-6 w-6" /> Recovery Agent
                    </h1>

                </div>

                {/* Minimal Stats Card */}
                <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-200 dark:shadow-none">
                    <p className="text-blue-100 text-xs font-medium uppercase tracking-wide mb-1">Total Recoverable</p>
                    <h2 className="text-3xl font-bold tracking-tight">₹{totalPending.toLocaleString()}</h2>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="px-4 -mt-6 relative z-10">
                {/* Clean Tabs */}
                <div className="bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-1 mb-5">
                    <button
                        onClick={() => setViewMode('ACTION')}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'ACTION'
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Action ({actionQueue.length})
                    </button>
                    <button
                        onClick={() => setViewMode('SCHEDULED')}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'SCHEDULED'
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Scheduled ({scheduledQueue.length})
                    </button>
                </div>

                {/* MISSION CONTROL (Minimal) */}
                {viewMode === 'ACTION' && actionQueue.length > 0 && (
                    <button
                        onClick={() => setIsMissionControlOpen(true)}
                        className="w-full bg-black dark:bg-gray-700 text-white p-4 rounded-xl shadow-md mb-5 flex items-center justify-between active:scale-95 transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                                <Zap size={16} className="text-yellow-400" />
                            </div>
                            <div className="text-left">
                                <h4 className="font-bold text-sm">Auto-Call List</h4>
                                <p className="text-[10px] text-gray-400">{actionQueue.length} customers pending</p>
                            </div>
                        </div>
                        <ArrowRight size={16} />
                    </button>
                )}

                {/* LIST */}
                <div className="space-y-3">
                    {displayCustomers.length > 0 ? (
                        displayCustomers.map((customer: any) => (
                            viewMode === 'SCHEDULED' ? (
                                // === SCHEDULED CARD (Simple & Neat) ===
                                <div key={customer.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-4">
                                        <div className="shrink-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-700 w-12 h-12 rounded-lg">
                                            <span className="text-[10px] uppercase font-bold text-gray-500">
                                                {customer.nextCallDate ? new Date(customer.nextCallDate).toLocaleString('en-US', { month: 'short' }) : 'FUT'}
                                            </span>
                                            <span className="text-lg font-bold text-gray-900 dark:text-white">
                                                {customer.nextCallDate ? new Date(customer.nextCallDate).getDate() : '?'}
                                            </span>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-0.5">{customer.name}</h3>
                                            <p className="text-xs text-gray-500">
                                                <span className="font-medium text-gray-900 dark:text-gray-300">₹{customer.amount.toLocaleString()}</span> • {customer.nextCallDate ? new Date(customer.nextCallDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setActiveCall(customer)}
                                        className="shrink-0 w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-md active:scale-95 transition-all"
                                    >
                                        <Phone size={18} className="fill-current" />
                                    </button>
                                </div>
                            ) : (
                                // === ACTION CARD (Wrapped) ===
                                <div key={customer.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <DefaulterCard
                                        customer={customer}
                                        onRecover={(c: any) => setActiveCall(c)}
                                    />
                                </div>
                            )
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 opacity-40 text-center">
                            <ShieldCheck className="text-gray-400 mb-2" size={32} />
                            <p className="text-xs text-gray-400 font-medium">No pending tasks.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* LIVE CALL MODAL */}
            <LiveCallModal
                customer={activeCall}
                isOpen={!!activeCall}
                onClose={() => setActiveCall(null)}
                onResult={handleCallResult}
            />

            {/* MISSION CONTROL HUD */}
            <RecoveryMissionControl
                isOpen={isMissionControlOpen}
                onClose={() => setIsMissionControlOpen(false)}
                customers={actionQueue.map(c => ({
                    id: c._id || (c.id ? c.id.toString() : 'unknown'),
                    name: c.name,
                    amount: c.khataBalance,
                    phone: c.phoneNumber
                }))}
            />
        </div>
    );
}

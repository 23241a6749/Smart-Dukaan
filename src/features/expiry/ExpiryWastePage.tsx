import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Recycle, RefreshCw, Trash2, ShoppingBag, DollarSign, X, Send, Users, Tag, Layers } from 'lucide-react';
import { expiryApi, wasteApi, discountApi, type ExpiryQueueItem, type ExpiryQueueSummary, type WasteLogItem, type DiscountCode, type DiscountCustomer } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useTranslate } from '../../hooks/useTranslate';
import { useLanguage } from '../../contexts/LanguageContext';


const initialSummary: ExpiryQueueSummary = {
    urgent_3d: 0,
    week_7d: 0,
    month_30d: 0,
    expired: 0,
    totalValueAtRisk: 0,
};

export const ExpiryWastePage: React.FC = () => {
    const { t } = useLanguage();
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [summary, setSummary] = useState<ExpiryQueueSummary>(initialSummary);
    const [queue, setQueue] = useState<ExpiryQueueItem[]>([]);
    const [wasteHistory, setWasteHistory] = useState<WasteLogItem[]>([]);

    // Dynamic Translation Hooks
    const translatedQueue = useTranslate(queue, ['productId.name', 'suggestedAction']);
    const translatedWasteHistory = useTranslate(wasteHistory, ['productId.name', 'reason']);

    const [wasteKPI, setWasteKPI] = useState<{ totalWasteValue: number; totalWasteQty: number; recoveredActions: number }>({
        totalWasteValue: 0,
        totalWasteQty: 0,
        recoveredActions: 0,
    });

    const [wasteForm, setWasteForm] = useState({
        batchId: '',
        quantity: '',
        reason: 'expired' as WasteLogItem['reason'],
        disposalMode: 'discarded' as WasteLogItem['disposalMode'],
        notes: '',
    });

    // Discount Modal State
    const [discountModal, setDiscountModal] = useState<{
        isOpen: boolean;
        item: ExpiryQueueItem | null;
        discountValue: number;
        discountType: 'percentage' | 'fixed';
        loading: boolean;
        appliedDiscountPrice: number | null;
    }>({
        isOpen: false,
        item: null,
        discountValue: 15,
        discountType: 'percentage',
        loading: false,
        appliedDiscountPrice: null,
    });

    // Customer List Modal State
    const [customerModal, setCustomerModal] = useState<{
        isOpen: boolean;
        productId: string | null;
        productName: string;
        discountedPrice: number;
        customers: DiscountCustomer[];
        loading: boolean;
        notifying: boolean;
        notifyResult: { sent: number; failed: number } | null;
    }>({
        isOpen: false,
        productId: null,
        productName: '',
        discountedPrice: 0,
        customers: [],
        loading: false,
        notifying: false,
        notifyResult: null,
    });

    const topRiskItems = useMemo(() => translatedQueue.slice(0, 6), [translatedQueue]);

    const loadAll = async () => {
        const [queueRes, kpiRes, wasteHistoryRes, wasteKPIRes] = await Promise.all([
            expiryApi.getQueue({ status: 'open' }),
            expiryApi.getKPI(),
            wasteApi.getHistory(),
            wasteApi.getKPI(),
        ]);
        setSummary(queueRes.data.summary || initialSummary);
        setQueue(queueRes.data.items || []);
        setWasteHistory((wasteHistoryRes.data || []).slice(0, 8));
        setWasteKPI({
            totalWasteValue: wasteKPIRes.data.totalWasteValue || 0,
            totalWasteQty: wasteKPIRes.data.totalWasteQty || 0,
            recoveredActions: wasteKPIRes.data.recoveredActions || 0,
        });

        if (!wasteForm.batchId && queueRes.data.items?.length) {
            const firstBatchId = queueRes.data.items[0]?.batchId?._id;
            if (firstBatchId) {
                setWasteForm((prev) => ({ ...prev, batchId: firstBatchId }));
            }
        }

        const openRisks = Number(kpiRes.data.openRisks || 0);
        if (openRisks === 0) {
            await expiryApi.recompute();
            const recomputed = await expiryApi.getQueue({ status: 'open' });
            setSummary(recomputed.data.summary || initialSummary);
            setQueue(recomputed.data.items || []);
        }
    };

    useEffect(() => {
        async function boot() {
            setLoading(true);
            try {
                await loadAll();
            } catch (error) {
                console.error('Failed to load expiry dashboard', error);
            } finally {
                setLoading(false);
            }
        }
        boot();
    }, []);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await expiryApi.recompute();
            await loadAll();
        } catch (error) {
            console.error('Failed to refresh expiry queue', error);
        } finally {
            setRefreshing(false);
        }
    };

    const handleLogWaste = async () => {
        if (!wasteForm.batchId || Number(wasteForm.quantity) <= 0) return;
        try {
            await wasteApi.log({
                batchId: wasteForm.batchId,
                quantity: Number(wasteForm.quantity),
                reason: wasteForm.reason,
                disposalMode: wasteForm.disposalMode,
                notes: wasteForm.notes || undefined,
            });
            setWasteForm({ batchId: '', quantity: '', reason: 'expired', disposalMode: 'discarded', notes: '' });
            await handleRefresh();
        } catch (error) {
            console.error('Failed to log waste', error);
        }
    };

    const markAction = async (id: string, status: 'in_progress' | 'done' | 'ignored', actionMeta?: Record<string, unknown>) => {
        try {
            await expiryApi.updateAction(id, { actionStatus: status, actionMeta });
            await loadAll();
        } catch (error) {
            console.error('Failed to update action', error);
        }
    };

    const openDiscountModal = (item: ExpiryQueueItem) => {
        setDiscountModal({
            isOpen: true,
            item,
            discountValue: item.daysToExpiry <= 3 ? 20 : 15,
            discountType: 'percentage',
            loading: false,
            appliedDiscountPrice: item.batchId?.discountedPrice || null,
        });
    };

    const handleApplyDiscount = async () => {
        if (!discountModal.item || !discountModal.item.batchId?._id) return;

        if (discountModal.discountValue < 0) {
            addToast('Discount cannot be negative.', 'warning');
            return;
        }

        if (discountModal.discountType === 'percentage' && discountModal.discountValue >= 100) {
            addToast('Percentage discount must be less than 100%.', 'warning');
            return;
        }

        if (discountModal.discountType === 'fixed' && discountModal.item.productId?.price && discountModal.discountValue >= discountModal.item.productId.price) {
            addToast('Fixed discount cannot exceed the product base price.', 'warning');
            return;
        }

        setDiscountModal(prev => ({ ...prev, loading: true }));

        try {
            const response = await expiryApi.applyBatchDiscount(discountModal.item.batchId._id, {
                discountType: discountModal.discountType,
                discountValue: discountModal.discountValue,
            });

            setDiscountModal(prev => ({ ...prev, loading: false, appliedDiscountPrice: response.data.discountedPrice }));
            addToast(`Discounted price set to ₹${response.data.discountedPrice.toFixed(2)}`, 'success');

            await markAction(discountModal.item._id, 'in_progress', { mode: 'direct_discount', discountedPrice: response.data.discountedPrice });
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to apply discount', 'error');
            setDiscountModal(prev => ({ ...prev, loading: false }));
        }
    };

    const handleRemoveDiscount = async () => {
        if (!discountModal.item || !discountModal.item.batchId?._id) return;

        setDiscountModal(prev => ({ ...prev, loading: true }));

        try {
            await expiryApi.applyBatchDiscount(discountModal.item.batchId._id, {
                remove: true
            });

            addToast(`Discount removed successfully`, 'success');
            setDiscountModal(prev => ({ ...prev, isOpen: false, loading: false, appliedDiscountPrice: null }));

            // Reload the queue to clear locally 
            loadAll();
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to remove discount', 'error');
            setDiscountModal(prev => ({ ...prev, loading: false }));
        }
    };

    const openCustomerModal = async (productId: string, productName: string, discountedPrice: number) => {
        setCustomerModal({
            isOpen: true,
            productId,
            productName,
            discountedPrice,
            customers: [],
            loading: true,
            notifying: false,
            notifyResult: null,
        });

        try {
            const response = await discountApi.getCustomers(productId, 30);
            setCustomerModal(prev => ({ ...prev, customers: response.data, loading: false }));
        } catch (error) {
            addToast('Failed to load customers', 'error');
            setCustomerModal(prev => ({ ...prev, loading: false }));
        }
    };

    const handleNotifyCustomers = async () => {
        if (!customerModal.productId || customerModal.discountedPrice === undefined) return;

        setCustomerModal(prev => ({ ...prev, notifying: true }));

        try {
            const response = await discountApi.notifyCustomers({
                productId: customerModal.productId,
                discountedPrice: customerModal.discountedPrice,
                expiryDays: 3,
            });

            setCustomerModal(prev => ({
                ...prev,
                notifying: false,
                notifyResult: { sent: response.data.sent, failed: response.data.failed }
            }));

            addToast(`Notified ${response.data.sent} customers!`, 'success');
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to notify customers', 'error');
            setCustomerModal(prev => ({ ...prev, notifying: false }));
        }
    };

    if (loading) {
        return (
            <div className="p-4">
                <div className="animate-pulse space-y-4">
                    <div className="h-20 bg-gray-200 rounded-2xl" />
                    <div className="h-44 bg-gray-200 rounded-2xl" />
                    <div className="h-44 bg-gray-200 rounded-2xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-48 pt-4">
            {/* Header: Command Center Header & Main KPI */}
            <div className="relative overflow-hidden bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-2xl shadow-red-500/5 group text-center md:text-left">
                <div className="absolute top-0 right-0 -mt-12 -mr-12 opacity-5 scale-150 rotate-12 transition-transform duration-700 pointer-events-none group-hover:rotate-0">
                    <Recycle size={300} className="text-red-500" />
                </div>

                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                                <span className="bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-[0.2em] animate-pulse">Live Radar</span>
                                <h2 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter">
                                    {t['Expiry Center']}
                                </h2>
                            </div>
                            <p className="text-gray-400 font-bold max-w-md mx-auto md:mx-0">
                                {t['Real-time detection of inventory loss. Take action to recover value.']}
                            </p>
                        </div>

                        <div className="flex flex-col items-center md:items-end">
                            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">{t['Immediate Loss Risk']}</p>
                            <div className="text-5xl md:text-6xl font-black text-red-600 tracking-tighter">
                                ₹{summary.totalValueAtRisk.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Quick Counts Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-10">
                        <div className="bg-red-50/50 dark:bg-red-900/10 p-4 rounded-3xl border border-red-100 dark:border-red-900/30 transition-transform hover:scale-[1.02]">
                            <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">{t['Expired']}</p>
                            <p className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tighter">{summary.expired}</p>
                        </div>
                        <div className="bg-orange-50/50 dark:bg-orange-900/10 p-4 rounded-3xl border border-orange-100 dark:border-orange-900/30 transition-transform hover:scale-[1.02]">
                            <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">{t['Urgent (3d)']}</p>
                            <p className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tighter">{summary.urgent_3d}</p>
                        </div>
                        <div className="bg-amber-50/50 dark:bg-amber-900/10 p-4 rounded-3xl border border-amber-100 dark:border-amber-900/30 transition-transform hover:scale-[1.02]">
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">{t['Next 7 Days']}</p>
                            <p className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tighter">{summary.week_7d}</p>
                        </div>
                        <div className="bg-gray-50/50 dark:bg-gray-800/50 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 transition-transform hover:scale-[1.02]">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{t['Coming 30d']}</p>
                            <p className="text-2xl font-black text-gray-900 dark:text-white leading-none tracking-tighter">{summary.month_30d}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Refresh Trigger */}
            <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-6 rounded-[2.5rem] font-black text-xl shadow-2xl hover:scale-[1.01] transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 group hover:ring-4 hover:ring-primary-green/20"
            >
                <RefreshCw size={24} className={refreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                {refreshing ? t['Scanning Inventory...'] : t['Recalculate Potential Loss']}
            </button>


            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* PRIORITY QUEUE SECTION */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="flex items-end justify-between px-4">
                        <div>
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                                <AlertTriangle className="text-amber-500" size={28} />
                                {t['Priority Risk Queue']}
                            </h3>
                            <p className="text-sm text-gray-400 font-bold ml-10 uppercase tracking-widest">
                                {topRiskItems.length} {t['Actions Pending']}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {topRiskItems.length === 0 ? (
                            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-16 text-center shadow-sm border border-gray-100 dark:border-gray-700">
                                <div className="bg-primary-green/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-primary-green">
                                    <CheckCircle2 size={48} />
                                </div>
                                <h4 className="text-xl font-black text-gray-900 dark:text-white mb-2">{t['Clean Sweep!']}</h4>
                                <p className="text-gray-500 font-bold">{t['All inventory items are currently healthy']}</p>
                            </div>
                        ) : (
                            topRiskItems.map((item) => {
                                // Decide color scale based on days
                                const isCritical = item.daysToExpiry <= 3;
                                const isWarning = item.daysToExpiry <= 7 && item.daysToExpiry > 3;
                                const barColor = isCritical ? 'from-red-500 to-red-600' : isWarning ? 'from-orange-400 to-orange-500' : 'from-amber-300 to-amber-400';

                                return (
                                    <div
                                        key={item._id}
                                        className="relative bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-xl shadow-black/5 flex flex-col md:flex-row overflow-hidden group hover:-translate-y-1 transition-all duration-300"
                                    >
                                        {/* Urgency Color Bar */}
                                        <div className={`w-full md:w-3 h-3 md:h-auto bg-gradient-to-b ${barColor}`} />

                                        <div className="flex-1 p-6 flex flex-col">
                                            {/* Product Identity */}
                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-2xl flex items-center justify-center text-3xl shadow-inner shadow-black/5">
                                                        {item.productId?.icon || '📦'}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xl font-black text-gray-900 dark:text-white leading-tight mb-1 group-hover:text-primary-green transition-colors">
                                                            {item.productId?.name}
                                                        </h4>
                                                        <div className="flex items-center gap-2">
                                                            <div className={`h-2 w-2 rounded-full ${isCritical ? 'bg-red-500 animate-ping' : isWarning ? 'bg-orange-500' : 'bg-amber-400'}`}></div>
                                                            <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${isCritical ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-amber-600'}`}>
                                                                {item.daysToExpiry < 0 ? t['Expired'] : `${item.daysToExpiry} ${t['days remaining']}`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => markAction(item._id, 'ignored')}
                                                    className="absolute md:relative top-4 right-4 md:top-0 md:right-0 p-3 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-300 hover:text-red-500 transition-all hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    title={t['Dismiss']}
                                                >
                                                    <X size={20} />
                                                </button>
                                            </div>

                                            {/* Metrics Row */}
                                            <div className="flex flex-wrap items-center gap-4 mb-8">
                                                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-4 py-2 rounded-2xl border border-gray-100 dark:border-gray-600 shadow-inner">
                                                    <ShoppingBag className="text-gray-400" size={16} />
                                                    <span className="text-sm font-black text-gray-900 dark:text-white">{item.batchId?.quantityAvailable} <span className="text-[10px] text-gray-400 font-bold uppercase">{item.productId?.unit}</span></span>
                                                </div>
                                                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/10 px-4 py-2 rounded-2xl border border-red-100 dark:border-red-900/20">
                                                    <DollarSign className="text-red-500" size={16} />
                                                    <span className="text-sm font-black text-red-600">₹{item.valueAtRisk.toLocaleString()} <span className="text-[10px] uppercase font-bold text-red-400">{t['Risk']}</span></span>
                                                </div>
                                                <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/10 px-4 py-2 rounded-2xl border border-indigo-100 dark:border-indigo-900/20">
                                                    <Tag className="text-indigo-500" size={16} />
                                                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">₹{item.batchId?.discountedPrice || (item.productId?.price && (item.productId.price * (1 - (item.daysToExpiry <= 3 ? 0.2 : 0.15))).toFixed(0))} <span className="text-[10px] uppercase">{t['Est. Deal']}</span></span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 mt-auto">
                                                <button
                                                    onClick={() => openDiscountModal(item)}
                                                    className="flex-1 min-w-[140px] px-6 py-4 rounded-2xl bg-gradient-to-r from-primary-green to-emerald-600 text-white font-black text-sm shadow-xl shadow-primary-green/20 hover:scale-[1.02] active:scale-95 transition-all outline-none flex items-center justify-center gap-2"
                                                >
                                                    <DollarSign size={18} />
                                                    {t['Apply Discount']}
                                                </button>
                                                <button
                                                    onClick={() => markAction(item._id, 'in_progress')}
                                                    className="px-6 py-4 rounded-2xl bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 text-gray-900 dark:text-white font-black text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <RefreshCw size={18} />
                                                    {t['Move to Progress']}
                                                </button>
                                                <button
                                                    onClick={() => markAction(item._id, 'done', { mode: 'bundle' })}
                                                    className="px-6 py-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black text-sm hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Layers size={18} />
                                                    {t['Bundle']}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* SNAPSHOT & HISTORY SECTION */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden px-8 py-10">
                        <div className="mb-10 text-center">
                            <div className="bg-primary-green/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-primary-green">
                                <Recycle size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white">
                                {t['Recovery Snapshot']}
                            </h3>
                            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.2em]">{t['Last 30 Days Activity']}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="p-6 rounded-3xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{t['Loss Value']}</p>
                                    <p className="text-3xl font-black text-red-700">₹{wasteKPI.totalWasteValue.toLocaleString()}</p>
                                </div>
                                <AlertTriangle className="text-red-200" size={40} />
                            </div>

                            <div className="p-6 rounded-3xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{t['Volume Lost']}</p>
                                    <p className="text-3xl font-black text-amber-700">{wasteKPI.totalWasteQty.toFixed(1)}</p>
                                </div>
                                <ShoppingBag className="text-amber-200" size={40} />
                            </div>

                            <div className="p-6 rounded-3xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">{t['Recovered']}</p>
                                    <p className="text-3xl font-black text-green-700">{wasteKPI.recoveredActions}</p>
                                </div>
                                <CheckCircle2 className="text-green-200" size={40} />
                            </div>
                        </div>

                        <div className="mt-12 pt-10 border-t border-gray-100 dark:border-gray-700">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                                {t['Recent Waste Logs']}
                                <button className="text-primary-green hover:underline">{t['View All']}</button>
                            </h4>

                            {translatedWasteHistory.length === 0 ? (
                                <div className="text-center py-6 text-gray-500 font-bold italic">
                                    {t['Clean history']}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {translatedWasteHistory.map((entry) => (
                                        <div key={entry._id} className="flex items-center gap-4 group cursor-pointer">
                                            <div className="w-10 h-10 bg-gray-50 dark:bg-gray-700 rounded-xl flex items-center justify-center text-red-500 shrink-0 group-hover:scale-110 transition-transform">
                                                <Trash2 size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1">{entry.productId?.name}</p>
                                                <p className="text-[10px] text-gray-400 font-black uppercase">{entry.reason} • {new Date(entry.loggedAt).toLocaleDateString()}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-red-600 tracking-tighter">- ₹{entry.estimatedLoss.toLocaleString()}</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">{t['Qty']} {entry.quantity}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* MANUAL LOG SECTION */}
            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-700 p-8 md:p-12 transition-all duration-500 hover:shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl text-red-500">
                        <Trash2 size={24} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-widest text-sm">
                        {t['Record Stock Loss']}
                    </h3>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-2">{t['Target Batch']}</label>
                        <select
                            value={wasteForm.batchId}
                            onChange={(e) => setWasteForm((prev) => ({ ...prev, batchId: e.target.value }))}
                            className="w-full px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none text-sm font-black focus:ring-4 focus:ring-red-500/10 transition-all"
                        >
                            <option value="">{t['Choose a risky batch...']}</option>
                            {translatedQueue.map((item) => (
                                <option key={item._id} value={item.batchId?._id}>{item.productId?.name} ({item.batchId?.quantityAvailable})</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-2">{t['Loss Volume']}</label>
                            <input
                                value={wasteForm.quantity}
                                onChange={(e) => setWasteForm((prev) => ({ ...prev, quantity: e.target.value }))}
                                className="w-full px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none text-sm font-black focus:ring-4 focus:ring-red-500/10 transition-all font-mono"
                                type="number"
                                min="0"
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-2">{t['Loss Signature']}</label>
                            <select
                                value={wasteForm.reason}
                                onChange={(e) => setWasteForm((prev) => ({ ...prev, reason: e.target.value as WasteLogItem['reason'] }))}
                                className="w-full px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none text-sm font-black focus:ring-4 focus:ring-red-500/10 transition-all"
                            >
                                <option value="expired">{t['Expired']}</option>
                                <option value="damaged">{t['Damaged']}</option>
                                <option value="spoilage">{t['Spoilage']}</option>
                                <option value="leakage">{t['Leakage']}</option>
                                <option value="return_rejected">{t['Return Rejected']}</option>
                                <option value="other">{t['Other']}</option>
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={handleLogWaste}
                        className="w-full rounded-[2rem] border-2 border-red-500 text-red-500 bg-white dark:bg-gray-800 py-5 text-lg font-black transition-all hover:bg-red-500 hover:text-white flex items-center justify-center gap-3 mt-4 active:scale-95 shadow-lg shadow-red-500/5 group"
                    >
                        <Trash2 size={24} className="group-hover:scale-110 transition-transform" />
                        {t['Finalize Loss Entry']}
                    </button>
                </div>
            </div>

            {/* MODALS: Modals separated for clarity but inside main div */}
            {discountModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-300">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white">Batch Discount</h3>
                            <button onClick={() => setDiscountModal(prev => ({ ...prev, isOpen: false }))} className="p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-2xl transition-colors">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        {discountModal.item && (
                            <div className="space-y-6">
                                <div className="bg-primary-green/10 p-6 rounded-[2rem] border border-primary-green/20">
                                    <p className="font-black text-gray-900 dark:text-white text-lg">{discountModal.item?.productId?.name}</p>
                                    <p className="text-sm font-bold text-primary-green uppercase tracking-widest mt-1">
                                        {(discountModal.item?.daysToExpiry ?? 0) <= 3 ? '⚠️ Imminent Expiry' : `${discountModal.item?.daysToExpiry} days remaining`}
                                    </p>
                                </div>

                                {!discountModal.appliedDiscountPrice ? (
                                    <>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Reduce Price By {discountModal.discountType === 'percentage' ? '%' : '₹'}</label>
                                                <input
                                                    type="number"
                                                    value={discountModal.discountValue}
                                                    onChange={(e) => setDiscountModal(prev => ({ ...prev, discountValue: Number(e.target.value) }))}
                                                    className="w-full px-5 py-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-primary-green/50 outline-none text-xl font-black text-gray-900 dark:text-white transition-all"
                                                    min={1}
                                                    max={discountModal.discountType === 'percentage' ? 99 : 9999}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setDiscountModal(prev => ({ ...prev, discountType: 'percentage' }))}
                                                className={`flex-1 py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all ${discountModal.discountType === 'percentage' ? 'bg-primary-green text-white shadow-xl shadow-primary-green/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                                            >
                                                Percentage %
                                            </button>
                                            <button
                                                onClick={() => setDiscountModal(prev => ({ ...prev, discountType: 'fixed' }))}
                                                className={`flex-1 py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all ${discountModal.discountType === 'fixed' ? 'bg-primary-green text-white shadow-xl shadow-primary-green/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                                            >
                                                Fixed Amount ₹
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleApplyDiscount}
                                            disabled={discountModal.loading}
                                            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-5 rounded-[2rem] font-black text-lg shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 mt-4"
                                        >
                                            {discountModal.loading ? 'Synchronizing...' : `Activate Discount`}
                                        </button>
                                    </>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="bg-green-50 dark:bg-green-900/10 border-2 border-green-200 dark:border-green-800 p-8 rounded-[2rem] text-center shadow-inner">
                                            <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-4">New Campaign Price</p>
                                            <span className="text-5xl font-black text-green-700 dark:text-green-400 tracking-tighter">
                                                ₹{discountModal.appliedDiscountPrice?.toLocaleString()}
                                            </span>
                                            <p className="text-xs font-bold text-gray-500 mt-4 max-w-[200px] mx-auto">
                                                All customers will now see this discounted price in the billing cart.
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => discountModal.item && discountModal.appliedDiscountPrice !== null && openCustomerModal(
                                                discountModal.item.productId?._id || '',
                                                discountModal.item.productId?.name || '',
                                                discountModal.appliedDiscountPrice
                                            )}
                                            disabled={!discountModal.item || discountModal.appliedDiscountPrice === null}
                                            className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-indigo-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            <Send size={20} />
                                            Notify All Customers
                                        </button>

                                        <button
                                            onClick={handleRemoveDiscount}
                                            disabled={discountModal.loading}
                                            className="w-full bg-red-50 dark:bg-red-900/10 text-red-600 border border-red-100 dark:border-red-900/20 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
                                        >
                                            <Trash2 size={18} />
                                            {discountModal.loading ? 'Removing...' : 'Clear Discount'}
                                        </button>

                                        <button
                                            onClick={() => setDiscountModal(prev => ({ ...prev, isOpen: false }))}
                                            className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white py-4 rounded-2xl font-black text-sm"
                                        >
                                            Done
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {customerModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-widest uppercase text-xs">Broadcast Campaign</h3>
                            <button onClick={() => setCustomerModal(prev => ({ ...prev, isOpen: false }))} className="p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 rounded-2xl transition-colors">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-[2rem] mb-8 border border-indigo-100 dark:border-indigo-900/20">
                            <p className="font-black text-indigo-900 dark:text-indigo-400 line-clamp-1">{customerModal.productName}</p>
                            <p className="text-sm font-bold text-indigo-400 mt-1 uppercase tracking-widest">
                                Broadcasting to: <span className="text-indigo-700 dark:text-indigo-200">{customerModal.customers.length} Shop Customers</span>
                            </p>
                        </div>

                        {customerModal.notifyResult ? (
                            <div className="bg-green-50 dark:bg-green-900/10 p-8 rounded-[2rem] text-center border-2 border-green-200 dark:border-green-800 animate-bounce">
                                <CheckCircle2 size={60} className="mx-auto text-green-500 mb-4" />
                                <p className="text-2xl font-black text-green-700 dark:text-green-400">Campaign Sent!</p>
                                <p className="text-sm font-bold text-gray-500 mt-2">Delivered to {customerModal.notifyResult?.sent} users.</p>
                            </div>
                        ) : customerModal.loading ? (
                            <div className="py-20 text-center">
                                <RefreshCw className="animate-spin w-12 h-12 text-primary-green mx-auto mb-4" />
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Syncing Shop Database...</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex-1 overflow-y-auto mb-8 px-2 space-y-3 custom-scrollbar">
                                    {customerModal.customers.map((customer) => (
                                        <div key={customer._id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-white dark:border-gray-600 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white font-black text-xs">
                                                    {customer.name[0]}
                                                </div>
                                                <div>
                                                    <p className="font-black text-gray-900 dark:text-white text-sm">{customer.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold">{customer.phoneNumber}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">{customer.purchaseCount}x</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={handleNotifyCustomers}
                                    disabled={customerModal.notifying}
                                    className="w-full bg-primary-green text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-primary-green/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    <Send size={20} />
                                    {customerModal.notifying ? 'Launching...' : `Broadcast to ${customerModal.customers.length} Customers`}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpiryWastePage;

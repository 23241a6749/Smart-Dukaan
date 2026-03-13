import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Recycle, RefreshCw, Trash2, ShoppingBag, DollarSign, X } from 'lucide-react';
import { expiryApi, wasteApi, type ExpiryQueueItem, type ExpiryQueueSummary, type WasteLogItem } from '../../services/api';
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
        <div className="space-y-6 pb-48">
            {/* Header Block: Title */}
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-sm">
                <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                    {t['Expiry & Waste Command Center']}
                </h2>
            </div>

            {/* Stats Block: At Risk Value */}
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-xl shadow-red-500/5 flex items-center justify-between group overflow-hidden relative">
                <div className="absolute right-0 top-0 -mr-8 -mt-8 opacity-5 group-hover:rotate-12 transition-transform duration-700 pointer-events-none">
                    <Recycle size={180} className="text-red-500" />
                </div>
                <div className="flex items-center gap-5 relative z-10">
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl text-red-500 transition-transform group-hover:scale-110">
                        <AlertTriangle size={32} />
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1 leading-none">{t['At Risk Value']}</p>
                        <p className="text-3xl md:text-4xl font-black text-red-600 leading-none">₹{summary.totalValueAtRisk.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Action Block: Refresh */}
            <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-5 rounded-[2rem] font-black text-xl shadow-2xl hover:scale-[1.01] transition-transform active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
            >
                <RefreshCw size={24} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? t['Refreshing...'] : t['Refresh System']}
            </button>


            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <AlertTriangle className="text-amber-500" size={18} />
                                {t['Priority Risk Queue']}
                            </h3>
                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wider">
                                {topRiskItems.length} {t['High Risk Items']}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            {topRiskItems.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <p className="text-gray-500 font-medium">{t['No inventory items currently at risk']}</p>
                                </div>
                            ) : (
                                topRiskItems.map((item) => (
                                    <div key={item._id} className="p-4 rounded-xl border border-gray-100 bg-white hover:border-green-200 hover:shadow-md transition-all group">
                                        {/* Product info row */}
                                        <div className="mb-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-gray-900 group-hover:text-primary-green transition-colors">{item.productId?.name}</h4>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${item.daysToExpiry <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {item.daysToExpiry < 0 ? t['Expired'] : `${item.daysToExpiry} ${t['days left']}`}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                                                <span className="flex items-center gap-1.5"><ShoppingBag size={14} /> {t['Qty:']} <strong>{item.batchId?.quantityAvailable}</strong></span>
                                                <span className="flex items-center gap-1.5"><DollarSign size={14} /> {t['Value at Risk:']} <strong>₹{item.valueAtRisk.toLocaleString()}</strong></span>
                                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">{t['Suggest:']} {item.suggestedAction}</span>
                                            </div>
                                        </div>
                                        {/* Horizontal action bar */}
                                        <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between gap-2 overflow-hidden">
                                            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                                <button
                                                    onClick={() => markAction(item._id, 'in_progress')}
                                                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-[10px] font-bold hover:bg-gray-50 transition-colors whitespace-nowrap flex-shrink"
                                                >
                                                    {t['Mark In Progress']}
                                                </button>
                                                <button
                                                    onClick={() => markAction(item._id, 'done', { mode: 'discount' })}
                                                    className="px-2.5 py-1.5 rounded-lg bg-green-50 text-primary-green text-[10px] font-bold hover:bg-green-100 transition-colors whitespace-nowrap flex-shrink"
                                                >
                                                    {t['Apply Discount']}
                                                </button>
                                                <button
                                                    onClick={() => markAction(item._id, 'done', { mode: 'bundle' })}
                                                    className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold hover:bg-blue-100 transition-colors whitespace-nowrap flex-shrink"
                                                >
                                                    {t['Start Bundle']}
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => markAction(item._id, 'ignored')}
                                                className="p-1.5 rounded-lg border border-red-100 text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                                title={t['Ignore']}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Recycle className="text-primary-green" size={18} />
                                {t['Waste & Recovery Snapshot']}
                            </h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                                    <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-1">{t['Waste Value (30d)']}</p>
                                    <p className="text-2xl font-black text-red-700">₹{wasteKPI.totalWasteValue.toLocaleString()}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                                    <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">{t['Waste Qty (30d)']}</p>
                                    <p className="text-2xl font-black text-amber-700">{wasteKPI.totalWasteQty.toFixed(1)}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-green-50 border border-green-100">
                                    <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">{t['Recovered Actions']}</p>
                                    <p className="text-2xl font-black text-green-700">{wasteKPI.recoveredActions}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">{t['Recent Waste Logs']}</h4>
                                {translatedWasteHistory.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic py-4">{t['No recent waste logs found']}</p>
                                ) : (
                                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                                        {translatedWasteHistory.map((entry) => (
                                            <div key={entry._id} className="p-3 bg-white flex justify-between items-center hover:bg-gray-50 transition-colors">
                                                <div>
                                                    <p className="font-bold text-gray-900 text-sm">{entry.productId?.name}</p>
                                                    <p className="text-xs text-gray-500">{entry.reason} • {new Date(entry.loggedAt).toLocaleDateString()}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-red-600">₹{entry.estimatedLoss.toLocaleString()}</p>
                                                    <p className="text-xs text-gray-400">{t['Qty:']} {entry.quantity}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ring-1 ring-red-100">
                    <h3 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                        <Trash2 className="text-red-500" size={20} />
                        {t['Log Inventory Loss']}
                    </h3>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Select Batch']}</label>
                            <select
                                value={wasteForm.batchId}
                                onChange={(e) => setWasteForm((prev) => ({ ...prev, batchId: e.target.value }))}
                                className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-red-100 transition-all"
                            >
                                <option value="">{t['Choose a risky batch...']}</option>
                                {translatedQueue.map((item) => (
                                    <option key={item._id} value={item.batchId?._id}>{item.productId?.name} ({item.batchId?.quantityAvailable})</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Quantity']}</label>
                                <input value={wasteForm.quantity} onChange={(e) => setWasteForm((prev) => ({ ...prev, quantity: e.target.value }))} className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-red-100 transition-all" type="number" min="0" placeholder="0" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Loss Reason']}</label>
                                <select value={wasteForm.reason} onChange={(e) => setWasteForm((prev) => ({ ...prev, reason: e.target.value as WasteLogItem['reason'] }))} className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-red-100 transition-all">
                                    <option value="expired">{t['Expired']}</option>
                                    <option value="damaged">{t['Damaged']}</option>
                                    <option value="spoilage">{t['Spoilage']}</option>
                                    <option value="leakage">{t['Leakage']}</option>
                                    <option value="return_rejected">{t['Return Rejected']}</option>
                                    <option value="other">{t['Other']}</option>
                                </select>
                            </div>
                        </div>

                        <button onClick={handleLogWaste} className="w-full rounded-2xl border-2 border-red-500 text-red-500 bg-white py-4 text-sm font-black transition-all hover:bg-red-500 hover:text-white flex items-center justify-center gap-2 mt-2">
                            <Trash2 size={18} />
                            {t['Confirm Waste Log']}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExpiryWastePage;

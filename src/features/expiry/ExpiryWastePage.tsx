import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, PackageX, Recycle, RefreshCw, Save, Trash2, ShoppingBag, DollarSign, X, Plus } from 'lucide-react';
import { expiryApi, productApi, wasteApi, type ExpiryQueueItem, type ExpiryQueueSummary, type WasteLogItem } from '../../services/api';
import { useTranslate } from '../../hooks/useTranslate';
import { useLanguage } from '../../contexts/LanguageContext';

type ProductLite = {
    _id: string;
    name: string;
    stock: number;
    price: number;
    costPrice?: number;
};

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
    const [products, setProducts] = useState<ProductLite[]>([]);
    const [wasteHistory, setWasteHistory] = useState<WasteLogItem[]>([]);

    // Dynamic Translation Hooks
    const translatedProducts = useTranslate(products, ['name']);
    const translatedQueue = useTranslate(queue, ['productId.name', 'suggestedAction']);
    const translatedWasteHistory = useTranslate(wasteHistory, ['productId.name', 'reason']);

    const [wasteKPI, setWasteKPI] = useState<{ totalWasteValue: number; totalWasteQty: number; recoveredActions: number }>({
        totalWasteValue: 0,
        totalWasteQty: 0,
        recoveredActions: 0,
    });

    const [batchForm, setBatchForm] = useState({
        productId: '',
        quantity: '',
        costPricePerUnit: '',
        expiryDate: '',
        batchCode: '',
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
        const [productsRes, queueRes, kpiRes, wasteHistoryRes, wasteKPIRes] = await Promise.all([
            productApi.getAll(),
            expiryApi.getQueue({ status: 'open' }),
            expiryApi.getKPI(),
            wasteApi.getHistory(),
            wasteApi.getKPI(),
        ]);
        setProducts((productsRes.data || []) as ProductLite[]);
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

    const handleCreateBatch = async () => {
        if (!batchForm.productId || Number(batchForm.quantity) <= 0) return;
        try {
            await expiryApi.createBatch({
                productId: batchForm.productId,
                quantity: Number(batchForm.quantity),
                costPricePerUnit: batchForm.costPricePerUnit ? Number(batchForm.costPricePerUnit) : undefined,
                expiryDate: batchForm.expiryDate || undefined,
                batchCode: batchForm.batchCode || undefined,
            });
            setBatchForm({ productId: '', quantity: '', costPricePerUnit: '', expiryDate: '', batchCode: '' });
            await handleRefresh();
        } catch (error) {
            console.error('Failed to create batch', error);
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
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">{t['Expiry & Waste Command Center']}</h2>
                    <p className="text-sm text-gray-500 mt-1">{t['Monitor and manage aging inventory and waste logs']}</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-green text-white font-bold shadow-sm transition-all hover:bg-green-700 disabled:opacity-50"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? t['Refreshing...'] : t['Refresh System']}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <MetricCard
                    icon={<AlertTriangle size={20} />}
                    label={t['Urgent (0-3d)']}
                    value={summary.urgent_3d}
                    color="bg-red-100 text-red-700"
                    bgColor="bg-white"
                />
                <MetricCard
                    icon={<Clock3 size={20} />}
                    label={t['This Week']}
                    value={summary.week_7d}
                    color="bg-amber-100 text-amber-700"
                    bgColor="bg-white"
                />
                <MetricCard
                    icon={<CalendarClock size={20} />}
                    label={t['This Month']}
                    value={summary.month_30d}
                    color="bg-blue-100 text-blue-700"
                    bgColor="bg-white"
                />
                <MetricCard
                    icon={<PackageX size={20} />}
                    label={t['Expired']}
                    value={summary.expired}
                    color="bg-gray-100 text-gray-700"
                    bgColor="bg-white"
                />
                <MetricCard
                    icon={<Recycle size={20} />}
                    label={t['At Risk Value']}
                    value={`₹${summary.totalValueAtRisk.toLocaleString()}`}
                    color="bg-green-100 text-green-700"
                    bgColor="bg-white"
                />
            </div>

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
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold text-gray-900 group-hover:text-primary-green transition-colors">{item.productId?.name}</h4>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${item.daysToExpiry <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                        {item.daysToExpiry < 0 ? t['Expired'] : `${item.daysToExpiry} ${t['days left']}`}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                                                    <span className="flex items-center gap-1.5"><ShoppingBag size={14} /> {t['Qty:']} <strong>{item.batchId?.quantityAvailable}</strong></span>
                                                    <span className="flex items-center gap-1.5"><DollarSign size={14} /> {t['Value at Risk:']} <strong>₹{item.valueAtRisk.toLocaleString()}</strong></span>
                                                    <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">{t['Suggest:']} {item.suggestedAction}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => markAction(item._id, 'in_progress')}
                                                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors"
                                                >
                                                    {t['Mark In Progress']}
                                                </button>
                                                <button
                                                    onClick={() => markAction(item._id, 'done', { mode: 'discount' })}
                                                    className="px-3 py-1.5 rounded-lg bg-green-50 text-primary-green text-xs font-bold hover:bg-green-100 transition-colors"
                                                >
                                                    {t['Apply Discount']}
                                                </button>
                                                <button
                                                    onClick={() => markAction(item._id, 'done', { mode: 'bundle' })}
                                                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
                                                >
                                                    {t['Start Bundle']}
                                                </button>
                                                <button
                                                    onClick={() => markAction(item._id, 'ignored')}
                                                    className="p-1.5 rounded-lg border border-red-100 text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                    title={t['Ignore']}
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
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

                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                            <Plus className="text-primary-green" size={20} />
                            {t['Add Stock Batch']}
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Product Select']}</label>
                                <select
                                    value={batchForm.productId}
                                    onChange={(e) => setBatchForm((prev) => ({ ...prev, productId: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-green-100 transition-all"
                                >
                                    <option value="">{t['Choose a product...']}</option>
                                    {translatedProducts.map((p) => (
                                        <option key={p._id} value={p._id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Quantity']}</label>
                                    <input value={batchForm.quantity} onChange={(e) => setBatchForm((prev) => ({ ...prev, quantity: e.target.value }))} className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-green-100 transition-all" type="number" min="1" placeholder="0" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Cost/Unit']}</label>
                                    <input value={batchForm.costPricePerUnit} onChange={(e) => setBatchForm((prev) => ({ ...prev, costPricePerUnit: e.target.value }))} className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-green-100 transition-all" type="number" min="0" placeholder="₹ 0" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Expiry Date']}</label>
                                    <input value={batchForm.expiryDate} onChange={(e) => setBatchForm((prev) => ({ ...prev, expiryDate: e.target.value }))} className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-green-100 transition-all" type="date" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t['Batch Code']}</label>
                                    <input value={batchForm.batchCode} onChange={(e) => setBatchForm((prev) => ({ ...prev, batchCode: e.target.value }))} className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none text-sm font-bold focus:ring-2 focus:ring-green-100 transition-all" placeholder="Optional" />
                                </div>
                            </div>

                            <button onClick={handleCreateBatch} className="w-full rounded-2xl bg-primary-green text-white py-4 text-sm font-black shadow-lg shadow-green-100 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 mt-2">
                                <Save size={18} />
                                {t['Register New Batch']}
                            </button>
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
        </div>
    );
};

const MetricCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: string;
    bgColor?: string;
}> = ({ icon, label, value, color, bgColor = "bg-white" }) => {
    return (
        <div className={`${bgColor} p-5 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md`}>
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 ${color} rounded-lg`}>
                    {icon}
                </div>
                <span className="text-gray-500 text-[11px] font-black uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-2xl font-black text-gray-900">{value}</div>
        </div>
    );
};

export default ExpiryWastePage;

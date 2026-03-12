import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, PackageX, Recycle, RefreshCw, Save, Trash2 } from 'lucide-react';
import { expiryApi, productApi, wasteApi, type ExpiryQueueItem, type ExpiryQueueSummary, type WasteLogItem } from '../../services/api';

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
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [summary, setSummary] = useState<ExpiryQueueSummary>(initialSummary);
    const [queue, setQueue] = useState<ExpiryQueueItem[]>([]);
    const [products, setProducts] = useState<ProductLite[]>([]);
    const [wasteHistory, setWasteHistory] = useState<WasteLogItem[]>([]);
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

    const topRiskItems = useMemo(() => queue.slice(0, 6), [queue]);

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
        <div className="p-4 safe-area-bottom space-y-5 pb-32">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-black text-gray-900">Expiry & Waste Command Center</h2>
                </div>
                <button
                    onClick={handleRefresh}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-green text-white font-bold"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <MetricCard icon={<AlertTriangle size={16} />} label="Urgent (0-3d)" value={summary.urgent_3d} color="bg-red-50 text-red-700" />
                <MetricCard icon={<Clock3 size={16} />} label="This Week" value={summary.week_7d} color="bg-orange-50 text-orange-700" />
                <MetricCard icon={<CalendarClock size={16} />} label="This Month" value={summary.month_30d} color="bg-yellow-50 text-yellow-700" />
                <MetricCard icon={<PackageX size={16} />} label="Expired" value={summary.expired} color="bg-gray-100 text-gray-700" />
                <MetricCard icon={<Recycle size={16} />} label="At Risk Value" value={`₹${summary.totalValueAtRisk.toFixed(0)}`} color="bg-emerald-50 text-emerald-700" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-black text-lg">Priority Risk Queue</h3>
                        <span className="text-xs text-gray-500">Top {topRiskItems.length} items</span>
                    </div>
                    <div className="space-y-3">
                        {topRiskItems.length === 0 && (
                            <div className="p-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold">No open risk items right now.</div>
                        )}
                        {topRiskItems.map((item) => (
                            <div key={item._id} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="font-bold text-gray-900">{item.productId?.name}</p>
                                        <p className="text-xs text-gray-500">
                                            Qty {item.batchId?.quantityAvailable} • {item.daysToExpiry < 0 ? 'Expired' : `${item.daysToExpiry} days left`} • Risk ₹{item.valueAtRisk.toFixed(0)}
                                        </p>
                                    </div>
                                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-white border border-gray-200">{item.suggestedAction}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button onClick={() => markAction(item._id, 'in_progress')} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">In Progress</button>
                                    <button onClick={() => markAction(item._id, 'done', { mode: 'discount' })} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">Discount Done</button>
                                    <button onClick={() => markAction(item._id, 'done', { mode: 'bundle' })} className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold">Bundle Done</button>
                                    <button onClick={() => markAction(item._id, 'ignored')} className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs font-bold">Ignore</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                        <h3 className="font-black text-base mb-3">Add Stock Batch</h3>
                        <div className="space-y-2">
                            <select
                                value={batchForm.productId}
                                onChange={(e) => setBatchForm((prev) => ({ ...prev, productId: e.target.value }))}
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm"
                            >
                                <option value="">Select product</option>
                                {products.map((p) => (
                                    <option key={p._id} value={p._id}>{p.name}</option>
                                ))}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={batchForm.quantity} onChange={(e) => setBatchForm((prev) => ({ ...prev, quantity: e.target.value }))} className="rounded-xl border border-gray-200 p-2.5 text-sm" type="number" min="1" placeholder="Qty" />
                                <input value={batchForm.costPricePerUnit} onChange={(e) => setBatchForm((prev) => ({ ...prev, costPricePerUnit: e.target.value }))} className="rounded-xl border border-gray-200 p-2.5 text-sm" type="number" min="0" placeholder="Cost/unit" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={batchForm.expiryDate} onChange={(e) => setBatchForm((prev) => ({ ...prev, expiryDate: e.target.value }))} className="rounded-xl border border-gray-200 p-2.5 text-sm" type="date" />
                                <input value={batchForm.batchCode} onChange={(e) => setBatchForm((prev) => ({ ...prev, batchCode: e.target.value }))} className="rounded-xl border border-gray-200 p-2.5 text-sm" placeholder="Batch code" />
                            </div>
                            <button onClick={handleCreateBatch} className="w-full rounded-xl bg-primary-green text-white py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2"><Save size={15} /> Save Batch</button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                        <h3 className="font-black text-base mb-3">Log Waste</h3>
                        <div className="space-y-2">
                            <select
                                value={wasteForm.batchId}
                                onChange={(e) => setWasteForm((prev) => ({ ...prev, batchId: e.target.value }))}
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm"
                            >
                                <option value="">Select risky batch</option>
                                {queue.map((item) => (
                                    <option key={item._id} value={item.batchId._id}>{item.productId.name} ({item.batchId.quantityAvailable})</option>
                                ))}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={wasteForm.quantity} onChange={(e) => setWasteForm((prev) => ({ ...prev, quantity: e.target.value }))} className="rounded-xl border border-gray-200 p-2.5 text-sm" type="number" min="0" placeholder="Qty" />
                                <select value={wasteForm.reason} onChange={(e) => setWasteForm((prev) => ({ ...prev, reason: e.target.value as WasteLogItem['reason'] }))} className="rounded-xl border border-gray-200 p-2.5 text-sm">
                                    <option value="expired">Expired</option>
                                    <option value="damaged">Damaged</option>
                                    <option value="spoilage">Spoilage</option>
                                    <option value="leakage">Leakage</option>
                                    <option value="return_rejected">Return Rejected</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <button onClick={handleLogWaste} className="w-full rounded-xl bg-red-600 text-white py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2"><Trash2 size={15} /> Log Waste</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <h3 className="font-black text-lg mb-3">Waste & Recovery Snapshot</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <MetricCard icon={<Trash2 size={16} />} label="Waste Value (30d)" value={`₹${wasteKPI.totalWasteValue.toFixed(0)}`} color="bg-red-50 text-red-700" />
                    <MetricCard icon={<PackageX size={16} />} label="Waste Qty (30d)" value={wasteKPI.totalWasteQty.toFixed(2)} color="bg-orange-50 text-orange-700" />
                    <MetricCard icon={<CheckCircle2 size={16} />} label="Recovered Actions" value={wasteKPI.recoveredActions} color="bg-emerald-50 text-emerald-700" />
                </div>

                <div className="space-y-2">
                    {wasteHistory.length === 0 && <div className="text-sm text-gray-500">No waste entries logged yet.</div>}
                    {wasteHistory.map((entry) => (
                        <div key={entry._id} className="text-sm p-2.5 rounded-lg bg-gray-50 border border-gray-100 flex justify-between gap-3">
                            <span className="font-semibold text-gray-800">{entry.productId?.name} • {entry.reason}</span>
                            <span className="text-gray-600">Qty {entry.quantity} • Loss ₹{entry.estimatedLoss.toFixed(0)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string }> = ({ icon, label, value, color }) => {
    return (
        <div className={`rounded-2xl p-3 border border-transparent ${color}`}>
            <div className="flex items-center gap-2 text-xs font-semibold opacity-90">
                {icon}
                <span>{label}</span>
            </div>
            <p className="text-xl font-black mt-1">{value}</p>
        </div>
    );
};

export default ExpiryWastePage;

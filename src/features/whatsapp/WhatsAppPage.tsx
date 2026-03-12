import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
    Activity,
    AlertTriangle,
    Bell,
    Clock3,
    Headphones,
    MessageCircle,
    Mic,
    PackageCheck,
    Pencil,
    Plus,
    ReceiptText,
    RefreshCcw,
    Save,
    ShoppingBag,
    X,
} from 'lucide-react';

import { productApi, whatsappApi, type WhatsAppOrder } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:5001';

type LiveEvent = {
    type: string;
    data: Record<string, unknown>;
    timestamp: string;
};

type DashboardDiagnostic = {
    source: string;
    message: string;
    statusCode?: number;
    at: string;
};

type ItemEditorRow = {
    productId: string;
    name: string;
    quantity: number;
};

type ProductOption = {
    _id: string;
    name: string;
    stock: number;
};

type OrderFilter = 'all' | 'needs_review' | 'awaiting_choice' | 'ready_to_bill';

type DashboardAnalytics = {
    pendingTotal: number;
    activeDebtors: number;
    ordersToday: number;
    needsReviewCount: number;
    awaitingChoiceCount: number;
    readyToBillCount: number;
};

const statusOptions: Array<WhatsAppOrder['status']> = ['confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];

const statusClasses: Record<WhatsAppOrder['status'], string> = {
    received: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
    preparing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
    delivered: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
    cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
};

const initialAnalytics: DashboardAnalytics = {
    pendingTotal: 0,
    activeDebtors: 0,
    ordersToday: 0,
    needsReviewCount: 0,
    awaitingChoiceCount: 0,
    readyToBillCount: 0,
};

function isOrderNeedsReview(order: WhatsAppOrder): boolean {
    return (order.reviewState ?? 'none') === 'needs_manual_review';
}

function isOrderAwaitingChoice(order: WhatsAppOrder): boolean {
    return (order.reviewState ?? 'none') === 'awaiting_customer_choice';
}

function isOrderReadyToBill(order: WhatsAppOrder): boolean {
    return !order.convertedBillId && (order.reviewState ?? 'none') === 'none' && order.status !== 'cancelled' && order.items.length > 0 && order.totalAmount > 0;
}

export default function WhatsAppPage() {
    const { addToast } = useToast();
    const [orders, setOrders] = useState<WhatsAppOrder[]>([]);
    const [events, setEvents] = useState<LiveEvent[]>([]);
    const [analytics, setAnalytics] = useState<DashboardAnalytics>(initialAnalytics);
    const [loading, setLoading] = useState(true);
    const [sendingReminder, setSendingReminder] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [convertingId, setConvertingId] = useState<string | null>(null);
    const [diagnostics, setDiagnostics] = useState<DashboardDiagnostic[]>([]);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [savingItemsId, setSavingItemsId] = useState<string | null>(null);
    const [draftItemsByOrder, setDraftItemsByOrder] = useState<Record<string, ItemEditorRow[]>>({});
    const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
    const [newProductByOrder, setNewProductByOrder] = useState<Record<string, string>>({});
    const [activeFilter, setActiveFilter] = useState<OrderFilter>('all');
    const [orderMediaUrls, setOrderMediaUrls] = useState<Record<string, string>>({});
    const [loadingMediaId, setLoadingMediaId] = useState<string | null>(null);

    const addDiagnostic = (source: string, error: any) => {
        const entry: DashboardDiagnostic = {
            source,
            message: error?.response?.data?.message || error?.message || 'Unknown error',
            statusCode: error?.response?.status,
            at: new Date().toISOString(),
        };
        setDiagnostics((prev) => [entry, ...prev].slice(0, 12));
    };

    const loadDashboard = async () => {
        try {
            setLoading(true);
            const [ordersRes, analyticsRes] = await Promise.all([
                whatsappApi.getOrders(),
                whatsappApi.getAnalytics(),
            ]);
            setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
            setAnalytics({ ...initialAnalytics, ...analyticsRes.data });
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to load WhatsApp dashboard', 'error');
            addDiagnostic('loadDashboard', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboard();
    }, []);

    useEffect(() => {
        const loadProducts = async () => {
            try {
                const response = await productApi.getAll();
                const normalized = Array.isArray(response.data)
                    ? response.data.map((product: any) => ({
                        _id: String(product._id),
                        name: String(product.name),
                        stock: Number(product.stock || 0),
                    }))
                    : [];
                setProductOptions(normalized);
            } catch (error: any) {
                addDiagnostic('loadProducts', error);
            }
        };

        loadProducts();
    }, []);

    useEffect(() => {
        const socket = io(SOCKET_URL);
        socket.on('connect', () => {
            setEvents([{ type: 'SYSTEM', data: { message: 'WhatsApp live relay connected' }, timestamp: new Date().toISOString() }]);
        });
        socket.on('whatsapp-event', (event: LiveEvent) => {
            setEvents((prev) => [event, ...prev].slice(0, 20));
            if (event.type === 'NEW_ORDER' || event.type === 'ORDER_UPDATED') {
                loadDashboard();
            }
        });
        socket.on('connect_error', (error) => {
            addDiagnostic('socket', error);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const handleSendReminders = async () => {
        try {
            setSendingReminder(true);
            const res = await whatsappApi.broadcastReminders();
            addToast(`Sent ${res.data.sentCount} reminders. Skipped ${res.data.skippedOutsideWindow}.`, 'success');
            await loadDashboard();
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to send reminders', 'error');
            addDiagnostic('broadcastReminders', error);
        } finally {
            setSendingReminder(false);
        }
    };

    const handleStatusUpdate = async (orderId: string, status: WhatsAppOrder['status']) => {
        try {
            setUpdatingId(orderId);
            const res = await whatsappApi.updateOrderStatus(orderId, status);
            setOrders((prev) => prev.map((order) => order._id === orderId ? res.data : order));
            addToast(`Order marked ${status}`, 'success');
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to update order status', 'error');
            addDiagnostic('updateOrderStatus', error);
        } finally {
            setUpdatingId(null);
        }
    };

    const handleConvertToBill = async (orderId: string) => {
        try {
            setConvertingId(orderId);
            const res = await whatsappApi.convertOrderToBill(orderId);
            const updatedOrder = res.data?.order;
            if (updatedOrder?._id) {
                setOrders((prev) => prev.map((order) => order._id === orderId ? updatedOrder : order));
            } else {
                await loadDashboard();
            }
            addToast(
                res.data?.alreadyConverted
                    ? 'Order already linked to bill'
                    : 'Order converted to bill',
                'success'
            );
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to convert order to bill', 'error');
            addDiagnostic('convertToBill', error);
        } finally {
            setConvertingId(null);
        }
    };

    const handleLoadVoiceNote = async (order: WhatsAppOrder) => {
        try {
            if (orderMediaUrls[order._id]) return;
            setLoadingMediaId(order._id);
            const res = await whatsappApi.fetchOrderMedia(order._id);
            const mediaObjectUrl = URL.createObjectURL(res.data);
            setOrderMediaUrls((prev) => ({ ...prev, [order._id]: mediaObjectUrl }));
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to load voice note', 'error');
            addDiagnostic('loadVoiceNote', error);
        } finally {
            setLoadingMediaId(null);
        }
    };

    const startEditingItems = (order: WhatsAppOrder) => {
        setEditingOrderId(order._id);
        setDraftItemsByOrder((prev) => ({
            ...prev,
            [order._id]: order.items.map((item) => ({
                productId: item.productId,
                name: item.name,
                quantity: item.quantity,
            })),
        }));
    };

    const cancelEditingItems = (orderId: string) => {
        setEditingOrderId((current) => current === orderId ? null : current);
        setDraftItemsByOrder((prev) => {
            const next = { ...prev };
            delete next[orderId];
            return next;
        });
        setNewProductByOrder((prev) => {
            const next = { ...prev };
            delete next[orderId];
            return next;
        });
    };

    const updateDraftItemQuantity = (orderId: string, productId: string, quantity: number) => {
        const safeQty = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
        setDraftItemsByOrder((prev) => ({
            ...prev,
            [orderId]: (prev[orderId] || []).map((item) =>
                item.productId === productId ? { ...item, quantity: safeQty } : item
            ),
        }));
    };

    const removeDraftItem = (orderId: string, productId: string) => {
        setDraftItemsByOrder((prev) => ({
            ...prev,
            [orderId]: (prev[orderId] || []).filter((item) => item.productId !== productId),
        }));
    };

    const addDraftItem = (orderId: string) => {
        const selectedProductId = newProductByOrder[orderId];
        if (!selectedProductId) return;

        const selectedProduct = productOptions.find((product) => product._id === selectedProductId);
        if (!selectedProduct) return;

        setDraftItemsByOrder((prev) => {
            const current = prev[orderId] || [];
            const existing = current.find((item) => item.productId === selectedProduct._id);
            if (existing) {
                return {
                    ...prev,
                    [orderId]: current.map((item) =>
                        item.productId === selectedProduct._id
                            ? { ...item, quantity: item.quantity + 1 }
                            : item
                    ),
                };
            }

            return {
                ...prev,
                [orderId]: [...current, {
                    productId: selectedProduct._id,
                    name: selectedProduct.name,
                    quantity: 1,
                }],
            };
        });
    };

    const saveEditedItems = async (orderId: string) => {
        try {
            const draftItems = draftItemsByOrder[orderId] || [];
            if (!draftItems.length) {
                addToast('Keep at least one item in order', 'error');
                return;
            }

            setSavingItemsId(orderId);
            const payload = draftItems.map((item) => ({ productId: item.productId, quantity: item.quantity }));
            const response = await whatsappApi.updateOrderItems(orderId, payload);
            const updatedOrder = response.data as WhatsAppOrder;

            setOrders((prev) => prev.map((order) => order._id === orderId ? updatedOrder : order));
            addToast('Order items updated', 'success');
            cancelEditingItems(orderId);
        } catch (error: any) {
            addToast(error.response?.data?.message || 'Failed to update items', 'error');
            addDiagnostic('updateOrderItems', error);
        } finally {
            setSavingItemsId(null);
        }
    };

    const queueCounts = useMemo(() => {
        const needsReview = orders.filter((order) => isOrderNeedsReview(order)).length;
        const awaitingChoice = orders.filter((order) => isOrderAwaitingChoice(order)).length;
        const readyToBill = orders.filter((order) => isOrderReadyToBill(order)).length;
        return { needsReview, awaitingChoice, readyToBill };
    }, [orders]);

    const filteredOrders = useMemo(() => {
        if (activeFilter === 'needs_review') return orders.filter((order) => isOrderNeedsReview(order));
        if (activeFilter === 'awaiting_choice') return orders.filter((order) => isOrderAwaitingChoice(order));
        if (activeFilter === 'ready_to_bill') return orders.filter((order) => isOrderReadyToBill(order));
        return orders;
    }, [orders, activeFilter]);

    const todayRevenuePotential = useMemo(
        () => orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + order.totalAmount, 0),
        [orders]
    );

    const orderCountLabel = activeFilter === 'all'
        ? `${orders.length} total`
        : `${filteredOrders.length} shown`;

    return (
        <div className="space-y-6 pb-48">
            <section className="relative overflow-hidden rounded-[2rem] border border-emerald-200/40 bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-900 p-6 text-white shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%)]" />
                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-100/90">WhatsApp Order Desk</p>
                        <h1 className="mt-3 text-4xl font-black tracking-tight">Voice orders to billing in one lightweight MSME flow.</h1>
                        <p className="mt-3 max-w-2xl text-sm text-emerald-50/90">
                            Customers send text or voice notes, KiranaLink handles ambiguity, and the shopkeeper confirms quickly with edit-first safety.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={loadDashboard}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold backdrop-blur-md transition hover:bg-white/20"
                        >
                            <RefreshCcw size={16} /> Refresh
                        </button>
                        <button
                            onClick={handleSendReminders}
                            disabled={sendingReminder}
                            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-900 shadow-xl transition hover:scale-[1.02] disabled:opacity-60"
                        >
                            {sendingReminder ? <Activity size={16} className="animate-spin" /> : <Bell size={16} />}
                            {sendingReminder ? 'Sending...' : 'Send Due Reminders'}
                        </button>
                    </div>
                </div>

                <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-4">
                    <StatCard label="Orders Today" value={String(analytics.ordersToday)} icon={<ShoppingBag size={18} />} />
                    <StatCard label="Needs Review" value={String(analytics.needsReviewCount || queueCounts.needsReview)} icon={<AlertTriangle size={18} />} />
                    <StatCard label="Waiting Choice" value={String(analytics.awaitingChoiceCount || queueCounts.awaitingChoice)} icon={<Clock3 size={18} />} />
                    <StatCard label="Ready To Bill" value={String(analytics.readyToBillCount || queueCounts.readyToBill)} icon={<PackageCheck size={18} />} />
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
                <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Incoming Orders</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Includes manual review queue, customer choice queue, and bill-ready orders.</p>
                        </div>
                        <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {orderCountLabel}
                        </div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                        <FilterChip label="All" active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
                        <FilterChip label="Needs Review" active={activeFilter === 'needs_review'} onClick={() => setActiveFilter('needs_review')} />
                        <FilterChip label="Waiting Customer" active={activeFilter === 'awaiting_choice'} onClick={() => setActiveFilter('awaiting_choice')} />
                        <FilterChip label="Ready To Bill" active={activeFilter === 'ready_to_bill'} onClick={() => setActiveFilter('ready_to_bill')} />
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center text-slate-500 dark:border-white/10 dark:text-slate-400">Loading WhatsApp orders...</div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center text-slate-500 dark:border-white/10 dark:text-slate-400">
                                No orders in this queue.
                            </div>
                        ) : filteredOrders.map((order) => (
                            <div key={order._id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-lg font-black text-slate-900 dark:text-white">{order.customerId?.name || order.customerPhone}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClasses[order.status]}`}>{order.status}</span>
                                            <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                                {order.channel === 'whatsapp_audio' ? 'Voice Note' : 'Text'}
                                            </span>
                                            {isOrderNeedsReview(order) && <ReviewBadge tone="amber" text="Needs Review" />}
                                            {isOrderAwaitingChoice(order) && <ReviewBadge tone="blue" text="Awaiting Customer" />}
                                            {order.convertedBillId && <ReviewBadge tone="green" text="Bill Linked" />}
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {order.customerPhone} | {new Date(order.createdAt).toLocaleString('en-IN')} | Ref: {order.referenceCode || order._id.slice(-6).toUpperCase()}
                                        </p>
                                        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{order.parsedText || order.customerMessage}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Total</p>
                                        <p className="text-2xl font-black text-slate-900 dark:text-white">Rs.{order.totalAmount.toFixed(0)}</p>
                                    </div>
                                </div>

                                {isOrderNeedsReview(order) && (
                                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
                                        <p className="font-semibold">Voice note needs manual review.</p>
                                        <p className="mt-1">Listen to voice note, edit items, then create bill.</p>
                                        {order.mediaUrl && (
                                            <div className="mt-2">
                                                {orderMediaUrls[order._id] ? (
                                                    <audio controls src={orderMediaUrls[order._id]} className="w-full" />
                                                ) : (
                                                    <button
                                                        onClick={() => handleLoadVoiceNote(order)}
                                                        disabled={loadingMediaId === order._id}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
                                                    >
                                                        <Headphones size={13} />
                                                        {loadingMediaId === order._id ? 'Loading audio...' : 'Load Voice Note'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isOrderAwaitingChoice(order) && (
                                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                                        Waiting for customer item variant reply. If delayed, edit items manually and continue billing.
                                    </div>
                                )}

                                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                                    <div className="flex flex-wrap gap-2">
                                        {(editingOrderId === order._id ? (draftItemsByOrder[order._id] || []) : order.items).map((item) => (
                                            <div key={`${order._id}-${item.productId}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950">
                                                <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                                                {editingOrderId === order._id ? (
                                                    <span className="ml-2 inline-flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={item.quantity}
                                                            onChange={(event) => updateDraftItemQuantity(order._id, item.productId, Number(event.target.value || 1))}
                                                            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-white/20 dark:bg-slate-900 dark:text-slate-100"
                                                        />
                                                        <button
                                                            onClick={() => removeDraftItem(order._id, item.productId)}
                                                            className="rounded-lg bg-rose-100 p-1 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/20 dark:text-rose-300"
                                                            title="Remove item"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="ml-2 text-slate-500 dark:text-slate-400">x {item.quantity}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:justify-end">
                                        {editingOrderId === order._id ? (
                                            <>
                                                <select
                                                    value={newProductByOrder[order._id] || ''}
                                                    onChange={(event) => setNewProductByOrder((prev) => ({ ...prev, [order._id]: event.target.value }))}
                                                    className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10"
                                                >
                                                    <option value="">Add product...</option>
                                                    {productOptions.map((product) => (
                                                        <option key={product._id} value={product._id}>
                                                            {product.name} ({product.stock})
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={() => addDraftItem(order._id)}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                                                >
                                                    <Plus size={13} /> Add
                                                </button>
                                                <button
                                                    onClick={() => saveEditedItems(order._id)}
                                                    disabled={savingItemsId === order._id}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                                >
                                                    <Save size={13} /> {savingItemsId === order._id ? 'Saving...' : 'Save Items'}
                                                </button>
                                                <button
                                                    onClick={() => cancelEditingItems(order._id)}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10"
                                                >
                                                    <X size={13} /> Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => startEditingItems(order)}
                                                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-600"
                                            >
                                                <Pencil size={13} /> Edit Items
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleConvertToBill(order._id)}
                                            disabled={convertingId === order._id || Boolean(order.convertedBillId) || editingOrderId === order._id || !isOrderReadyToBill(order)}
                                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <ReceiptText size={14} />
                                            {order.convertedBillId ? 'Bill Linked' : convertingId === order._id ? 'Converting...' : 'Create Bill'}
                                        </button>

                                        {statusOptions.map((status) => (
                                            <button
                                                key={`${order._id}-${status}`}
                                                onClick={() => handleStatusUpdate(order._id, status)}
                                                disabled={
                                                    updatingId === order._id ||
                                                    order.status === status ||
                                                    ((status === 'ready' || status === 'delivered') && (order.reviewState ?? 'none') !== 'none')
                                                }
                                                className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition ${order.status === status
                                                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10'
                                                    } disabled:opacity-50`}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {order.convertedBillId && (
                                    <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                        Bill linked: {String(order.convertedBillId)}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-6">
                    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <MessageCircle size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-900 dark:text-white">Live Relay</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Realtime WhatsApp socket events from backend.</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {events.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">Waiting for live WhatsApp activity...</div>
                            ) : events.map((event, index) => (
                                <div key={`${event.type}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="rounded-xl bg-slate-900 p-2 text-white dark:bg-white dark:text-slate-900">
                                                {String(event.type).includes('ORDER') ? <ShoppingBag size={14} /> : String(event.type).includes('PAY') ? <Bell size={14} /> : <Activity size={14} />}
                                            </div>
                                            <div>
                                                <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{event.type}</p>
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{String(event.data.customer || event.data.sender || event.data.message || 'System event')}</p>
                                            </div>
                                        </div>
                                        <span className="text-[11px] text-slate-400">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">Voice + WhatsApp Rules</h2>
                        <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                            <RuleRow icon={<MessageCircle size={16} />} text="Customer sends text or voice note first on WhatsApp." />
                            <RuleRow icon={<Mic size={16} />} text="KiranaLink parses items and asks quick 1/2/3 choice for ambiguous products." />
                            <RuleRow icon={<PackageCheck size={16} />} text="Shopkeeper can edit items before billing to avoid wrong invoices." />
                            <RuleRow icon={<Bell size={16} />} text="Status updates are auto-message ready/delivered inside free 24h customer window." />
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-5 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Error Diagnostics</h2>
                                    <p className="text-sm text-slate-600 dark:text-slate-300">Recent backend/socket failures for quick debugging.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDiagnostics([])}
                                className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10"
                            >
                                Clear
                            </button>
                        </div>

                        <div className="space-y-2">
                            {diagnostics.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-amber-700 dark:border-amber-900/40 dark:text-amber-200">
                                    No active errors. Dashboard APIs are healthy.
                                </div>
                            ) : diagnostics.map((diag, index) => (
                                <div key={`${diag.source}-${diag.at}-${index}`} className="rounded-2xl border border-amber-200 bg-white px-3 py-3 dark:border-amber-900/40 dark:bg-slate-900/40">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">{diag.source}</p>
                                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{diag.message}</p>
                                        </div>
                                        <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                                            <p>{diag.statusCode ? `HTTP ${diag.statusCode}` : 'Network'}</p>
                                            <p>{new Date(diag.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">Queue Snapshot</h2>
                        <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                            <p>Total pipeline value: <span className="font-bold text-slate-900 dark:text-white">Rs.{todayRevenuePotential.toLocaleString()}</span></p>
                            <p>Pending khata in WhatsApp window: <span className="font-bold text-slate-900 dark:text-white">Rs.{analytics.pendingTotal.toLocaleString()}</span></p>
                            <p>Debtors in active list: <span className="font-bold text-slate-900 dark:text-white">{analytics.activeDebtors}</span></p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-100/80">{label}</p>
                    <p className="mt-2 text-2xl font-black text-white">{value}</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3 text-white">{icon}</div>
            </div>
        </div>
    );
}

function RuleRow({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.03]">
            <div className="mt-0.5 rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{icon}</div>
            <p>{text}</p>
        </div>
    );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition ${active
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10'
                }`}
        >
            {label}
        </button>
    );
}

function ReviewBadge({ text, tone }: { text: string; tone: 'amber' | 'blue' | 'green' }) {
    const classes = tone === 'amber'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
        : tone === 'blue'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';

    return (
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${classes}`}>
            {text}
        </span>
    );
}

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useCart } from '../../contexts/CartContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { productApi, customerApi, billApi, ledgerApi } from '../../services/api';
import type { Customer } from '../../services/api';
import { db } from '../../db/db';
import type { Customer as LocalCustomer } from '../../db/db';
import { recalculateKhataScore, SCORE_DEFAULT, calculateKhataLimit, getKhataStatus, type KhataExplanation } from '../../lib/khataLogic';
import { Search, User, Phone, X, ChevronRight, Minus, Plus, Trash2, Award, Download, Share2, MessageCircle, Mic, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTranslate } from '../../hooks/useTranslate';
import { useProductUsage } from '../../hooks/useProductUsage';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../../components/PullToRefreshIndicator';
import { aiApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:5001';

// --- Memoized Sub-components ---

const BillingProductCard = React.memo(({ product, t, cartItem, addToCart, increaseQuantity, decreaseQuantity, addToast }: any) => {
    const isOutOfStock = product.stock <= 0;
    const inCart = !!cartItem;
    const marginTags = product.stock <= 3 ? 'Low Stock' : product.price > 300 ? 'Premium' : 'Popular';

    return (
        <div className={`bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-50 dark:border-gray-800 flex flex-col relative transition-all duration-300 ${isOutOfStock ? 'opacity-40 grayscale-[0.5]' : 'hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-200/20 dark:hover:shadow-black/20'}`}>
            {!isOutOfStock && (
                <div className={`absolute top-3 left-3 text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest z-10 ${marginTags === 'Low Stock' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                    {marginTags}
                </div>
            )}
            <div className="flex-1 flex flex-col items-center justify-center py-4">
                <div className={`text-5xl mb-3 flex items-center justify-center h-16 w-16 bg-gray-50 dark:bg-gray-700/50 rounded-2xl ${!isOutOfStock ? 'group-hover:animate-bounce mt-2' : ''}`}>{product.icon || '📦'}</div>
                <span className="font-black text-gray-900 dark:text-gray-100 leading-tight text-center text-sm mb-1 line-clamp-1">{product.name}</span>
                <span className="text-gray-900 dark:text-white font-black text-md">₹{product.price}<span className="text-[10px] text-gray-400">/{product.unit}</span></span>
            </div>
            {!isOutOfStock && (
                <div className="mt-2">
                    {!inCart ? (
                        <button onClick={() => { const success = addToCart(product, product.stock); if (!success) addToast(`${t['Only']} ${product.stock} ${product.unit} ${t['available']}`, 'warning'); }} className="w-full bg-gradient-to-r from-primary-green to-emerald-600 text-white font-black text-xs py-2.5 rounded-xl shadow-md shadow-primary-green/20 hover:scale-[1.02] active:scale-95 transition-all duration-200">
                            {t['ADD'] || 'ADD'}
                        </button>
                    ) : (
                        <div className="flex items-center justify-between bg-primary-green text-white rounded-xl overflow-hidden shadow-lg shadow-primary-green/20">
                            <button onClick={() => decreaseQuantity(product._id!)} className="w-10 h-10 flex items-center justify-center text-white hover:bg-green-600 transition-colors"><Minus size={14} /></button>
                            <div className="flex-1 text-center font-black text-sm">{cartItem.quantity}</div>
                            <button onClick={() => { const success = increaseQuantity(product._id!, product.stock); if (!success) addToast(`${t['Only']} ${product.stock} ${product.unit} ${t['available']}`, 'warning'); }} className="w-10 h-10 flex items-center justify-center text-white hover:bg-green-600 transition-colors"><Plus size={14} /></button>
                        </div>
                    )}
                </div>
            )}
            {isOutOfStock && (
                <div className="absolute inset-0 bg-white/10 dark:bg-black/10 flex items-center justify-center rounded-2xl"><div className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-lg rotate-[-15deg] shadow-lg ring-2 ring-white">SOLD OUT</div></div>
            )}
        </div>
    );
});

const CheckoutCartItem = React.memo(({ item, t, increaseQuantity, decreaseQuantity, updateQuantity, removeFromCart, addToast }: any) => (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-start mb-3">
            <div>
                <div className="font-bold text-gray-900 dark:text-white text-lg">{item.name}</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm">₹{item.price}/{item.unit}</div>
            </div>
            <div className="font-bold text-lg text-gray-900 dark:text-white">₹{item.price * item.quantity}</div>
        </div>
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 pr-3">
                <div className="flex items-center">
                    <button onClick={() => decreaseQuantity(item._id!)} className="w-8 h-8 bg-white dark:bg-gray-600 rounded-md flex items-center justify-center text-gray-700 dark:text-white"><Minus size={16} /></button>
                    <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const success = updateQuantity(item._id!, val, item.stock);
                            if (!success) addToast(`${t['Only']} ${item.stock} ${item.unit} ${t['available']}`, 'warning');
                        }}
                        className="w-16 bg-transparent text-center font-bold text-gray-900 dark:text-white border-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button onClick={() => {
                        const success = increaseQuantity(item._id!, item.stock);
                        if (!success) addToast(`${t['Only']} ${item.stock} ${item.unit} ${t['available']}`, 'warning');
                    }} className="w-8 h-8 bg-white dark:bg-gray-600 rounded-md flex items-center justify-center text-gray-700 dark:text-white"><Plus size={16} /></button>
                </div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.unit}</span>
            </div>
            <button onClick={() => removeFromCart(item._id!)} className="text-danger-red p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 size={18} /></button>
        </div>
    </div>
));

const CustomerSuggestionRow = React.memo(({ cust, t, identifyCustomer, isGlobal }: any) => (
    <button
        onClick={() => identifyCustomer(cust)}
        className={`w-full flex items-center justify-between p-4 ${isGlobal ? 'bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'} rounded-2xl hover:shadow-md transition-all group`}
    >
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${isGlobal ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'} rounded-xl flex items-center justify-center font-bold uppercase`}>
                {cust.name?.[0] || 'C'}
            </div>
            <div className="text-left">
                <div className="flex items-center gap-2">
                    <div className="font-black text-gray-900 dark:text-white">{cust.name || t['Unnamed Customer']}</div>
                    {isGlobal && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">GLOBAL</span>}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold">{cust.phoneNumber}</div>
            </div>
        </div>
        <ChevronRight className={`${isGlobal ? 'text-blue-300 group-hover:text-blue-500' : 'text-gray-300 group-hover:text-primary-green'}`} />
    </button>
));

const PaymentOptionLabel = React.memo(({ value, currentMethod, onChange, t, title, description, disabled, khataInfo }: any) => (
    <label
        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all relative ${currentMethod === value
            ? 'border-primary-green bg-green-50 dark:bg-green-900/10'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${currentMethod === value
                ? 'border-primary-green bg-primary-green'
                : 'border-gray-300 dark:border-gray-600'
                }`}>
                {currentMethod === value && (
                    <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                )}
            </div>
            <div>
                <div className="font-semibold text-gray-900 dark:text-white">{t[title] || title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    {value === 'ledger' && khataInfo ? `₹${khataInfo.availableCredit} ${t['available']}` : t[description] || description}
                </div>
            </div>
        </div>
        <input
            type="radio"
            name="payment"
            value={value}
            checked={currentMethod === value}
            onChange={() => onChange(value)}
            disabled={disabled}
            className="sr-only"
        />
        {value === 'ledger' && disabled && (
            <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {t['Limit Exceeded']}
            </div>
        )}
    </label>
));

export const BillingPage: React.FC = () => {
    const { cart, addToCart, increaseQuantity, decreaseQuantity, updateQuantity, removeFromCart, clearCart, cartTotal } = useCart();
    const { t, language } = useLanguage();
    const { addToast } = useToast();
    const { user } = useAuth();
    const { recordUsage, sortProducts } = useProductUsage();
    const [products, setProducts] = useState<any[]>([]);
    const translatedProducts = useTranslate(products, ['name', 'category']);
    const translatedCart = useTranslate(cart, ['name', 'unit']);

    const [isProcessingVoice, setIsProcessingVoice] = useState(false);
    const [hasStartedVoice, setHasStartedVoice] = useState(false);

    const handleVoiceCommand = React.useCallback(async (transcript: string) => {
        if (!transcript.trim()) return;

        setIsProcessingVoice(true);
        addToast(t['Processing voice...'] || 'Processing voice...', 'info');

        try {
            const response = await aiApi.parseVoiceCommand(transcript);
            let items = response.data.items;

            // Handle different JSON structures returned by different AI response variations
            if (!Array.isArray(items)) {
                if (typeof items === 'object' && items !== null) {
                    items = Object.values(items).find(v => Array.isArray(v)) as any[] || [];
                } else {
                    items = [];
                }
            }

            if (items.length === 0) {
                addToast(t['AI couldn\'t understand clearly'] || 'AI couldn\'t understand clearly', 'warning');
                setSearchTerm(transcript);
                return;
            }

            let addedCount = 0;
            for (const aiItem of items) {
                // Find best match in the currently visible/loaded products
                const match = products.find((p: any) => {
                    const searchName = aiItem.product.toLowerCase();
                    const prodName = p.name.toLowerCase();
                    return prodName.includes(searchName) || searchName.includes(prodName);
                });

                if (match) {
                    const quantityToAdd = Number(aiItem.quantity) || 1;
                    const existingItem = cart.find(i => i._id === match._id);
                    const currentCartQty = existingItem?.quantity || 0;
                    const targetQty = currentCartQty + quantityToAdd;
                    const availableStock = match.stock;

                    if (targetQty > availableStock) {
                        if (availableStock > currentCartQty) {
                            updateQuantity(match._id, availableStock, availableStock);
                            addToast(`Only ${availableStock} units of ${match.name} available. Added max possible.`, 'warning');
                            addedCount++;
                        } else {
                            addToast(`${match.name} is already at max stock in your cart.`, 'warning');
                        }
                    } else {
                        if (!existingItem) {
                            addToCart(match, availableStock);
                            if (targetQty > 1) {
                                // Add one, then update to the target quantity
                                // We use a small timeout to ensure CartContext state update completes for the first item
                                setTimeout(() => updateQuantity(match._id, targetQty, availableStock), 50);
                            }
                        } else {
                            updateQuantity(match._id, targetQty, availableStock);
                        }
                        addedCount++;
                    }
                    recordUsage(match._id);
                }
            }

            if (addedCount > 0) {
                addToast(`AI: Successfully added ${addedCount} order items 🏪`, 'success');
            } else {
                addToast(t['No matching products found'] || 'No matching products found', 'warning');
                setSearchTerm(transcript);
            }
        } catch (err) {
            console.error('Voice AI parsing failed:', err);
            addToast(t['Voice parsing failed'] || 'Voice parsing failed', 'error');
            setSearchTerm(transcript);
        } finally {
            setIsProcessingVoice(false);
        }
    }, [products, addToCart, updateQuantity, cart, addToast, t, recordUsage]);

    const { isListening, startListening, stopListening, isSupported } = useSpeechRecognition({
        onResult: handleVoiceCommand,
        onError: (err) => {
            if (err === 'network') {
                addToast(t['Network error: Please check your internet for voice input.'] || 'Network error: Please check your internet for voice input.', 'error');
            } else if (err === 'not-allowed') {
                addToast(t['Microphone permission denied.'] || 'Microphone permission denied.', 'error');
            } else {
                console.error('Speech recognition error:', err);
            }
        },
        lang: language
    });

    const [showCheckout, setShowCheckout] = useState(false);
    const [checkoutStep, setCheckoutStep] = useState<'SUMMARY' | 'CUSTOMER' | 'PAYMENT'>('SUMMARY');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | 'ledger' | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategoryIndex, setSelectedCategoryIndex] = useState<number>(0);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [animationType, setAnimationType] = useState<'cash' | 'online' | 'ledger' | null>(null);
    const [otp, setOtp] = useState('');
    const [showOtpInput, setShowOtpInput] = useState(false);
    const [otpLoading, setOtpLoading] = useState(false);
    const [latestBillId, setLatestBillId] = useState<string | null>(null);
    const [sendingBillWhatsApp, setSendingBillWhatsApp] = useState(false);

    // Partial Khata Payment states
    const [partialPaymentStep, setPartialPaymentStep] = useState<'NONE' | 'AMOUNT' | 'METHOD' | 'PROCESSING' | 'SUCCESS'>('NONE');
    const [partialAmount, setPartialAmount] = useState<number>(0);

    const [showRiskConfirmation, setShowRiskConfirmation] = useState(false);

    // Customer identification states
    const [customerInput, setCustomerInput] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<(Customer & LocalCustomer) | null>(null);
    const [isNewCustomer, setIsNewCustomer] = useState(false);
    const [khataInfo, setKhataInfo] = useState<KhataExplanation | null>(null);
    const [customerVoiceLanguage, setCustomerVoiceLanguage] = useState<string>('en');

    // Global Search State
    const [globalResults, setGlobalResults] = useState<Customer[]>([]);
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);

    const loadCustomers = React.useCallback(async () => {
        try {
            const response = await customerApi.getAll();
            setAllCustomers(response.data);
        } catch (err) {
            console.error('Failed to load customers', err);
        }
    }, []);

    const loadProducts = React.useCallback(async () => {
        try {
            const response = await productApi.getAll();
            setProducts(response.data);
        } catch (err) {
            console.error('Failed to load products', err);
        }
    }, []);

    useEffect(() => {
        loadProducts();
        loadCustomers();

        // ── Real-time Payment Listening ──
        const socket = io(SOCKET_URL);
        socket.on('payment-success', async (data) => {
            console.log('Payment success received via socket:', data);
        });

        return () => {
            socket.disconnect();
        };
    }, [loadProducts, loadCustomers]);

    const pullState = usePullToRefresh({
        onRefresh: async () => {
            await Promise.all([loadProducts(), loadCustomers()]);
        },
    });

    // Effect: Global Search
    useEffect(() => {
        const fetchGlobal = async () => {
            if (!customerInput || customerInput.length < 3) {
                setGlobalResults([]);
                return;
            }

            setIsGlobalLoading(true);
            try {
                const res = await customerApi.search(customerInput);
                const localIds = new Set(allCustomers.map(c => c._id));
                const uniqueGlobal = res.data.filter((c: any) => !localIds.has(c._id));
                setGlobalResults(uniqueGlobal);
            } catch (error) {
                console.error('Global search failed', error);
                setGlobalResults([]);
            } finally {
                setIsGlobalLoading(false);
            }
        };

        const timer = setTimeout(fetchGlobal, 400);
        return () => clearTimeout(timer);
    }, [customerInput, allCustomers]);


    const getLedgerColor = React.useCallback((balance: number) => {
        if (balance <= 500) return 'text-green-600 bg-green-50 border-green-200';
        if (balance <= 1500) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        return 'text-red-600 bg-red-50 border-red-200';
    }, []);

    const identifyCustomer = React.useCallback(async (cust?: Customer) => {
        const phone = cust ? cust.phoneNumber : phoneNumber;
        const name = cust ? cust.name : customerName;

        const last10 = phone.replace(/\D/g, '').slice(-10);
        if (last10.length !== 10) {
            addToast(t['Enter valid 10-digit phone number'], 'error');
            return;
        }
        const normalizedPhone = `+91${last10}`;

        try {
            const response = await customerApi.create({ phoneNumber: normalizedPhone, name });
            const customerData = response.data;

            let localCustomer = await db.customers.where('phoneNumber').equals(normalizedPhone).first();
            if (!localCustomer) {
                const globalScore = customerData.khataScore || SCORE_DEFAULT;
                const newLocalId = await db.customers.add({
                    phoneNumber: normalizedPhone,
                    name: name || customerData.name || 'Unnamed Customer',
                    khataScore: globalScore,
                    khataBalance: customerData.khataBalance || 0,
                    khataLimit: customerData.khataLimit || calculateKhataLimit(globalScore),
                    activeKhataAmount: customerData.khataBalance || 0,
                    maxHistoricalKhataAmount: customerData.khataBalance || 0,
                    totalTransactions: 0,
                    khataTransactions: 0,
                    latePayments: 0,
                    createdAt: Date.now()
                });
                localCustomer = await db.customers.get(newLocalId);
            } else {
                await db.customers.update(localCustomer.id!, {
                    khataScore: customerData.khataScore || localCustomer.khataScore,
                    khataLimit: customerData.khataLimit || localCustomer.khataLimit,
                    khataBalance: customerData.khataBalance
                });
                localCustomer = await db.customers.get(localCustomer.id!);
            }

            setSelectedCustomer({
                ...customerData,
                ...localCustomer,
                name: customerData.name || localCustomer?.name || 'Unnamed Customer'
            } as Customer & LocalCustomer);

            // Set voice language from customer data
            setCustomerVoiceLanguage((customerData as any).preferredVoiceLanguage || 'en');

            const status = await getKhataStatus(normalizedPhone, customerData.khataScore, customerData.khataLimit);
            setKhataInfo(status);

            setCheckoutStep('PAYMENT');
            addToast(response.status === 201 ? t['New customer created'] : t['Customer identified'], 'success');
            loadCustomers();
        } catch (e: any) {
            console.error(e);
            addToast(t['Error identifying customer'] || 'Error identifying customer', 'error');
        }
    }, [phoneNumber, customerName, t, addToast, loadCustomers]);

    const filteredCustomers = React.useMemo(() => allCustomers.filter(c =>
        (c.name?.toLowerCase().includes(customerInput.toLowerCase()) ||
            c.phoneNumber.includes(customerInput)) && customerInput.length > 0
    ), [allCustomers, customerInput]);

    const categories = React.useMemo(() => {
        if (!translatedProducts) return ['All'];
        const cats = translatedProducts.map((p: any) => p.category).filter(Boolean);
        return ['All', ...Array.from(new Set(cats))];
    }, [translatedProducts]);

    const filteredProducts = React.useMemo(() => {
        let list = translatedProducts || [];
        const selectedCategory = categories[selectedCategoryIndex];

        if (selectedCategory && selectedCategory !== 'All') {
            list = list.filter((p: any) => p.category === selectedCategory);
        }

        return list.filter((p: any) =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [translatedProducts, searchTerm, selectedCategoryIndex, categories]);

    const sortedProducts = React.useMemo(
        () => sortProducts(filteredProducts),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filteredProducts]
    );

    const processTransaction = React.useCallback(async (method: 'cash' | 'online' | 'ledger') => {
        if (!selectedCustomer) return false;

        try {
            const billRes = await billApi.create({
                customerPhoneNumber: selectedCustomer.phoneNumber,
                items: cart.map(i => ({ productId: i._id!, quantity: i.quantity, price: i.price })),
                paymentType: method
            });
            setLatestBillId(billRes.data?._id || null);

            if (method === 'ledger') {
                const customer = await db.customers.where('phoneNumber').equals(selectedCustomer.phoneNumber).first();
                if (customer) {
                    const newActiveAmount = (customer.activeKhataAmount || 0) + cartTotal;
                    await db.customers.update(customer.id!, {
                        activeKhataAmount: newActiveAmount,
                        maxHistoricalKhataAmount: Math.max((customer.maxHistoricalKhataAmount || 0), newActiveAmount),
                        khataTransactions: (customer.khataTransactions || 0) + 1
                    });

                    await db.ledger.add({
                        customerId: selectedCustomer.phoneNumber,
                        amount: cartTotal,
                        paymentMode: 'KHATA',
                        type: 'debit',
                        status: 'PENDING',
                        createdAt: Date.now(),
                        items: cart
                    });

                    await recalculateKhataScore(selectedCustomer.phoneNumber);
                }
            } else {
                await db.ledger.add({
                    customerId: selectedCustomer.phoneNumber,
                    amount: cartTotal,
                    paymentMode: method.toUpperCase() as any,
                    type: 'debit',
                    status: 'PAID',
                    createdAt: Date.now(),
                    paidAt: Date.now(),
                    items: cart
                });

                const customer = await db.customers.where('phoneNumber').equals(selectedCustomer.phoneNumber).first();
                if (customer) {
                    await db.customers.update(customer.id!, {
                        totalTransactions: (customer.totalTransactions || 0) + 1
                    });
                }
            }

            addToast(t['Transaction successful!'], 'success');
            recordUsage(cart);
            loadProducts();
            return true;
        } catch (e: any) {
            console.error(e);
            addToast(e.response?.data?.message || t['Transaction Failed'] || 'Transaction Failed', 'error');
            return false;
        }
    }, [selectedCustomer, cart, cartTotal, t, addToast, loadProducts, recordUsage]);

    const handleCashPayment = React.useCallback(async () => {
        setAnimationType('cash');
        setShowStatusModal(true);
        setIsProcessing(true);

        const success = await processTransaction('cash');
        if (success) {
            setIsProcessing(false);
        } else {
            setShowStatusModal(false);
        }
    }, [processTransaction]);

    const handleUpiPayment = React.useCallback(async () => {
        if (!selectedCustomer) return;

        setIsProcessing(true);

        try {
            const amountInPaise = cartTotal * 100;
            const res = await (billApi as any).createRazorpayOrder(amountInPaise);
            const { orderId, keyId } = res.data;

            const options = {
                key: keyId,
                amount: amountInPaise,
                currency: "INR",
                name: "SDukaan",
                description: "Purchase from SDukaan",
                order_id: orderId,
                handler: async function (response: any) {
                    try {
                        setAnimationType('online');
                        setShowStatusModal(true);
                        setIsProcessing(true);

                        const verifyRes = await (billApi as any).verifyRazorpayPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            billData: {
                                customerPhoneNumber: selectedCustomer.phoneNumber,
                                items: cart.map(i => ({ productId: i._id!, quantity: i.quantity, price: i.price }))
                            }
                        });

                        setLatestBillId(verifyRes.data.bill?._id || null);

                        await db.ledger.add({
                            customerId: selectedCustomer.phoneNumber,
                            amount: cartTotal,
                            paymentMode: 'UPI',
                            type: 'debit',
                            status: 'PAID',
                            createdAt: Date.now(),
                            paidAt: Date.now(),
                            items: cart
                        });

                        const customer = await db.customers.where('phoneNumber').equals(selectedCustomer.phoneNumber).first();
                        if (customer) {
                            await db.customers.update(customer.id!, {
                                totalTransactions: (customer.totalTransactions || 0) + 1
                            });
                        }

                        addToast(t['UPI Payment Successful!'], 'success');
                        recordUsage(cart);
                        loadProducts(); // Refresh local stock
                        setIsProcessing(false);
                    } catch (verifyErr: any) {
                        console.error('[Razorpay Verify Error]', verifyErr);
                        addToast(verifyErr.response?.data?.message || t['Payment Verification Failed'] || 'Payment Verification Failed', 'error');
                        setShowStatusModal(false);
                        setIsProcessing(false);
                    }
                },
                prefill: {
                    name: selectedCustomer.name || "",
                    contact: selectedCustomer.phoneNumber.replace("+91", "")
                },
                theme: {
                    color: "#16a34a"
                },
                modal: {
                    ondismiss: function () {
                        setIsProcessing(false);
                    }
                }
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on('payment.failed', function (response: any) {
                console.error('[Razorpay Error]', response.error);
                addToast(response.error.description || 'Payment Failed', 'error');
                setIsProcessing(false);
            });
            rzp.open();
        } catch (err: any) {
            console.error('[Razorpay Order Error]', err);
            addToast(err.response?.data?.message || 'Failed to initialize payment gateway', 'error');
            setShowStatusModal(false);
            setIsProcessing(false);
        }
    }, [selectedCustomer, cartTotal, cart, t, addToast, loadProducts, recordUsage]);

    const handleLedgePayment = React.useCallback(async (skipRiskConfirmation = false) => {
        if (!selectedCustomer) return;

        // If Strong Risk, ask for confirmation once
        if (!skipRiskConfirmation && khataInfo?.riskLevel === 'STRONG') {
            setShowRiskConfirmation(true);
            return;
        }

        setAnimationType('ledger');
        setShowStatusModal(true);
        setIsProcessing(true);
        setShowOtpInput(true);
        setOtpLoading(true);

        try {
            const res = await billApi.sendKhataOtp(selectedCustomer.phoneNumber);
            addToast(t['Verification code sent to customer'], 'success');

            if (res.data?.demoOtp) {
                setOtp(res.data.demoOtp);
                addToast(`[DEMO] OTP auto-filled: ${res.data.demoOtp}`, 'info');
            }
        } catch (err: any) {
            addToast(err.response?.data?.message || t['Failed to send OTP'], 'error');
            setShowStatusModal(false);
            setIsProcessing(false);
            setShowOtpInput(false);
        } finally {
            setOtpLoading(false);
        }
    }, [khataInfo, cartTotal, selectedCustomer, t, addToast]);

    const handleVerifyOtp = React.useCallback(async () => {
        if (!selectedCustomer || otp.length !== 6) return;

        setOtpLoading(true);
        try {
            const billData = {
                customerPhoneNumber: selectedCustomer.phoneNumber,
                items: cart.map(i => ({ productId: i._id!, quantity: i.quantity, price: i.price })),
            };

            const verifyOtpRes = await billApi.verifyKhataOtp({
                customerPhoneNumber: selectedCustomer.phoneNumber,
                otp,
                billData
            });
            setLatestBillId(verifyOtpRes.data?._id || null);

            const customer = await db.customers.where('phoneNumber').equals(selectedCustomer.phoneNumber).first();
            if (customer) {
                const newActiveAmount = (customer.activeKhataAmount || 0) + cartTotal;
                await db.customers.update(customer.id!, {
                    activeKhataAmount: newActiveAmount,
                    maxHistoricalKhataAmount: Math.max((customer.maxHistoricalKhataAmount || 0), newActiveAmount),
                    khataTransactions: (customer.khataTransactions || 0) + 1
                });

                await db.ledger.add({
                    customerId: selectedCustomer.phoneNumber,
                    amount: cartTotal,
                    paymentMode: 'KHATA',
                    type: 'debit',
                    status: 'PENDING',
                    createdAt: Date.now(),
                    items: cart
                });

                await recalculateKhataScore(selectedCustomer.phoneNumber);
            }

            addToast(t['Udhaar Verified & Transaction Complete!'], 'success');
            recordUsage(cart);
            setShowOtpInput(false);
            setIsProcessing(false);
            loadProducts();
        } catch (err: any) {
            addToast(err.response?.data?.message || t['Verification Failed'] || 'Verification Failed', 'error');
            if (err.response?.data?.message?.includes('Max attempts')) {
                setShowStatusModal(false);
                setIsProcessing(false);
                setShowOtpInput(false);
            }
        } finally {
            setOtpLoading(false);
            setOtp('');
        }
    }, [selectedCustomer, otp, cart, cartTotal, t, addToast, loadProducts, recordUsage]);

    const handlePartialCashPayment = async (amount: number) => {
        if (!selectedCustomer) return;
        setPartialPaymentStep('PROCESSING');
        try {
            await (ledgerApi as any).recordPayment({
                customerId: selectedCustomer._id,
                amount: amount,
                paymentMode: 'cash'
            });

            const customer = await db.customers.where('phoneNumber').equals(selectedCustomer.phoneNumber).first();
            if (customer) {
                await db.customers.update(customer.id!, {
                    khataBalance: Math.max(0, (customer.khataBalance || 0) - amount),
                    activeKhataAmount: Math.max(0, (customer.activeKhataAmount || 0) - amount)
                });

                await db.ledger.add({
                    customerId: selectedCustomer.phoneNumber,
                    amount: amount,
                    paymentMode: 'CASH',
                    type: 'credit',
                    status: 'PAID',
                    createdAt: Date.now()
                });

                await recalculateKhataScore(selectedCustomer.phoneNumber);
            }

            setSelectedCustomer(prev => prev ? ({
                ...prev,
                khataBalance: Math.max(0, (prev.khataBalance || 0) - amount),
                activeKhataAmount: Math.max(0, (prev.activeKhataAmount || 0) - amount)
            } as any) : null);

            addToast('Partial Cash Payment Recorded', 'success');
            setPartialPaymentStep('SUCCESS');
        } catch (err: any) {
            console.error(err);
            addToast(err.response?.data?.message || 'Failed to record cash payment', 'error');
            setPartialPaymentStep('METHOD');
        }
    };

    const handlePartialUpiPayment = async (amount: number) => {
        if (!selectedCustomer) return;
        setPartialPaymentStep('PROCESSING');
        try {
            const amountInPaise = amount * 100;
            const res = await (billApi as any).createRazorpayOrder(amountInPaise);
            const { orderId, keyId } = res.data;

            const options = {
                key: keyId,
                amount: amountInPaise,
                currency: "INR",
                name: "SDukaan Partial Payment",
                description: "Khata balance reduction",
                order_id: orderId,
                handler: async function (response: any) {
                    try {
                        setPartialPaymentStep('PROCESSING');
                        await ledgerApi.verifyRazorpayPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            customerId: selectedCustomer._id,
                            amount: amount
                        });

                        const customer = await db.customers.where('phoneNumber').equals(selectedCustomer.phoneNumber).first();
                        if (customer) {
                            await db.customers.update(customer.id!, {
                                khataBalance: Math.max(0, (customer.khataBalance || 0) - amount),
                                activeKhataAmount: Math.max(0, (customer.activeKhataAmount || 0) - amount)
                            });

                            await db.ledger.add({
                                customerId: selectedCustomer.phoneNumber,
                                amount: amount,
                                paymentMode: 'UPI',
                                type: 'credit',
                                status: 'PAID',
                                createdAt: Date.now()
                            });

                            await recalculateKhataScore(selectedCustomer.phoneNumber);
                        }

                        setSelectedCustomer(prev => prev ? ({
                            ...prev,
                            khataBalance: Math.max(0, (prev.khataBalance || 0) - amount),
                            activeKhataAmount: Math.max(0, (prev.activeKhataAmount || 0) - amount)
                        } as any) : null);

                        addToast('Partial UPI Payment Successful!', 'success');
                        setPartialPaymentStep('SUCCESS');
                    } catch (verifyErr: any) {
                        console.error('[Razorpay Verify Error]', verifyErr);
                        addToast('Payment Verification Failed', 'error');
                        setPartialPaymentStep('METHOD');
                    }
                },
                prefill: {
                    name: selectedCustomer.name || "",
                    contact: selectedCustomer.phoneNumber.replace("+91", "")
                },
                theme: { color: "#16a34a" },
                modal: { ondismiss: () => setPartialPaymentStep('METHOD') }
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on('payment.failed', (response: any) => {
                addToast(response.error.description || 'Payment Failed', 'error');
                setPartialPaymentStep('METHOD');
            });
            rzp.open();
        } catch (err: any) {
            console.error(err);
            addToast('Failed to initialize UPI payment', 'error');
            setPartialPaymentStep('METHOD');
        }
    };

    const generateBillPDF = React.useCallback(() => {
        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.setTextColor(40, 167, 69); // Green color
        doc.text(`SDukaan - ${t['Retail Invoice'] || 'Retail Invoice'}`, 105, 15, { align: "center" });
        doc.setTextColor(0, 0, 0); // Black

        doc.setFontSize(10);
        const dateStr = new Date().toLocaleString();

        doc.text(`${t['Date'] || 'Date'}: ${dateStr}`, 14, 25);
        doc.text(`${t['Customer'] || 'Customer'}: ${selectedCustomer?.name || t['Walk-in Customer'] || 'Walk-in Customer'}`, 14, 30);
        doc.text(`${t['Phone Number'] || 'Phone'}: ${selectedCustomer?.phoneNumber || 'N/A'}`, 14, 35);
        if (paymentMethod) {
            doc.text(`${t['Payment Method'] || 'Payment Mode'}: ${paymentMethod.toUpperCase()}`, 14, 40);
        }

        const tableData = cart.map(item => [
            item.name,
            `${item.quantity} ${item.unit}`,
            `Rs. ${item.price}`,
            `Rs. ${item.price * item.quantity}`
        ]);

        autoTable(doc, {
            startY: 45,
            head: [[t['Item'] || 'Item', t['Qty'] || 'Qty', t['Rate'] || 'Rate', t['Amount'] || 'Amount']],
            body: tableData,
            foot: [['', '', `${t['Grand Total'] || 'Grand Total'}:`, `Rs. ${cartTotal}`]],
            theme: 'striped',
            headStyles: { fillColor: [40, 167, 69] },
        });

        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.text(t['Thank you for shopping!'] || "Thank you for shopping with SDukaan!", 105, finalY, { align: "center" });
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`${t['Powered by'] || 'Powered by'} 4Bytes`, 105, finalY + 5, { align: "center" });

        return doc;
    }, [t, selectedCustomer, paymentMethod, cart, cartTotal]);

    const handleDownloadPDF = React.useCallback(() => {
        try {
            const doc = generateBillPDF();
            doc.save(`Invoice_${Date.now()}.pdf`);
            addToast(t['Invoice Downloaded'], 'success');
        } catch (err) {
            console.error(err);
            addToast(t['Failed to download invoice'] || 'Failed to download invoice', 'error');
        }
    }, [generateBillPDF, t, addToast]);

    const handleSharePDF = React.useCallback(async () => {
        try {
            const doc = generateBillPDF();
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], `Invoice_${Date.now()}.pdf`, { type: 'application/pdf' });

            if (navigator.share) {
                await navigator.share({
                    title: t['Shop Invoice'] || 'Shop Invoice',
                    text: `${t['Here is your invoice for'] || 'Here is your invoice for'} ₹${cartTotal}`,
                    files: [file]
                });
                addToast(t['Invoice Shared Successfully'], 'success');
            } else {
                handleDownloadPDF();
                addToast('Sharing not supported on this device, downloading instead.', 'info');
            }
        } catch (err) {
            console.error('Share failed', err);
            if ((err as any).name !== 'AbortError') {
                addToast('Failed to share invoice', 'error');
            }
        }
    }, [generateBillPDF, t, cartTotal, addToast, handleDownloadPDF]);

    const handleTransactionComplete = React.useCallback(() => {
        clearCart();
        closeCheckout();
    }, [clearCart]);

    const handleSendBillOnWhatsApp = React.useCallback(async () => {
        if (!latestBillId) {
            addToast('Bill not available to send', 'error');
            return;
        }

        try {
            setSendingBillWhatsApp(true);
            await billApi.sendBillOnWhatsApp(latestBillId);
            addToast(t['Bill sent to customer on WhatsApp'], 'success');
        } catch (err: any) {
            addToast(err.response?.data?.message || t['Failed to send bill on WhatsApp'] || 'Failed to send bill on WhatsApp', 'error');
        } finally {
            setSendingBillWhatsApp(false);
        }
    }, [latestBillId, t, addToast]);

    const closeCheckout = React.useCallback(() => {
        setShowCheckout(false);
        setCheckoutStep('SUMMARY');
        setPaymentMethod(null);
        setShowStatusModal(false);
        setPhoneNumber('');
        setCustomerName('');
        setCustomerInput('');
        setIsNewCustomer(false);
        setSelectedCustomer(null);
        setAnimationType(null);
        setOtp('');
        setShowOtpInput(false);
        setLatestBillId(null);
        setSendingBillWhatsApp(false);
        setPartialPaymentStep('NONE');
        setPartialAmount(0);
    }, []);

    const activeCategory = categories[selectedCategoryIndex] || 'All';

    const gradients: any = {
        'All': 'linear-gradient(135deg, #facc15, #fb923c)',
        'Grocery': 'linear-gradient(135deg, #22c55e, #4ade80)',
        'Dairy': 'linear-gradient(135deg, #60a5fa, #93c5fd)',
        'Bakery': 'linear-gradient(135deg, #f59e0b, #fbbf24)',
        'Beverages': 'linear-gradient(135deg, #06b6d4, #67e8f9)',
        'Food & Beverages': 'linear-gradient(135deg, #06b6d4, #67e8f9)',
        'Snacks': 'linear-gradient(135deg, #f43f5e, #fb7185)',
        'Fruits & Vegetables': 'linear-gradient(135deg, #16a34a, #86efac)',
        'Meat & Seafood': 'linear-gradient(135deg, #dc2626, #f87171)',
        'Frozen Foods': 'linear-gradient(135deg, #0ea5e9, #bae6fd)',
        'Personal Care': 'linear-gradient(135deg, #a78bfa, #e9d5ff)',
        'Household': 'linear-gradient(135deg, #64748b, #cbd5f5)',
        'Stationery': 'linear-gradient(135deg, #f97316, #fdba74)',
        'Electronics': 'linear-gradient(135deg, #1e293b, #475569)',
        'Other': 'linear-gradient(135deg, #9ca3af, #e5e7eb)'
    };

    return (
        <div className="flex flex-col relative bg-white dark:bg-gray-900 min-h-full overflow-x-hidden">
            <PullToRefreshIndicator {...pullState} />

            {/* Redesigned Unified Header & Search Section */}
            <div
                className="relative pt-4 pb-12 transition-colors duration-500"
                style={{ background: gradients[activeCategory] || gradients['All'] }}
            >
                {/* Personalized Greeting Header */}
                <div className="px-4 flex items-center justify-between mb-3 pt-2">
                    <h1 className="text-lg font-black text-gray-900 tracking-tight animate-in slide-in-from-left duration-500">
                        Hey {user?.name?.split(' ')[0] || 'Member'}! 👋
                    </h1>
                    <div className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center border border-white/40 text-black shadow-sm">
                        <User size={16} />
                    </div>
                </div>

                {/* Main Action Text */}
                <div className="px-4 mb-4">
                    <h2 className="text-2xl font-black text-black leading-tight">{t.tapToAdd}</h2>
                </div>

                {/* Integrated Search Bar */}
                <div className="px-4 mb-6">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-green transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder={t['Search products...'] || 'Search products...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full border-none bg-white text-gray-900 rounded-2xl p-4 pl-12 placeholder-gray-400 shadow-xl shadow-black/5 focus:ring-2 focus:ring-primary-green outline-none transition-all font-bold text-base"
                        />
                        {isSupported && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                {!searchTerm && !isListening && !isProcessingVoice && !hasStartedVoice && (
                                    <div className="absolute -top-12 -right-1 bg-gray-800 text-white text-xs font-black px-4 py-2 rounded-2xl animate-bounce whitespace-nowrap shadow-[0_12px_30px_-8px_rgba(0,0,0,0.5)] border-2 border-white/5 flex flex-col items-center">
                                        <div className="leading-none tracking-tight">
                                            Try "Add Sugar"
                                        </div>
                                        <div className="w-3 h-3 bg-gray-800 rotate-45 absolute -bottom-1.5 right-4 border-r-2 border-b-2 border-white/5"></div>
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        if (isListening) {
                                            stopListening();
                                        } else {
                                            setHasStartedVoice(true);
                                            startListening();
                                        }
                                    }}
                                    disabled={isProcessingVoice}
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-50/50 backdrop-blur-md text-gray-400 hover:text-primary-green'} ${isProcessingVoice ? 'opacity-50 grayscale' : ''}`}
                                >
                                    {isProcessingVoice ? (
                                        <Loader2 size={18} className="animate-spin text-primary-green" />
                                    ) : (
                                        <Mic size={18} className={isListening ? 'animate-bounce' : ''} />
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Category Pills (Scrolled within header flow) */}
                {categories.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {categories.map((cat, index) => {
                            const icons: any = {
                                'All': '🛍️',
                                'Grocery': '🛒',
                                'Dairy': '🥛',
                                'Bakery': '🍞',
                                'Beverages': '🧃',
                                'Snacks': '🍿',
                                'Fruits & Vegetables': '🍎',
                                'Meat & Seafood': '🥩',
                                'Frozen Foods': '🧊',
                                'Personal Care': '🧴',
                                'Household': '🧹',
                                'Stationery': '✏️',
                                'Electronics': '🔌',
                                'Other': '📦'
                            };
                            const isActive = selectedCategoryIndex === index;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategoryIndex(index)}
                                    className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 transform active:scale-90 flex items-center gap-2 border ${isActive
                                        ? 'bg-black text-white border-black shadow-xl -translate-y-1'
                                        : 'bg-white/80 backdrop-blur-md text-gray-800 border-white/50 hover:bg-white shadow-sm'
                                        }`}
                                >
                                    <span className={isActive ? 'scale-125' : ''}>{icons[cat] || '📦'}</span>
                                    {cat === 'All' ? (t['All'] || 'All') : cat}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* The Transition Gradient: Fades the theme color into white */}
                <div className="absolute left-0 right-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white dark:to-gray-900 pointer-events-none" />
            </div>

            {/* Product Section: Integrated and overlapping the fade slightly for depth */}
            <div className="px-4 pb-48 -mt-8 relative z-10">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {sortedProducts.map((product, index) => (
                        <div
                            key={product._id}
                            className="animate-in fade-in slide-in-from-bottom-3 duration-300"
                            style={{ animationDelay: `${Math.min(index * 60, 600)}ms`, animationFillMode: 'backwards' }}
                        >
                            <BillingProductCard
                                product={product}
                                t={t}
                                cartItem={cart.find(item => item._id === product._id)}
                                addToCart={addToCart}
                                increaseQuantity={increaseQuantity}
                                decreaseQuantity={decreaseQuantity}
                                addToast={addToast}
                            />
                        </div>
                    ))}
                    {sortedProducts.length === 0 && (
                        <div className="col-span-full text-center py-20 bg-white/50 backdrop-blur-sm rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                            <Trash2 size={40} className="mx-auto mb-3 text-gray-300" />
                            <p className="font-black text-gray-400 uppercase tracking-widest text-sm">{t['No products found'] || 'No products found'}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky View Cart Button */}
            {!showCheckout && cart.length > 0 && (
                <div className="fixed bottom-24 left-4 right-4 md:bottom-6 md:left-72 md:right-8 z-40 animate-slide-up">
                    <button
                        onClick={() => setShowCheckout(true)}
                        className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-600 to-emerald-700 text-white p-4 shadow-2xl flex items-center justify-between active:scale-[0.98] transition-all duration-150"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl font-black text-sm flex items-center gap-1">
                                <span>{cart.reduce((a, b) => a + b.quantity, 0)}</span>
                                <span className="text-[10px] opacity-60">items</span>
                            </div>
                            <div className="flex flex-col items-start">
                                <span className="text-xs opacity-80 uppercase font-black tracking-wider">{t['Total Price'] || 'Total'}</span>
                                <span className="font-black text-xl tracking-tight leading-none">₹{cartTotal}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 font-black text-sm bg-white/10 px-3 py-2 rounded-xl backdrop-blur-md shadow-inner border border-white/5">
                            {t['View Bill'] || 'View Bill'} <ChevronRight size={16} />
                        </div>
                    </button>
                </div>
            )}

            {/* FULL SCREEN CHECKOUT MODAL */}
            {showCheckout && (
                <div className="fixed inset-0 z-[60] bg-gray-50 dark:bg-gray-900 flex flex-col animate-in slide-in-from-bottom duration-200">
                    {/* Header */}
                    <div className="bg-white dark:bg-gray-800 p-4 shadow-sm flex items-center gap-3">
                        <button
                            onClick={() => {
                                if (checkoutStep === 'SUMMARY') closeCheckout();
                                else if (checkoutStep === 'CUSTOMER') setCheckoutStep('SUMMARY');
                                else if (checkoutStep === 'PAYMENT' && !paymentMethod) setCheckoutStep('CUSTOMER');
                                else setPaymentMethod(null);
                            }}
                            className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                        >
                            <X size={24} />
                        </button>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center flex-1">
                            {checkoutStep === 'SUMMARY' ? t['Order Summary'] :
                                checkoutStep === 'CUSTOMER' ? t['Identify Customer'] : t['Select Payment']}
                        </h2>
                        {checkoutStep === 'SUMMARY' && (
                            <button
                                onClick={() => {
                                    if (window.confirm(t['Are you sure you want to clear the entire cart?'])) {
                                        clearCart();
                                        closeCheckout();
                                        addToast(t['Cart cleared'], 'info');
                                    }
                                }}
                                className="p-2 -mr-2 text-gray-400 hover:text-red-500 transition-colors"
                                title={t['Clear All']}
                            >
                                <Trash2 size={24} />
                            </button>
                        )}
                        {checkoutStep !== 'SUMMARY' && <div className="w-10" />} {/* Spacer for balance */}
                    </div>

                    {/* Step 1: SUMMARY */}
                    {checkoutStep === 'SUMMARY' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {translatedCart.map(item => (
                                    <CheckoutCartItem
                                        key={item._id}
                                        item={item}
                                        t={t}
                                        increaseQuantity={increaseQuantity}
                                        decreaseQuantity={decreaseQuantity}
                                        updateQuantity={updateQuantity}
                                        removeFromCart={removeFromCart}
                                        addToast={addToast}
                                    />
                                ))}
                            </div>
                            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 shadow-lg">
                                <div className="flex justify-between items-end mb-4">
                                    <span className="text-gray-500 font-medium">{t['Items']}: {cart.length}</span>
                                    <div className="text-right">
                                        <div className="text-3xl font-black text-gray-900 dark:text-white">₹{cartTotal}</div>
                                    </div>
                                </div>
                                <button onClick={() => setCheckoutStep('CUSTOMER')} className="w-full bg-primary-green text-white py-4 rounded-xl font-bold text-lg shadow-lg flex justify-center items-center gap-2">{t['Proceed']} <ChevronRight size={20} /></button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: CUSTOMER */}
                    {checkoutStep === 'CUSTOMER' && (
                        <div className="flex-1 p-6 overflow-y-auto w-full max-w-xl mx-auto">
                            {!isNewCustomer ? (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="bg-primary-green/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <User className="text-primary-green" size={40} />
                                        </div>
                                        <h3 className="text-2xl font-black text-gray-900 dark:text-white">{t['Select Customer']}</h3>
                                        <p className="text-gray-500 dark:text-gray-400">{t['Search by name or phone']}</p>
                                    </div>

                                    <div className="relative">
                                        <Search className="absolute left-4 top-4 text-gray-400" size={20} />
                                        <input
                                            type="text"
                                            placeholder={t['Type name or 10-digit phone...']}
                                            value={customerInput}
                                            onChange={(e) => setCustomerInput(e.target.value)}
                                            className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 py-4 px-12 rounded-2xl text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-primary-green transition-all shadow-sm"
                                        />
                                    </div>

                                    {/* Quick Suggestions */}
                                    <div className="space-y-2">
                                        {/* Display Local Matches First */}
                                        {filteredCustomers.map(cust => (
                                            <CustomerSuggestionRow
                                                key={cust._id}
                                                cust={cust}
                                                t={t}
                                                identifyCustomer={identifyCustomer}
                                                isGlobal={false}
                                            />
                                        ))}

                                        {/* Display Global Matches */}
                                        {globalResults.map(cust => (
                                            <CustomerSuggestionRow
                                                key={cust._id}
                                                cust={cust}
                                                t={t}
                                                identifyCustomer={identifyCustomer}
                                                isGlobal={true}
                                            />
                                        ))}

                                        {isGlobalLoading && (
                                            <div className="text-center py-4 text-gray-400 text-sm animate-pulse">
                                                {t['Searching globally...']}
                                            </div>
                                        )}

                                        {customerInput.length >= 3 && filteredCustomers.length === 0 && globalResults.length === 0 && !isGlobalLoading && (
                                            <div className="text-center py-6 text-gray-400">
                                                {t['No results found for']} "{customerInput}"
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-4">
                                        <button
                                            onClick={() => {
                                                setIsNewCustomer(true);
                                                if (/^\d{10}$/.test(customerInput)) setPhoneNumber(customerInput);
                                                else setCustomerName(customerInput);
                                            }}
                                            className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            <Plus size={20} /> {t['Register New Customer']}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
                                    <div className="text-center">
                                        <h3 className="text-2xl font-black text-gray-900 dark:text-white">{t['New Customer']}</h3>
                                        <p className="text-gray-500">{t['Add to your shop network']}</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">{t['Full Name']}</label>
                                            <input
                                                type="text"
                                                placeholder={t['e.g. Rahul Sharma']}
                                                value={customerName}
                                                onChange={(e) => setCustomerName(e.target.value)}
                                                className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 py-4 px-6 rounded-2xl text-xl font-bold text-gray-900 dark:text-white outline-none focus:border-primary-green transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-black text-gray-400 uppercase ml-2 mb-1 block">{t['Phone Number']}</label>
                                            <input
                                                type="tel"
                                                placeholder={t['10-digit mobile']}
                                                maxLength={10}
                                                value={phoneNumber}
                                                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                                                className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 py-4 px-6 rounded-2xl text-xl font-bold text-gray-900 dark:text-white outline-none focus:border-primary-green transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <button onClick={() => setIsNewCustomer(false)} className="flex-1 py-4 rounded-2xl font-black text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 transition-colors">{t['Back']}</button>
                                        <button
                                            onClick={() => identifyCustomer()}
                                            disabled={phoneNumber.length !== 10 || !customerName}
                                            className={`flex-[2] py-4 rounded-2xl font-black text-lg shadow-lg transition-all ${phoneNumber.length === 10 && customerName ? 'bg-primary-green text-white shadow-green-200' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                                        >
                                            {t['Save & Pay']}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: PAYMENT */}
                    {checkoutStep === 'PAYMENT' && (
                        <div className="flex-1 p-4 overflow-y-auto">
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <User size={24} className="text-gray-600" />
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white">{selectedCustomer?.name}</div>
                                        <div className="text-gray-500 font-medium flex items-center gap-1">
                                            <Phone size={14} /> {selectedCustomer?.phoneNumber}
                                        </div>
                                    </div>
                                </div>
                                <div className={`px-4 py-2 rounded-xl border-2 text-center ${getLedgerColor(selectedCustomer?.khataBalance || 0)}`}>
                                    <div className="text-xs uppercase font-bold">{t['Dues']}</div>
                                    <div className="text-lg font-black font-mono">₹{selectedCustomer?.khataBalance || 0}</div>
                                </div>
                            </div>

                            {/* Voice Language Selection for Recovery Calls */}
                            {paymentMethod === 'ledger' && (
                                <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Phone className="text-blue-600" size={18} />
                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Voice Call Language</span>
                                        </div>
                                        <select
                                            value={customerVoiceLanguage}
                                            onChange={async (e) => {
                                                const newLang = e.target.value;
                                                setCustomerVoiceLanguage(newLang);
                                                // Use _id (MongoDB) not id (IndexedDB) for API update
                                                if (selectedCustomer?._id) {
                                                    try {
                                                        await customerApi.update(selectedCustomer._id, { preferredVoiceLanguage: newLang });
                                                        addToast('Voice language updated!', 'success');
                                                    } catch (err) {
                                                        console.error('Failed to update voice language', err);
                                                    }
                                                } else if (selectedCustomer?.phoneNumber) {
                                                    // Fallback: try to update by phone number if _id not available
                                                    try {
                                                        await customerApi.update(selectedCustomer.phoneNumber, { preferredVoiceLanguage: newLang });
                                                        addToast('Voice language updated!', 'success');
                                                    } catch (err) {
                                                        console.error('Failed to update voice language', err);
                                                    }
                                                }
                                            }}
                                            className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 text-sm font-medium"
                                        >
                                            <option value="en">English</option>
                                            <option value="hi">हिंदी (Hindi)</option>
                                            <option value="te">తెలుగు (Telugu)</option>
                                        </select>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">This language will be used for automated recovery calls</p>
                                </div>
                            )}

                            {khataInfo && (
                                <div className={`mb-6 p-4 rounded-2xl bg-gradient-to-br border shadow-sm transition-all duration-300 ${khataInfo.riskLevel === 'STRONG'
                                    ? 'from-red-50 to-red-100 border-red-200 dark:from-red-900/20 dark:to-red-800/20 dark:border-red-800'
                                    : khataInfo.riskLevel === 'SOFT'
                                        ? 'from-orange-50 to-orange-100 border-orange-200 dark:from-orange-900/20 dark:to-orange-800/20 dark:border-orange-800'
                                        : 'from-primary-green/5 to-primary-green/20 border-primary-green/20'
                                    }`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2">
                                            <Award className={khataInfo.riskLevel === 'STRONG' ? 'text-red-500' : khataInfo.riskLevel === 'SOFT' ? 'text-orange-500' : 'text-primary-green'} size={20} />
                                            <span className="font-black text-gray-900 dark:text-white uppercase tracking-tighter">{t['Udhaar Score']}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-2xl font-black ${khataInfo.score >= 700 ? 'text-green-600' : khataInfo.score >= 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {khataInfo.score}
                                            </div>
                                            <div className={`text-[10px] font-black uppercase tracking-widest ${khataInfo.riskLevel === 'STRONG' ? 'text-red-600' : khataInfo.riskLevel === 'SOFT' ? 'text-orange-600' : 'text-green-600'}`}>
                                                {khataInfo.riskLevel} RISK
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500 font-bold">{t['Available Credit']}:</span>
                                            <span className={`font-black ${khataInfo.availableCredit - cartTotal < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                                                ₹{Math.max(0, khataInfo.availableCredit - cartTotal)} / ₹{khataInfo.limit}
                                                {khataInfo.availableCredit - cartTotal < 0 && (
                                                    <span className="text-[10px] ml-1 uppercase">(Exceeded by ₹{Math.abs(khataInfo.availableCredit - cartTotal)})</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden flex">
                                            <div
                                                className={`h-full transition-all duration-700 ${khataInfo.availableCredit - cartTotal < 0 ? 'bg-red-500 animate-pulse-fast' : 'bg-primary-green'
                                                    }`}
                                                style={{ width: `${Math.max(0, Math.min(100, ((khataInfo.availableCredit - cartTotal) / (khataInfo.limit || 1)) * 100))}%` }}
                                            />
                                        </div>
                                        {(khataInfo.riskMessage || khataInfo.reasons.length > 0) && (
                                            <div className={`mt-3 p-3 bg-white/50 dark:bg-black/20 rounded-lg ${khataInfo.riskLevel !== 'LOW' ? 'animate-pulse-fast shadow-md shadow-red-200' : ''}`}>
                                                <p className={`text-xs font-black leading-tight ${khataInfo.riskLevel === 'STRONG' ? 'text-red-700 dark:text-red-300' : khataInfo.riskLevel === 'SOFT' ? 'text-orange-700 dark:text-orange-300' : 'text-gray-500'}`}>
                                                    {khataInfo.riskLevel !== 'LOW' ? `⚠️ ${khataInfo.riskMessage}` : `💡 ${khataInfo.reasons[0]}`}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-6">
                                {/* Payment Method Selection */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">{t['Select Payment Method']}</h3>
                                    <div className="space-y-3">
                                        <PaymentOptionLabel
                                            value="cash"
                                            currentMethod={paymentMethod}
                                            onChange={setPaymentMethod}
                                            t={t}
                                            title="Cash"
                                            description="Pay with physical currency"
                                        />
                                        <PaymentOptionLabel
                                            value="online"
                                            currentMethod={paymentMethod}
                                            onChange={setPaymentMethod}
                                            t={t}
                                            title="UPI / Online"
                                            description="PhonePe, GPay, Paytm"
                                        />
                                        <PaymentOptionLabel
                                            value="ledger"
                                            currentMethod={paymentMethod}
                                            onChange={setPaymentMethod}
                                            t={t}
                                            title="Udhaar (Credit)"
                                            description="Pay on credit"
                                            cartTotal={cartTotal}
                                            khataInfo={khataInfo}
                                        />
                                    </div>
                                </div>

                                {/* Total Amount */}
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t['Total Amount']}</span>
                                        <span className="text-2xl font-black text-gray-900 dark:text-white">₹{cartTotal}</span>
                                    </div>
                                </div>

                                {/* Make Payment Button */}
                                <button
                                    onClick={paymentMethod === 'online' ? handleUpiPayment : paymentMethod === 'cash' ? handleCashPayment : () => handleLedgePayment()}
                                    disabled={!paymentMethod}
                                    className="w-full relative overflow-hidden rounded-2xl text-white py-5 font-black text-lg active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                                    style={!paymentMethod
                                        ? { background: '#374151' }
                                        : paymentMethod === 'cash'
                                            ? {
                                                background: 'linear-gradient(135deg,#1B5E20 0%,#2E7D32 50%,#388E3C 100%)',
                                                boxShadow: '0 8px 28px rgba(46,125,50,0.5), inset 0 1px 0 rgba(255,255,255,0.12)'
                                            }
                                            : paymentMethod === 'online'
                                                ? {
                                                    background: 'linear-gradient(135deg,#4A148C 0%,#7B1FA2 50%,#9C27B0 100%)',
                                                    boxShadow: '0 8px 28px rgba(123,31,162,0.5), inset 0 1px 0 rgba(255,255,255,0.12)'
                                                }
                                                : {
                                                    background: 'linear-gradient(135deg,#BF360C 0%,#EF6C00 50%,#FF8F00 100%)',
                                                    boxShadow: '0 8px 28px rgba(239,108,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)'
                                                }
                                    }
                                >
                                    {/* shimmer sweep */}
                                    {paymentMethod && (
                                        <div
                                            className="absolute inset-0 pointer-events-none"
                                            style={{
                                                background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.10) 50%,transparent 60%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'shimmer 2s infinite linear'
                                            }}
                                        />
                                    )}
                                    <span className="relative flex items-center justify-center gap-2">
                                        {paymentMethod === 'cash' && <span className="text-xl">💵</span>}
                                        {paymentMethod === 'online' && <span className="text-xl">📲</span>}
                                        {paymentMethod === 'ledger' && <span className="text-xl">📒</span>}
                                        {!paymentMethod && <span className="text-xl">💳</span>}
                                        {
                                            !paymentMethod ? t['Select a payment method']
                                                : paymentMethod === 'cash' ? `${t['Collect']} ₹${cartTotal} ${t['Cash']}`
                                                    : paymentMethod === 'online' ? `${t['Pay']} ₹${cartTotal} ${t['via UPI']}`
                                                        : `${t['Add']} ₹${cartTotal} ${t['to Udhaar']}`
                                        }
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )
            }

            {
                showStatusModal && (
                    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
                        {/* Cash Flood Animation */}
                        {animationType === 'cash' && isProcessing && (
                            <div className="absolute inset-0 pointer-events-none">
                                {Array.from({ length: 30 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="absolute animate-bounce text-4xl"
                                        style={{
                                            left: `${(i * 3.33 + Math.sin(i) * 10) % 100}%`, // Semi-random but deterministic
                                            top: `-10%`,
                                            animationDuration: `${0.5 + (i % 5) * 0.3}s`,
                                            animationDelay: `${(i % 10) * 0.2}s`,
                                            transform: `rotate(${i * 12}deg)`
                                        }}
                                    >
                                        💵
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-10 max-w-sm w-full text-center shadow-2xl animate-in zoom-in duration-300 relative z-10">
                            {isProcessing ? (
                                <div className="space-y-6">
                                    <div className="relative w-28 h-28 mx-auto">
                                        <div className={`absolute inset-0 border-8 ${animationType === 'online' ? 'border-purple-100 dark:border-purple-900' : animationType === 'cash' ? 'border-green-100 dark:border-green-900' : 'border-orange-100 dark:border-orange-900'} rounded-full`}></div>
                                        <div className={`absolute inset-0 border-8 ${animationType === 'online' ? 'border-purple-600' : animationType === 'cash' ? 'border-green-600' : 'border-orange-600'} border-t-transparent rounded-full animate-spin`}></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-4xl">
                                                {animationType === 'online' ? '📱' : animationType === 'cash' ? '💰' : '📒'}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                                            {animationType === 'online' ? t['Verifying UPI...'] : animationType === 'cash' ? t['Processing Cash...'] : t['Customer Verification']}
                                        </h3>
                                        {showOtpInput ? (
                                            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom duration-300">
                                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                                                    <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold">
                                                        📱 {t["OTP sent to customer's WhatsApp"]}
                                                    </p>
                                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                                        {selectedCustomer?.phoneNumber}
                                                    </p>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
                                                        {t['Enter 6-Digit Code']}
                                                    </label>
                                                    <div className="flex justify-center gap-2">
                                                        {[0, 1, 2, 3, 4, 5].map((index) => (
                                                            <input
                                                                key={index}
                                                                type="text"
                                                                maxLength={1}
                                                                value={otp[index] || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/\D/g, '');
                                                                    if (val) {
                                                                        const newOtp = otp.split('');
                                                                        newOtp[index] = val;
                                                                        setOtp(newOtp.join(''));
                                                                        // Auto-focus next input
                                                                        if (index < 5 && val) {
                                                                            const nextInput = e.target.parentElement?.children[index + 1] as HTMLInputElement;
                                                                            nextInput?.focus();
                                                                        }
                                                                    } else {
                                                                        const newOtp = otp.split('');
                                                                        newOtp[index] = '';
                                                                        setOtp(newOtp.join(''));
                                                                    }
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Backspace' && !otp[index] && index > 0) {
                                                                        const prevInput = e.currentTarget.parentElement?.children[index - 1] as HTMLInputElement;
                                                                        prevInput?.focus();
                                                                    }
                                                                }}
                                                                disabled={otpLoading}
                                                                className="w-12 h-14 text-center text-2xl font-black bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-primary-green focus:ring-2 focus:ring-primary-green/20 outline-none transition-all dark:text-white disabled:opacity-50"
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-3 pt-2">
                                                    <button
                                                        onClick={handleVerifyOtp}
                                                        disabled={otp.length !== 6 || otpLoading}
                                                        className="w-full bg-gradient-to-r from-primary-green to-emerald-500 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-green-500/20 disabled:opacity-50 disabled:grayscale transition-all active:scale-95 hover:shadow-2xl hover:shadow-green-500/30"
                                                    >
                                                        {otpLoading ? (
                                                            <span className="flex items-center justify-center gap-2">
                                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                </svg>
                                                                {t['Verifying...']}
                                                            </span>
                                                        ) : (
                                                            t['Confirm & Complete']
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            setShowOtpInput(false);
                                                            setIsProcessing(false);
                                                            setShowStatusModal(false);
                                                            setOtp('');
                                                        }}
                                                        className="w-full py-4 text-gray-500 font-bold hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                                                    >
                                                        {t['Cancel']}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 dark:text-gray-400 mt-4 font-medium animate-pulse">{t['Sending verification code...']}</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-in zoom-in duration-300">
                                    <div className="w-28 h-28 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200">
                                        <span className="text-6xl text-white">✓</span>
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{t['Success!']}</h3>
                                    <p className="text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest text-xs">
                                        {animationType === 'ledger' ? t['Udhaar Recorded'] : t['Payment Received']}
                                    </p>

                                    <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-700">
                                        <div className="text-4xl font-black text-gray-900 dark:text-white">₹{cartTotal}</div>
                                        <div className="text-[10px] text-gray-400 font-bold mt-1 uppercase">
                                            {animationType === 'ledger' ? t['Total Bill Amount'] : t['Total Amount Paid']}
                                        </div>
                                    </div>

                                    {/* Partial Khata Payment Add-on */}
                                    {animationType === 'ledger' && partialPaymentStep !== 'SUCCESS' && (
                                        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 space-y-4">
                                            {partialPaymentStep === 'NONE' && (
                                                <button
                                                    onClick={() => setPartialPaymentStep('AMOUNT')}
                                                    className="w-full relative group overflow-hidden bg-white dark:bg-gray-800 border-2 border-primary-green/30 hover:border-primary-green p-4 rounded-3xl transition-all active:scale-95 shadow-lg shadow-green-500/5 hover:shadow-green-500/10"
                                                >
                                                    <div className="flex items-center justify-between relative z-10">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-primary-green/10 rounded-2xl flex items-center justify-center text-xl">
                                                                💰
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{t['Pay Partial Amount']}</p>
                                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t['Reduce Udhaar Now']}</p>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="text-primary-green" size={20} />
                                                    </div>
                                                </button>
                                            )}

                                            {partialPaymentStep === 'AMOUNT' && (
                                                <div className="space-y-3 animate-in fade-in slide-in-from-bottom duration-200 text-left">
                                                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                                        <span>{t['Partial Amount']}</span>
                                                        <span className="text-primary-green">MAX ₹{cartTotal}</span>
                                                    </div>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">₹</span>
                                                        <input
                                                            type="number"
                                                            autoFocus
                                                            className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 py-4 pl-10 pr-4 rounded-2xl text-2xl font-black text-gray-900 dark:text-white outline-none focus:border-primary-green"
                                                            placeholder="0"
                                                            value={partialAmount || ''}
                                                            onChange={(e) => setPartialAmount(Math.min(cartTotal, Number(e.target.value)))}
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setPartialPaymentStep('NONE')}
                                                            className="flex-1 py-3 text-gray-500 font-bold text-sm"
                                                        >
                                                            {t['Back']}
                                                        </button>
                                                        <button
                                                            disabled={!partialAmount || partialAmount <= 0}
                                                            onClick={() => setPartialPaymentStep('METHOD')}
                                                            className="flex-[2] bg-primary-green text-white py-3 rounded-xl font-black shadow-lg disabled:opacity-50 text-sm"
                                                        >
                                                            {t['Next']}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {partialPaymentStep === 'METHOD' && (
                                                <div className="space-y-3 animate-in fade-in slide-in-from-bottom duration-200">
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t['Select Payment Method']}</p>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <button
                                                            onClick={() => handlePartialCashPayment(partialAmount)}
                                                            className="flex flex-col items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 rounded-2xl hover:bg-green-100 transition-all"
                                                        >
                                                            <span className="text-2xl">💵</span>
                                                            <span className="text-[10px] font-black text-green-700 uppercase">{t['Cash']}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handlePartialUpiPayment(partialAmount)}
                                                            className="flex flex-col items-center gap-2 p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 rounded-2xl hover:bg-purple-100 transition-all"
                                                        >
                                                            <span className="text-2xl">📲</span>
                                                            <span className="text-[10px] font-black text-purple-700 uppercase">{t['UPI']}</span>
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={() => setPartialPaymentStep('AMOUNT')}
                                                        className="w-full py-2 text-gray-400 text-[10px] font-bold uppercase"
                                                    >
                                                        {t['Change Amount']}
                                                    </button>
                                                </div>
                                            )}

                                            {partialPaymentStep === 'PROCESSING' && (
                                                <div className="py-8 flex flex-col items-center gap-4">
                                                    <div className="w-10 h-10 border-4 border-primary-green border-t-transparent rounded-full animate-spin" />
                                                    <p className="text-sm font-bold text-gray-500 animate-pulse">{t['Processing Payment...']}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {partialPaymentStep === 'SUCCESS' && (
                                        <div className="mt-8 p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-3xl animate-in zoom-in duration-300">
                                            <p className="text-green-700 dark:text-green-300 font-black text-lg">
                                                ✅ ₹{partialAmount} {t['Payment Received!']}
                                            </p>
                                            <p className="text-xs text-green-600/70 font-bold uppercase mt-1">
                                                {t['Updated Balance']}: ₹{cartTotal - partialAmount}
                                            </p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-3 gap-3 mt-8">
                                        <button
                                            onClick={handleDownloadPDF}
                                            className="flex flex-col items-center justify-center gap-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            <Download size={18} className="text-gray-700 dark:text-white" />
                                            <span className="text-[10px] font-bold text-gray-700 dark:text-white">{t['Invoice']}</span>
                                        </button>
                                        <button
                                            onClick={handleSharePDF}
                                            className="flex flex-col items-center justify-center gap-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            <Share2 size={18} className="text-gray-700 dark:text-white" />
                                            <span className="text-[10px] font-bold text-gray-700 dark:text-white">{t['Share']}</span>
                                        </button>
                                        <button
                                            onClick={handleSendBillOnWhatsApp}
                                            disabled={!latestBillId || sendingBillWhatsApp}
                                            className="flex flex-col items-center justify-center gap-1 p-3 bg-emerald-50 dark:bg-emerald-900/40 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors disabled:opacity-50"
                                        >
                                            <MessageCircle size={18} className="text-emerald-700 dark:text-emerald-300" />
                                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                                {sendingBillWhatsApp ? '...' : 'WhatsApp'}
                                            </span>
                                        </button>
                                    </div>

                                    {(animationType !== 'ledger' || partialPaymentStep === 'SUCCESS' || partialPaymentStep === 'NONE') && (
                                        <button
                                            onClick={handleTransactionComplete}
                                            className="mt-8 w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-transform"
                                        >
                                            {t['OK, NEXT BILL']}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {showRiskConfirmation && (
                <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-[2rem] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
                            <X className="text-red-600" size={32} />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">{t['High Risk Transaction']}</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
                            {khataInfo?.riskMessage || t['This customer has exceeded their limit or has a poor score.']}
                            <br /><br />
                            {t['Are you sure you want to give Udhaar?']}
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    setShowRiskConfirmation(false);
                                    handleLedgePayment(true);
                                }}
                                className="w-full bg-red-600 text-white py-4 rounded-xl font-black shadow-lg shadow-red-200 active:scale-95 transition-all"
                            >
                                {t['Yes, Proceed Anyways']}
                            </button>
                            <button
                                onClick={() => setShowRiskConfirmation(false)}
                                className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-4 rounded-xl font-black active:scale-95 transition-all"
                            >
                                {t['No, Go Back']}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};


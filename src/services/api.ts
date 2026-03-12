import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001/api';

const api = axios.create({
    baseURL: API_BASE_URL,
});

// Interceptor to add token to headers
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export interface Customer {
    _id: string;
    phoneNumber: string;
    name?: string;
    email?: string;
    khataBalance?: number;
    khataScore?: number;
    khataLimit?: number;
    isLocal?: boolean;
}

export interface WhatsAppOrderItem {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
}

export interface WhatsAppOrder {
    _id: string;
    customerPhone: string;
    customerMessage: string;
    parsedText?: string;
    mediaUrl?: string;
    referenceCode?: string;
    reviewState?: 'none' | 'needs_manual_review' | 'awaiting_customer_choice';
    reviewReason?: string;
    autoDecisionReason?: string;
    resolutionSource?: 'auto' | 'customer_choice' | 'shopkeeper_edit';
    channel: 'whatsapp_text' | 'whatsapp_audio';
    status: 'received' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
    items: WhatsAppOrderItem[];
    totalAmount: number;
    convertedBillId?: string;
    convertedAt?: string;
    createdAt: string;
    customerId?: {
        _id: string;
        name?: string;
        phoneNumber?: string;
    };
}

export const authApi = {
    login: (data: Record<string, unknown>) => api.post('/auth/login', data),
    register: (data: Record<string, unknown>) => api.post('/auth/register', data),
    getMe: () => api.get('/auth/me'),
};

export const productApi = {
    getAll: () => api.get('/products'),
    create: (data: Record<string, unknown>) => api.post('/products', data),
    update: (id: string, data: Record<string, unknown>) => api.patch(`/products/${id}`, data),
    seed: () => api.post('/products/seed', {}),
};

export const customerApi = {
    getAll: () => api.get('/customers'),
    getByPhone: (phone: string) => api.get(`/customers/${phone}`),
    search: (query: string) => api.get(`/customers/search?q=${query}`),
    create: (data: any) => api.post('/customers', data),
    seed: () => api.post('/customers/seed', {}),
    update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
};

export const billApi = {
    getAll: () => api.get('/bills'),
    create: (data: { customerPhoneNumber: string; items: Array<{ productId: string; quantity: number; price: number }>; paymentType: string }) =>
        api.post('/bills', data),
    sendKhataOtp: (customerPhoneNumber: string) =>
        api.post('/bills/khata/send-otp', { customerPhoneNumber }),
    verifyKhataOtp: (data: { customerPhoneNumber: string; otp: string; billData: any }) =>
        api.post('/bills/khata/verify-otp', data),
    // Razorpay: creates a server-side order and returns orderId + keyId
    createRazorpayOrder: (amountInPaise: number) =>
        api.post('/bills/razorpay/create-order', { amount: amountInPaise }),
    // Razorpay: verifies signature and creates the bill in DB
    verifyRazorpayPayment: (data: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
        billData: { customerPhoneNumber: string; items: Array<{ productId: string; quantity: number; price: number }> };
    }) => api.post('/bills/razorpay/verify-payment', data),
    sendBillOnWhatsApp: (billId: string) => api.post(`/bills/${billId}/send-whatsapp`),
};

export const ledgerApi = {
    getCustomerLedger: (customerId: string) => api.get(`/ledger/customer/${customerId}`),
    recordPayment: (data: { customerId: string; amount: number; paymentMode: string }) =>
        api.post('/ledger/payment', data),
};

export const groupBuyApi = {
    getAll: (params?: { latitude?: number; longitude?: number; radius?: number }) =>
        api.get('/group-buy', { params }),
    create: (data: any) => api.post('/group-buy', data),
    join: (id: string, customerId: string, units: number = 1) =>
        api.patch(`/group-buy/${id}/join`, { customerId, units }),
};

export const analyticsApi = {
    getInsights: () => api.get('/analytics/insights'),
};

export const supplierBillApi = {
    process: (data: { lineItems: any[] }) => api.post('/supplier-bills/process', data),
    getHistory: () => api.get('/supplier-bills'),
};

export const invoiceApi = {
    getInvoices: () => api.get('/invoices'),
    getOverdueInvoices: () => api.get('/invoices/overdue'),
    createDemoInvoice: (data: any) => api.post('/invoices', data),
    markInvoicePaid: (id: string) => api.put(`/invoices/${id}/payment`),
    importKhataDues: () => api.post('/invoices/import-khata'),
    recoverNow: (customerId: string) => api.post(`/invoices/recover-now/${customerId}`),
    getRecoveryState: (invoiceId: string, since?: string) =>
        api.get(`/invoices/recovery-state/${invoiceId}`, { params: since ? { since } : undefined }),
};

export const whatsappApi = {
    getAnalytics: () => api.get('/whatsapp/analytics'),
    broadcastReminders: () => api.post('/whatsapp/broadcast-reminders'),
    getOrders: () => api.get<WhatsAppOrder[]>('/whatsapp/orders'),
    updateOrderStatus: (id: string, status: WhatsAppOrder['status']) => api.patch(`/whatsapp/orders/${id}/status`, { status }),
    updateOrderItems: (id: string, items: Array<{ productId: string; quantity: number }>) =>
        api.patch(`/whatsapp/orders/${id}/items`, { items }),
    fetchOrderMedia: (id: string) => api.get(`/whatsapp/orders/${id}/media`, { responseType: 'blob' }),
    convertOrderToBill: (id: string) => api.post(`/whatsapp/orders/${id}/convert-to-bill`, {}),
};

// ── GST & ITR API ────────────────────────────────────────────────────────────
export interface GSTSummary {
    month: number;
    year: number;
    totalSales: number;
    totalOutputGST: number;
    totalInputGST: number;
    netGSTPayable: number;
    outputCGST: number;
    outputSGST: number;
    inputCGST: number;
    inputSGST: number;
}

export interface ITRSummary {
    month: number;
    year: number;
    revenue: number;
    revenueExGST: number;
    purchaseCost: number;
    grossProfit: number;
    gstCollected: number;
    gstPaid: number;
    netGSTPayable: number;
    estimatedTaxableIncome: number;
    disclaimer: string;
}

export const gstApi = {
    // Classify a product (uses DB cache then OpenAI)
    classifyProduct: (name: string, productId?: string) =>
        api.post('/gst/classify', { name, productId }),

    // Bulk-classify all unclassified products
    classifyAll: () =>
        api.post('/gst/classify-all'),

    // Preview GST calculation without persisting
    calculate: (items: any[]) =>
        api.post('/gst/calculate', { items }),

    // Create a sale GST invoice (persists + ledger entry)
    createSaleInvoice: (data: { items: any[]; customerId?: string; billId?: string }) =>
        api.post('/gst/invoices', { ...data }),

    // Create a purchase GST entry (supplier purchase)
    createPurchaseEntry: (data: { items: any[]; supplierBillId?: string }) =>
        api.post('/gst/purchases', { ...data }),

    // List GST invoices
    getInvoices: (params?: { type?: string; month?: number; year?: number }) =>
        api.get('/gst/invoices', { params }),

    // List GST ledger entries
    getLedger: (params?: { type?: string; month?: number; year?: number }) =>
        api.get('/gst/ledger', { params }),

    // Monthly GST summary
    getGSTSummary: (month: number, year: number) =>
        api.get<GSTSummary>('/reports/gst-summary', { params: { month, year } }),

    // Monthly ITR assistance summary
    getITRSummary: (month: number, year: number) =>
        api.get<ITRSummary>('/reports/itr-summary', { params: { month, year } }),
};


export default api;


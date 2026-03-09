import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

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
    importKhataDues: () => api.post('/invoices/import-khata')
};

export default api;

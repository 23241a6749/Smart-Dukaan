import { BrowserRouter, Routes, Route } from 'react-router-dom';
import GroupBuyPage from './features/deals/GroupBuyPage';
import { KhataPage } from './features/khata/KhataPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { CustomerPage } from './features/customers/CustomerPage';
import { ProductPage } from './features/products/ProductPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { LedgerPage } from './features/ledger/LedgerPage';
import { SupplierBillPage } from './features/supplier/SupplierBillPage';
import WhatsAppPage from './features/whatsapp/WhatsAppPage';
import RecoveryPage from './features/recovery/RecoveryPage';
import GSTReportPage from './features/gst/GSTReportPage';
import ExpiryWastePage from './features/expiry/ExpiryWastePage';
import { CartProvider } from './contexts/CartContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import AuthSuccess from './features/auth/AuthSuccess';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import DashboardLayout from './pages/Dashboard/DashboardLayout';
import Home from './pages/Dashboard/Home';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <LanguageProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/auth-success" element={<AuthSuccess />} />

                <Route path="/app" element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Home />} />
                  <Route path="deals" element={<GroupBuyPage />} />
                  <Route path="khata" element={<KhataPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="customers" element={<CustomerPage />} />
                  <Route path="products" element={<ProductPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="supplier-bills" element={<SupplierBillPage />} />
                  <Route path="ledger" element={<LedgerPage />} />
                  <Route path="whatsapp" element={<WhatsAppPage />} />
                  <Route path="recovery" element={<RecoveryPage />} />
                  <Route path="records" element={<LedgerPage />} />
                  <Route path="gst" element={<GSTReportPage />} />
                  <Route path="expiry" element={<ExpiryWastePage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </LanguageProvider>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

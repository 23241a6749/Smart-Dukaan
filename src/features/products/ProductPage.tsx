import React, { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, Edit2, X, Package, Tag, Archive, BarChart2, Hash, CalendarDays, Layers, Trash2, AlertOctagon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productApi, expiryApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useTranslate } from '../../hooks/useTranslate';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../../components/PullToRefreshIndicator';

interface Product {
  _id?: string;
  name: string;
  price: number;
  stock: number;
  minStock: number;
  category: string;
  icon: string;
  unit: string;
  expiryDate?: string;
  batches?: any[];
}

const CATEGORIES = [
  'Grocery', 'Dairy', 'Bakery', 'Beverages', 'Snacks',
  'Fruits & Vegetables', 'Meat & Seafood', 'Frozen Foods',
  'Personal Care', 'Household', 'Stationery', 'Electronics', 'Other'
];

const UNITS = [
  { value: 'piece', label: 'Piece (pc)' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'litre', label: 'Litre (L)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'ml', label: 'Millilitre (ml)' },
  { value: 'pack', label: 'Pack' },
  { value: 'dozen', label: 'Dozen' },
];

const ProductCard = React.memo(({ product, onEdit }: { product: Product, onEdit: (p: Product) => void }) => {
  // FEFO Sort for consistency
  const sortedBatches = product.batches ? [...product.batches].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) {
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    } else if (a.expiryDate) {
      return -1;
    } else if (b.expiryDate) {
      return 1;
    }
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  }) : [];

  const activeBatch = sortedBatches[0];
  const hasDiscount = activeBatch?.discountedPrice !== undefined && activeBatch?.quantityAvailable > 0;
  const effectivePrice = hasDiscount ? activeBatch.discountedPrice : product.price;
  const saveAmount = hasDiscount ? Math.max(0, product.price - activeBatch.discountedPrice) : 0;

  let badgeText = '';
  let badgeColor = 'bg-gray-100 text-gray-500';

  if (hasDiscount) {
    badgeText = saveAmount > 0 ? `Save ₹${saveAmount}` : 'Expiring Soon ⚠️';
    badgeColor = 'bg-orange-500 text-white animate-pulse';
  } else if (product.stock <= product.minStock) {
    badgeText = 'Low Stock';
    badgeColor = 'bg-red-500 text-white';
  } else {
    badgeText = product.category;
  }

  return (
    <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md hover:border-green-100 transition-all group relative overflow-hidden">
      <div className="flex justify-between items-start">
        <div className="flex gap-4">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-3xl shadow-inner uppercase font-black text-primary-green relative">
            {product.icon || (product.name ? product.name[0] : '📦')}
          </div>
          <div className="space-y-1">
            <div className="font-black text-gray-900 text-lg leading-tight">{product.name}</div>
            <div className="flex items-center gap-2">
              <span className={`${badgeColor} px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors`}>
                {badgeText}
              </span>
              <span className="text-[10px] text-gray-300 font-black tracking-widest">{product.unit.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => onEdit(product)}
          className="p-2.5 bg-gray-50 text-gray-400 hover:text-primary-green hover:bg-green-50 rounded-xl transition-all"
        >
          <Edit2 size={18} />
        </button>
      </div>

      <div className="mt-5 flex justify-between items-end border-t border-gray-50 pt-4">
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase mb-1">Price</div>
          <div className="text-2xl font-black text-primary-green flex items-center gap-2">
            ₹{effectivePrice}
            {hasDiscount && <span className="text-xs text-gray-400 line-through">₹{product.price}</span>}
            <span className="text-sm text-gray-400 font-bold"> / {product.unit}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black text-gray-400 uppercase mb-1">Stock</div>
          <div className={`text-xl font-black ${product.stock <= product.minStock ? 'text-red-500' : 'text-gray-900'}`}>
            {product.stock} <span className="text-sm text-gray-400 font-bold">{product.unit}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

const FormField = ({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
      {icon && <span className="text-gray-300">{icon}</span>}
      {label}
    </label>
    {children}
  </div>
);

const inputClass = "w-full bg-gray-50 border-2 border-transparent py-3 px-4 rounded-2xl font-bold text-gray-900 text-sm focus:border-primary-green focus:bg-white outline-none transition-all placeholder-gray-300";

export const ProductPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const { t } = useLanguage();
  const translatedProducts = useTranslate(products, ['name', 'category']);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Product & { expiryDate: string }>({
    name: '', price: 0, stock: 0, minStock: 5, category: '', icon: '📦', unit: 'piece', expiryDate: ''
  });

  const loadProducts = React.useCallback(async () => {
    try {
      const response = await productApi.getAll();
      setProducts(response.data);
    } catch (err) {
      console.error('Failed to load products', err);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const pullState = usePullToRefresh({ onRefresh: loadProducts });

  const handleSave = React.useCallback(async () => {
    if (!formData.name || formData.price <= 0 || formData.stock < 0) {
      addToast('Please fill all fields correctly', 'error');
      return;
    }

    try {
      if (editingId) {
        await productApi.update(editingId, formData as any);
        addToast('Product updated successfully', 'success');
      } else {
        // Create product first
        const productResponse = await productApi.create(formData as any);
        const productId = productResponse.data._id;

        // If expiry date is provided, create an inventory batch with expiry
        if (formData.expiryDate) {
          try {
            await expiryApi.createBatch({
              productId: productId,
              quantity: formData.stock,
              costPricePerUnit: formData.price * 0.7, // Assume 70% of selling price as cost
              sellingPriceSnapshot: formData.price,
              expiryDate: formData.expiryDate,
            });
            addToast('Product added with expiry tracking!', 'success');
          } catch (batchErr) {
            console.error('Failed to create batch:', batchErr);
            addToast('Product added but failed to create expiry batch', 'error');
          }
        } else {
          addToast('Product added successfully', 'success');
        }
      }
      setFormData({ name: '', price: 0, stock: 0, minStock: 5, category: '', icon: '📦', unit: 'piece', expiryDate: '' });
      setEditingId(null);
      setShowForm(false);
      loadProducts();
    } catch (err) {
      console.error('Failed to save product', err);
      addToast('Failed to save product', 'error');
    }
  }, [formData, editingId, addToast, loadProducts]);

  const handleDelete = React.useCallback(async () => {
    if (!editingId) return;
    setIsDeleting(true);
    try {
      await productApi.delete(editingId);
      addToast('Product deleted successfully', 'success');
      setFormData({ name: '', price: 0, stock: 0, minStock: 5, category: '', icon: '📦', unit: 'piece', expiryDate: '' });
      setEditingId(null);
      setShowDeleteConfirm(false);
      setShowForm(false);
      loadProducts();
    } catch (err: any) {
      console.error('Failed to delete product', err);
      addToast(err?.response?.data?.message || 'Failed to delete product. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [editingId, addToast, loadProducts]);

  const startEdit = React.useCallback((product: Product) => {
    setEditingId(product._id!);
    setFormData({
      name: product.name,
      price: product.price,
      stock: product.stock,
      minStock: product.minStock,
      category: product.category,
      icon: product.icon,
      unit: product.unit,
      expiryDate: product.expiryDate || '',
    });
    setShowForm(true);
  }, []);

  const filteredProducts = React.useMemo(() => {
    return translatedProducts.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [translatedProducts, searchTerm]);

  const lowStockProducts = React.useMemo(() => {
    return products.filter(p => p.stock <= p.minStock);
  }, [products]);

  const set = (field: keyof typeof formData, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      {/* Glossy Yellow/Orange Background with Horizontal Fade */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[400%] h-[320px] z-0 pointer-events-none transition-all duration-700"
        style={{
          background: 'linear-gradient(to bottom, #facc15 0%, #fb923c 240px, white 320px)'
        }}
      />

      <div className="relative z-10 space-y-8 max-w-5xl mx-auto px-4 pt-10 pb-48">
        <PullToRefreshIndicator {...pullState} />

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="animate-in fade-in slide-in-from-left duration-700">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              {t['Products']} 📦
            </h2>
            <p className="text-black/60 text-sm font-bold uppercase tracking-widest mt-2 bg-black/5 inline-block px-3 py-1 rounded-full backdrop-blur-sm">
              {t['Inventory Command Center'] || 'Inventory Command Center'}
            </p>
          </div>
          <button
            onClick={() => navigate('/app/supplier-bills')}
            className="w-full sm:w-auto bg-black/10 hover:bg-black/20 text-gray-900 px-8 py-4 rounded-[2rem] flex items-center justify-center gap-3 font-black transition-all hover:scale-105 active:scale-95 group border border-black/5 backdrop-blur-sm"
          >
            <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
            {t['Add to Stock'] || 'Add to Stock'}
          </button>
        </div>

        {/* Search & Intelligence Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 transition-colors" size={22} />
            <input
              type="text"
              placeholder={t['Search by name or category...'] || 'Search by name or category...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/95 backdrop-blur-xl border-0 ring-4 ring-transparent focus:ring-blue-500/20 py-5 px-16 rounded-[2.5rem] text-lg font-bold text-gray-900 outline-none transition-all shadow-2xl shadow-blue-900/10 placeholder-gray-400"
            />
          </div>
          <div className="bg-white/95 backdrop-blur-xl p-6 rounded-[2.5rem] flex items-center justify-between shadow-2xl shadow-blue-900/10 border border-white">
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Catalog Size</div>
              <div className="text-3xl font-black text-gray-900">{products.length}</div>
            </div>
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
              <Archive className="text-blue-600" size={32} />
            </div>
          </div>
        </div>

        {/* Alerts & Critical Notifications */}
        {lowStockProducts.length > 0 && (
          <div className="bg-red-500/90 backdrop-blur-xl p-5 rounded-[2.5rem] flex items-center gap-4 text-white shadow-xl animate-in shake duration-500">
            <div className="p-3 bg-white/20 rounded-2xl">
              <AlertTriangle className="text-white" size={24} />
            </div>
            <div className="flex-1">
              <div className="font-black text-lg leading-none">Restock Required</div>
              <div className="text-sm font-bold text-red-100 mt-1 opacity-90">
                {lowStockProducts.length} item{lowStockProducts.length > 1 ? 's are' : ' is'} below minimum capacity.
              </div>
            </div>
            <div className="h-4 w-4 bg-white rounded-full animate-ping mr-2" />
          </div>
        )}

        {/* Product Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product._id} product={product} onEdit={startEdit} />
          ))}
          {filteredProducts.length === 0 && (
            <div className="md:col-span-2 text-center py-32 bg-gray-50/50 rounded-[3rem] border-4 border-dashed border-gray-100">
              <Archive size={64} className="mx-auto mb-6 text-gray-200" />
              <p className="font-black text-2xl text-gray-400 uppercase tracking-widest">{t['No Inventory Found'] || 'No Inventory Found'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-8 pt-7 pb-5 border-b border-gray-100">
              <div>
                <h3 className="text-2xl font-black text-gray-900">{editingId ? 'Edit Product' : 'New Product'}</h3>
                <p className="text-gray-400 text-sm mt-0.5">{editingId ? 'Update product details' : 'Add a new item to your shop inventory'}</p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-400 transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto px-8 py-6 space-y-5 flex-1">
              {/* Product Name */}
              <FormField label="Product Name" icon={<Package size={14} />}>
                <div className="relative">
                  <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                  <input
                    type="text"
                    placeholder="e.g. Basmati Rice"
                    value={formData.name}
                    onChange={(e) => set('name', e.target.value)}
                    className={`${inputClass} pl-11`}
                  />
                </div>
              </FormField>

              {/* Price & Stock */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Price (₹)" icon={<Tag size={14} />}>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={formData.price}
                      onChange={(e) => set('price', Number(e.target.value))}
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                </FormField>
                <FormField label="Stock Count" icon={<BarChart2 size={14} />}>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => set('stock', Number(e.target.value))}
                    className={inputClass}
                  />
                </FormField>
              </div>

              {/* Min Stock & Unit */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Minimum Stock" icon={<Hash size={14} />}>
                  <input
                    type="number"
                    min="0"
                    value={formData.minStock}
                    onChange={(e) => set('minStock', Number(e.target.value))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Unit" icon={<Layers size={14} />}>
                  <select
                    value={formData.unit}
                    onChange={(e) => set('unit', e.target.value)}
                    className={inputClass}
                  >
                    {UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              {/* Category */}
              <FormField label="Category">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full pr-1 px-1">
                  {CATEGORIES.map(c => {
                    const icons: any = {
                      'Grocery': '🛒', 'Dairy': '🥛', 'Bakery': '🍞', 'Beverages': '🧃', 'Snacks': '🍿',
                      'Fruits & Vegetables': '🍎', 'Meat & Seafood': '🥩', 'Frozen Foods': '🧊',
                      'Personal Care': '🧴', 'Household': '🧹', 'Stationery': '✏️', 'Electronics': '🔌', 'Other': '📦'
                    };
                    const gradients: any = {
                      'Grocery': 'from-green-500 to-green-400',
                      'Dairy': 'from-blue-500 to-blue-400',
                      'Bakery': 'from-amber-500 to-yellow-500',
                      'Beverages': 'from-cyan-500 to-cyan-400',
                      'Snacks': 'from-red-500 to-pink-500',
                      'Fruits & Vegetables': 'from-green-600 to-emerald-500',
                      'Meat & Seafood': 'from-red-600 to-rose-500',
                      'Frozen Foods': 'from-sky-500 to-blue-400',
                      'Personal Care': 'from-purple-500 to-fuchsia-400',
                      'Household': 'from-slate-500 to-gray-400',
                      'Stationery': 'from-orange-500 to-amber-500',
                      'Electronics': 'from-slate-800 to-gray-700',
                      'Other': 'from-gray-400 to-slate-400'
                    };
                    const isSelected = formData.category === c;

                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => set('category', c)}
                        className={`p-3 rounded-2xl text-white flex flex-col items-center justify-center gap-1.5 transition-all duration-200 transform hover:scale-[1.03] active:scale-[0.97] shadow-sm relative overflow-hidden ${isSelected ? 'ring-4 ring-offset-2 ring-primary-green opacity-100 scale-105 shadow-md' : 'opacity-80 hover:opacity-100'} bg-gradient-to-br ${gradients[c] || 'from-gray-400 to-gray-300'}`}
                      >
                        <div className="text-2xl">{icons[c] || '📦'}</div>
                        <div className="text-[10px] font-black text-center leading-tight tracking-wide uppercase">{c}</div>
                      </button>
                    );
                  })}
                </div>
              </FormField>

              {/* Expiry Date */}
              <FormField label="Expiry Date (optional)" icon={<CalendarDays size={14} />}>
                <div className="relative">
                  <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => set('expiryDate', e.target.value)}
                    className={`${inputClass} pl-11`}
                  />
                </div>
              </FormField>

              {/* Delete Danger Zone — only visible when editing */}
              {editingId && (
                <div className="border-t border-dashed border-red-100 pt-5">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-red-500 bg-red-50 hover:bg-red-100 active:scale-95 transition-all text-sm disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                    Delete this product
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-8 pb-7 pt-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3.5 rounded-2xl font-black text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-[2] bg-primary-green text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-green-200 hover:brightness-105 active:scale-95 transition-all"
              >
                {editingId ? 'Update Product' : 'Add to Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-5">
              <AlertOctagon className="text-red-500" size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2">Delete Product?</h3>
            <p className="text-sm text-gray-500 font-medium mb-6">
              Are you sure you want to delete <span className="font-black text-gray-800">{formData.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-3 rounded-2xl font-black text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-3 rounded-2xl font-black text-white bg-red-500 hover:bg-red-600 transition-colors text-sm shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Yes, Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


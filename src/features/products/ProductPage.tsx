import React, { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, Edit2, X, Package, Tag, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface Product {
  _id?: string;
  name: string;
  price: number;
  stock: number;
  minStock: number;
  category: string;
  icon: string;
  unit: string;
}

export const ProductPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: '', price: 0, stock: 0, minStock: 5, category: '', icon: '📦', unit: 'piece' });

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const response = await productApi.getAll();
      setProducts(response.data);
    } catch (err) {
      console.error('Failed to load products', err);
    }
  }

  const handleSave = async () => {
    if (!formData.name || formData.price <= 0 || formData.stock < 0) {
      addToast('Please fill all fields correctly', 'error');
      return;
    }

    try {
      if (editingId) {
        await productApi.update(editingId, formData);
        addToast('Product updated successfully', 'success');
      } else {
        await productApi.create(formData);
        addToast('Product added successfully', 'success');
      }
      setFormData({ name: '', price: 0, stock: 0, minStock: 5, category: '', icon: '📦', unit: 'piece' });
      setEditingId(null);
      setShowForm(false);
      loadProducts();
    } catch (err) {
      console.error('Failed to save product', err);
      addToast('Failed to save product', 'error');
    }
  };

  const startEdit = (product: Product) => {
    setEditingId(product._id!);
    setFormData({
      name: product.name,
      price: product.price,
      stock: product.stock,
      minStock: product.minStock,
      category: product.category,
      icon: product.icon,
      unit: product.unit
    });
    setShowForm(true);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = filteredProducts.filter(p => p.stock <= p.minStock);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-48">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white">Shop Inventory</h2>
          <p className="text-gray-500 text-sm font-medium">Manage prices, stock, and categories</p>
        </div>
        <button
          onClick={() => navigate('/supplier-bills')}
          className="bg-primary-green text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-lg shadow-green-200 dark:shadow-none hover:scale-105 transition-transform"
        >
          <Plus size={20} /> Add Product
        </button>
      </div>

      {/* Quick Stats & Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-4 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by name or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 py-4 px-12 rounded-2xl text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-primary-green transition-all shadow-sm"
          />
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase">Total Items</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">{products.length}</div>
          </div>
          <Archive className="text-gray-200" size={32} />
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-100 dark:border-red-900/30 p-4 rounded-2xl flex items-start gap-3 animate-pulse">
          <AlertTriangle className="text-red-500 mt-1" size={24} />
          <div>
            <div className="font-black text-red-900 dark:text-red-200">Attention: Low Stock Alert!</div>
            <div className="text-sm text-red-700 dark:text-red-400 font-medium">
              {lowStockProducts.length} items are below minimum capacity. Reorder soon.
            </div>
          </div>
        </div>
      )}

      {/* Product List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredProducts.map((product) => (
          <div key={product._id} className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start">
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-2xl flex items-center justify-center text-4xl shadow-inner uppercase font-black text-gray-400">
                  {product.icon || (product.name ? product.name[0] : '📦')}
                </div>
                <div className="space-y-1">
                  <div className="font-black text-gray-900 dark:text-white text-xl leading-tight">{product.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">{product.category}</span>
                    <span className="text-[10px] text-gray-300 font-black tracking-widest">{product.unit.toUpperCase()}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => startEdit(product)}
                className="p-3 bg-gray-50 dark:bg-gray-700 text-gray-400 hover:text-primary-green hover:bg-green-50 rounded-xl transition-all"
              >
                <Edit2 size={20} />
              </button>
            </div>

            <div className="mt-6 flex justify-between items-end border-t border-gray-50 dark:border-gray-700 pt-4">
              <div>
                <div className="text-[10px] font-black text-gray-400 uppercase mb-1">Price</div>
                <div className="text-2xl font-black text-primary-green">₹{product.price} / {product.unit}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black text-gray-400 uppercase mb-1">Current Stock</div>
                <div className={`text-xl font-black ${product.stock <= product.minStock ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                  {product.stock} {product.unit}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Add Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-[3rem] p-8 max-w-lg w-full shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white">{editingId ? 'Edit Product' : 'New Product'}</h3>
                <p className="text-gray-500 text-sm">Update shop inventory details</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-400"><X size={24} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-2 mb-1 block">Product Name</label>
                  <div className="relative">
                    <Package className="absolute left-4 top-4 text-gray-300" size={18} />
                    <input
                      type="text"
                      placeholder="e.g. Basmati Rice"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent py-3 px-12 rounded-2xl font-bold focus:border-primary-green outline-none dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-2 mb-1 block">Price (₹)</label>
                  <div className="relative">
                    <Tag className="absolute left-4 top-4 text-gray-300" size={18} />
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent py-3 px-12 rounded-2xl font-bold focus:border-primary-green outline-none dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-2 mb-1 block">Stock Count</label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent py-3 px-6 rounded-2xl font-bold focus:border-primary-green outline-none dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-2 mb-1 block">Minimum Stock</label>
                  <input
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent py-3 px-6 rounded-2xl font-bold focus:border-primary-green outline-none dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-2 mb-1 block">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Grocery"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent py-3 px-6 rounded-2xl font-bold focus:border-primary-green outline-none dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-2 mb-1 block">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent py-3 px-6 rounded-2xl font-bold focus:border-primary-green outline-none dark:text-white"
                  >
                    <option value="kg">Kilogram (kg)</option>
                    <option value="litre">Litre (L)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button onClick={() => setShowForm(false)} className="flex-1 py-4 rounded-2xl font-black text-gray-500 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 transition-colors">Cancel</button>
                <button
                  onClick={handleSave}
                  className="flex-[2] bg-primary-green text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-green-200 dark:shadow-none"
                >
                  {editingId ? 'Update Inventory' : 'Add to Shop'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


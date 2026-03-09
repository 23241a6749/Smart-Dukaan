import React, { useState, useEffect } from 'react';
import { ShoppingBag, CreditCard, DollarSign, Calendar, Users } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { billApi } from '../../services/api';

const COLORS = ['#059669', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6B7280'];

export const AnalyticsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalSales: 0,
    avgTransaction: 0,
  });

  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [paymentData, setPaymentData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [productPieData, setProductPieData] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      const response = await billApi.getAll();
      const allBills = response.data;

      // 1. Basic Stats
      const totalRevenue = allBills.reduce((sum: number, b: any) => sum + b.totalAmount, 0);
      const totalSales = allBills.length;
      const avgTransaction = totalSales > 0 ? totalRevenue / totalSales : 0;

      setStats({ totalRevenue, totalSales, avgTransaction });

      // 2. Revenue Trend (Daily)
      const trendMap: Record<string, number> = {};
      allBills.forEach((b: any) => {
        const date = new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        trendMap[date] = (trendMap[date] || 0) + b.totalAmount;
      });

      const chartData = Object.entries(trendMap)
        .map(([date, amount]) => ({ date, amount }))
        .slice(-7);

      setRevenueData(chartData);

      // 3. Payment Methods
      const payMap: Record<string, number> = {};
      allBills.forEach((b: any) => {
        const method = b.paymentType || 'cash';
        payMap[method] = (payMap[method] || 0) + 1;
      });

      const pieData = Object.entries(payMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value
      }));
      setPaymentData(pieData);

      // 4. Top Products (Bar Chart)
      const prodMap: Record<string, number> = {};
      allBills.forEach((b: any) => {
        b.items.forEach((item: any) => {
          prodMap[item.name] = (prodMap[item.name] || 0) + item.quantity;
        });
      });

      const barData = Object.entries(prodMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setTopProducts(barData);

      // 5. Product Share (Pie Chart)
      const sortedProducts = Object.entries(prodMap)
        .map(([name, count]) => ({ name, value: count }))
        .sort((a, b) => b.value - a.value);

      const top5Pie = sortedProducts.slice(0, 5);
      const othersCount = sortedProducts.slice(5).reduce((sum, p) => sum + p.value, 0);

      if (othersCount > 0) {
        top5Pie.push({ name: 'Others', value: othersCount });
      }
      setProductPieData(top5Pie);

      // 6. Top Customers
      const custMap: Record<string, { name: string, spend: number, orders: number }> = {};
      allBills.forEach((b: any) => {
        const c = b.customerId;
        if (c && typeof c === 'object') {
          const key = c._id;
          const name = c.name || c.phoneNumber || 'Unknown';
          if (!custMap[key]) {
            custMap[key] = { name, spend: 0, orders: 0 };
          }
          custMap[key].spend += b.totalAmount;
          custMap[key].orders += 1;
        }
      });

      const topCustData = Object.values(custMap)
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 5);

      setTopCustomers(topCustData);

    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm text-sm text-gray-600">
          <Calendar size={16} />
          <span>Last 30 Days</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 text-green-700 rounded-lg">
              <DollarSign size={20} />
            </div>
            <span className="text-gray-500 text-sm font-medium">Total Revenue</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">₹{stats.totalRevenue.toLocaleString()}</div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <ShoppingBag size={20} />
            </div>
            <span className="text-gray-500 text-sm font-medium">Total Orders</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalSales}</div>
          <div className="text-xs text-gray-500 mt-1">across all channels</div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <CreditCard size={20} />
            </div>
            <span className="text-gray-500 text-sm font-medium">Avg. Order Value</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">₹{Math.round(stats.avgTransaction)}</div>
          <div className="text-xs text-gray-500 mt-1">per customer</div>
        </div>
      </div>

      {/* Revenue Trend (Full Width) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-6">Revenue Trend</h3>
        <div className="h-64 rounded-lg bg-gray-50 p-2">
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickFormatter={(val: number) => `₹${val}`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  formatter={(value: any) => [`₹${value}`, 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#059669"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">No revenue data available</div>
          )}
        </div>
      </div>

      {/* Pie Charts Grid: Payment & Product Share */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="font-semibold text-gray-800 mb-6">Payment Distribution</h3>
          <div className="h-64 rounded-lg bg-gray-50 p-2 w-full">
            {paymentData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {paymentData.map((_, index) => (
                      <Cell key={`cell-pay-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">No payment data</div>
            )}
          </div>
        </div>

        {/* Product Share */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="font-semibold text-gray-800 mb-6">Product Sales Share</h3>
          <div className="h-64 rounded-lg bg-gray-50 p-2 w-full">
            {productPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={productPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {productPieData.map((_, index) => (
                      <Cell key={`cell-prod-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">No product data</div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Top Products & Customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-6">Top Selling Products</h3>
          <div className="h-64 rounded-lg bg-gray-50 p-2">
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topProducts}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E7EB" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    width={100}
                    tick={{ fontSize: 13, fill: '#374151', fontWeight: 500 }}
                  />
                  <Tooltip
                    cursor={{ fill: '#F3F4F6' }}
                    contentStyle={{ borderRadius: '8px' }}
                  />
                  <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">No product data</div>
            )}
          </div>
        </div>

        {/* Top Customers */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-6">Top Customers</h3>
          <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
            {topCustomers.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No customer data yet</div>
            ) : (
              topCustomers.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                      <Users size={16} />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.orders} orders</div>
                    </div>
                  </div>
                  <div className="font-bold text-gray-900 text-sm">₹{c.spend.toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

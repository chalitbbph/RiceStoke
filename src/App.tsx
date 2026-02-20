import React, { useState, useEffect } from 'react';
import { supabase, ORG_ID } from './lib/supabase';
import { Product, Transaction, DashboardKPIs } from './types';
import { 
  LayoutDashboard, 
  PackagePlus, 
  History, 
  BarChart3, 
  LogOut, 
  Search, 
  Plus, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Scale,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// --- Components ---

const KPIBox = ({ label, value, icon: Icon, colorClass, delta }: { label: string, value: string | number, icon: any, colorClass: string, delta?: { value: number, isPositive: boolean } }) => (
  <div className={cn("bg-white p-6 rounded-xl shadow-sm border-l-4", colorClass)}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-rice-600 font-mono">{value}</p>
        {delta && (
          <div className={cn("text-xs mt-1 font-bold flex items-center gap-1", delta.isPositive ? "text-emerald-600" : "text-red-600")}>
            {delta.isPositive ? "↑" : "↓"} {Math.abs(delta.value).toFixed(1)}% จากสัปดาห์ก่อน
          </div>
        )}
      </div>
      <Icon className="w-5 h-5 text-gray-400" />
    </div>
  </div>
);

const Badge = ({ type, children }: { type: string, children: React.ReactNode }) => {
  const styles: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-800",
    low: "bg-amber-100 text-amber-800",
    out: "bg-red-100 text-red-800",
    in: "bg-emerald-100 text-emerald-800",
    adjust: "bg-indigo-100 text-indigo-800",
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider", styles[type] || "bg-gray-100 text-gray-800")}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [salesDelta, setSalesDelta] = useState<{ value: number, isPositive: boolean } | null>(null);
  const [salesData, setSalesData] = useState<{ labels: string[], values: number[] }>({ labels: [], values: [] });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [authError, setAuthError] = useState('');

  // Auth state from localStorage
  useEffect(() => {
    const loggedIn = localStorage.getItem('rice_stock_logged_in') === 'true';
    setIsLoggedIn(loggedIn);
    if (loggedIn) loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchKPIs(), fetchProducts(), fetchTransactions(), fetchSalesData(), calculateSalesDelta()]);
    setLoading(false);
  };

  const calculateSalesDelta = async () => {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(now.getDate() - 14);

    const { data: currentSales } = await supabase
      .from('inventory_txn')
      .select('qty_kg')
      .eq('org_id', ORG_ID)
      .eq('type', 'OUT')
      .gte('created_at', sevenDaysAgo.toISOString());

    const { data: previousSales } = await supabase
      .from('inventory_txn')
      .select('qty_kg')
      .eq('org_id', ORG_ID)
      .eq('type', 'OUT')
      .gte('created_at', fourteenDaysAgo.toISOString())
      .lt('created_at', sevenDaysAgo.toISOString());

    const currentTotal = currentSales?.reduce((acc, curr) => acc + curr.qty_kg, 0) || 0;
    const previousTotal = previousSales?.reduce((acc, curr) => acc + curr.qty_kg, 0) || 0;

    if (previousTotal > 0) {
      const delta = ((currentTotal - previousTotal) / previousTotal) * 100;
      setSalesDelta({ value: delta, isPositive: delta >= 0 });
    } else {
      setSalesDelta(null);
    }
  };

  const fetchSalesData = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
      .from('inventory_txn')
      .select('created_at, qty_kg')
      .eq('org_id', ORG_ID)
      .eq('type', 'OUT')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at');

    if (!error && data) {
      const salesByDate: Record<string, number> = {};
      
      // Initialize last 30 days with 0
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        salesByDate[d.toLocaleDateString()] = 0;
      }

      data.forEach(t => {
        const date = new Date(t.created_at).toLocaleDateString();
        if (salesByDate[date] !== undefined) {
          salesByDate[date] += t.qty_kg;
        }
      });

      setSalesData({
        labels: Object.keys(salesByDate),
        values: Object.values(salesByDate)
      });
    }
  };

  const fetchKPIs = async () => {
    const { data, error } = await supabase.rpc('get_dashboard_kpis', { p_org_id: ORG_ID });
    if (!error && data) setKpis(data);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('inventory_on_hand')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('sku');
    if (!error && data) setProducts(data);
  };

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from('inventory_txn')
      .select('*, products(sku, name)')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setTransactions(data);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const user = formData.get('username');
    const pass = formData.get('password');

    if (user === 'admin123' && pass === '123') {
      localStorage.setItem('rice_stock_logged_in', 'true');
      setIsLoggedIn(true);
      loadData();
    } else {
      setAuthError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ลองใช้: admin123 / 123)');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('rice_stock_logged_in');
    setIsLoggedIn(false);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const newProduct = {
      org_id: ORG_ID,
      sku: `RICE-${Date.now()}`, // Auto-generate SKU since we removed it from UI
      name: formData.get('name') as string,
      name_th: formData.get('name_th') as string || null,
      category: formData.get('category') as string,
      pack_size_kg: parseFloat(formData.get('pack_size') as string),
      reorder_point_kg: parseFloat(formData.get('reorder') as string) || 0,
    };

    const { error } = await supabase.from('products').insert(newProduct);
    if (error) {
      alert(error.message);
    } else {
      (e.target as HTMLFormElement).reset();
      setActiveTab('overview');
      loadData();
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const txnData = {
      p_org_id: ORG_ID,
      p_product_id: formData.get('product_id') as string,
      p_type: formData.get('type') as string,
      p_qty_kg: parseFloat(formData.get('qty') as string),
      p_ref: formData.get('ref') as string || null,
      p_note: formData.get('note') as string || null
    };

    const { data, error } = await supabase.rpc('create_transaction', txnData);
    if (error) {
      alert(error.message);
    } else if (data && !data.success) {
      alert(data.error);
    } else {
      setIsModalOpen(false);
      loadData();
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.name_th && p.name_th.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl border-2 border-rice-200 p-8 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-rice-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
              🌾
            </div>
            <h1 className="text-2xl font-bold text-rice-600">ระบบจัดการสต็อกข้าว</h1>
            <p className="text-gray-500 text-sm">ระบบจัดการสินค้าคงคลังมืออาชีพ</p>
          </div>

          <div className="bg-earth-100 border-2 border-earth-600 rounded-xl p-4 mb-6">
            <h4 className="text-earth-600 font-bold text-center mb-2 text-sm">🔑 ข้อมูลเข้าสู่ระบบ (เดโม)</h4>
            <div className="flex justify-between text-xs font-mono bg-white p-2 rounded mb-1">
              <span className="text-earth-600 font-bold">ชื่อผู้ใช้:</span>
              <span>admin123</span>
            </div>
            <div className="flex justify-between text-xs font-mono bg-white p-2 rounded">
              <span className="text-earth-600 font-bold">รหัสผ่าน:</span>
              <span>123</span>
            </div>
          </div>

          {authError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อผู้ใช้</label>
              <input 
                name="username"
                type="text" 
                defaultValue="admin123"
                className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">รหัสผ่าน</label>
              <input 
                name="password"
                type="password" 
                defaultValue="123"
                className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-rice-400 hover:bg-rice-600 text-white font-bold py-3 rounded-xl transition-all transform active:scale-95"
            >
              🚀 เข้าสู่ระบบ
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-rice-600 flex items-center gap-2">
            🌾 ระบบจัดการสต็อกข้าว
          </h1>
          <p className="text-gray-500 text-sm">เข้าสู่ระบบโดย: <span className="font-bold">admin123</span></p>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all"
        >
          <LogOut className="w-4 h-4" /> ออกจากระบบ
        </button>
      </header>

      {/* Navigation */}
      <nav className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: 'overview', label: 'แผงควบคุม', icon: LayoutDashboard },
          { id: 'products', label: 'เพิ่มสินค้า', icon: PackagePlus },
          { id: 'transactions', label: 'ประวัติรายการ', icon: History },
          { id: 'sales', label: 'วิเคราะห์การขาย', icon: BarChart3 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap border-2",
              activeTab === tab.id 
                ? "bg-rice-400 border-rice-400 text-white shadow-md" 
                : "bg-white border-rice-200 text-gray-600 hover:bg-rice-50"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPIBox label="สต็อกทั้งหมด" value={`${kpis?.total_stock_kg?.toFixed(2) || 0} กก.`} icon={ArrowDownCircle} colorClass="border-rice-400" />
              <KPIBox label="สินค้าทั้งหมด" value={kpis?.sku_count || 0} icon={LayoutDashboard} colorClass="border-emerald-400" />
              <KPIBox label="สินค้าใกล้หมด" value={kpis?.low_stock_count || 0} icon={AlertCircle} colorClass="border-red-400" />
              <KPIBox 
                label="ยอดขาย 7 วันล่าสุด" 
                value={`${kpis?.sales_7d_kg?.toFixed(2) || 0} กก.`} 
                icon={BarChart3} 
                colorClass="border-indigo-400" 
                delta={salesDelta || undefined}
              />
            </div>

            {/* Inventory Table */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-rice-600">ภาพรวมสินค้าคงคลัง</h2>
                <button 
                  onClick={() => {
                    setSelectedProduct('');
                    setIsModalOpen(true);
                  }}
                  className="bg-rice-400 hover:bg-rice-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" /> ทำรายการใหม่
                </button>
              </div>

              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="ค้นหาชื่อสินค้า..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-rice-50 border-b-2 border-rice-100">
                      <th className="p-4 font-bold text-sm text-gray-600">ชื่อสินค้า</th>
                      <th className="p-4 font-bold text-sm text-gray-600">ขนาดบรรจุ (กก.)</th>
                      <th className="p-4 font-bold text-sm text-gray-600">คงเหลือ (กก.)</th>
                      <th className="p-4 font-bold text-sm text-gray-600">สถานะ</th>
                      <th className="p-4 font-bold text-sm text-gray-600">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-gray-400">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                          กำลังโหลดข้อมูล...
                        </td>
                      </tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-gray-400">
                          ไม่พบข้อมูลสินค้า
                        </td>
                      </tr>
                    ) : filteredProducts.map((p) => {
                      const isLow = p.reorder_point_kg > 0 && p.on_hand_kg < p.reorder_point_kg;
                      const isOut = p.on_hand_kg <= 0;
                      return (
                        <tr key={p.product_id} className="border-b border-rice-50 hover:bg-rice-50/50 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold">{p.name}</div>
                            {p.name_th && <div className="text-xs text-gray-400">{p.name_th}</div>}
                          </td>
                          <td className="p-4 font-mono">{p.pack_size_kg.toFixed(2)}</td>
                          <td className="p-4 font-mono font-bold">{p.on_hand_kg.toFixed(2)}</td>
                          <td className="p-4">
                            {isOut ? <Badge type="out">หมด</Badge> : isLow ? <Badge type="low">เหลือน้อย</Badge> : <Badge type="ok">ปกติ</Badge>}
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  setSelectedProduct(p.product_id);
                                  setIsModalOpen(true);
                                  // Set type to IN automatically
                                  setTimeout(() => {
                                    const select = document.querySelector('select[name="type"]') as HTMLSelectElement;
                                    if (select) select.value = 'IN';
                                  }, 0);
                                }}
                                className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-1 text-xs font-bold"
                              >
                                <ArrowDownCircle className="w-3 h-3" /> รับเข้า
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedProduct(p.product_id);
                                  setIsModalOpen(true);
                                  // Set type to OUT automatically
                                  setTimeout(() => {
                                    const select = document.querySelector('select[name="type"]') as HTMLSelectElement;
                                    if (select) select.value = 'OUT';
                                  }, 0);
                                }}
                                className="px-3 py-1.5 bg-rice-50 text-rice-600 rounded-lg hover:bg-rice-100 transition-all flex items-center gap-1 text-xs font-bold"
                              >
                                <ArrowUpCircle className="w-3 h-3" /> ขาย
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'products' && (
          <motion.div 
            key="products"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white rounded-2xl p-8 shadow-sm max-w-2xl mx-auto"
          >
            <h2 className="text-2xl font-bold text-rice-600 mb-6 flex items-center gap-2">
              <PackagePlus className="w-6 h-6" /> เพิ่มสินค้าใหม่
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อสินค้า (อังกฤษ) *</label>
                <input name="name" required placeholder="Jasmine Rice Premium" className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อสินค้า (ไทย)</label>
                <input name="name_th" placeholder="ข้าวหอมมะลิ" className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">หมวดหมู่ *</label>
                  <select name="category" required className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all">
                    <option value="">เลือก...</option>
                    <option value="Jasmine">ข้าวหอมมะลิ (Jasmine)</option>
                    <option value="White">ข้าวขาว (White)</option>
                    <option value="Brown">ข้าวกล้อง (Brown)</option>
                    <option value="Sticky">ข้าวเหนียว (Sticky)</option>
                    <option value="Specialty">ข้าวพิเศษ (Specialty)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ขนาดบรรจุ (กก.) *</label>
                  <input name="pack_size" type="number" step="0.1" required placeholder="25" className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">จุดสั่งซื้อใหม่ (กก.)</label>
                <input name="reorder" type="number" defaultValue="100" className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all" />
              </div>

              <button type="submit" className="w-full bg-rice-400 hover:bg-rice-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg">
                ✅ บันทึกสินค้า
              </button>
            </form>
          </motion.div>
        )}

        {activeTab === 'transactions' && (
          <motion.div 
            key="transactions"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-xl font-bold text-rice-600 mb-6 flex items-center gap-2">
              <History className="w-6 h-6" /> ประวัติรายการ
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-rice-50 border-b-2 border-rice-100">
                    <th className="p-4 font-bold text-sm text-gray-600">วัน-เวลา</th>
                    <th className="p-4 font-bold text-sm text-gray-600">ประเภท</th>
                    <th className="p-4 font-bold text-sm text-gray-600">สินค้า</th>
                    <th className="p-4 font-bold text-sm text-gray-600">จำนวน (กก.)</th>
                    <th className="p-4 font-bold text-sm text-gray-600">อ้างอิง</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-rice-50 hover:bg-rice-50/50 transition-colors">
                      <td className="p-4 text-sm text-gray-500">
                        {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString()}
                      </td>
                      <td className="p-4">
                        <Badge type={t.type.toLowerCase()}>
                          {t.type === 'IN' ? '📥 รับเข้า' : t.type === 'OUT' ? '📤 ขาย' : '⚖️ ปรับปรุง'}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold">{t.products?.name}</div>
                      </td>
                      <td className="p-4 font-mono font-bold">{t.qty_kg.toFixed(2)}</td>
                      <td className="p-4 text-sm text-gray-500">{t.ref || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'sales' && (
          <motion.div 
            key="sales"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold text-rice-600 mb-6 flex items-center gap-2">
                <BarChart3 className="w-6 h-6" /> วิเคราะห์การขาย (30 วันล่าสุด)
              </h2>
              <div className="h-[400px]">
                <Line 
                  data={{
                    labels: salesData.labels,
                    datasets: [{
                      label: 'ยอดขาย (กก.)',
                      data: salesData.values,
                      borderColor: '#D4A574',
                      backgroundColor: 'rgba(212, 165, 116, 0.1)',
                      fill: true,
                      tension: 0.4
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => `${context.parsed.y.toFixed(2)} กก.`
                        }
                      }
                    },
                    scales: { 
                      y: { 
                        beginAtZero: true,
                        ticks: {
                          callback: (value) => `${value} กก.`
                        }
                      } 
                    }
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg overflow-y-auto max-h-[90vh]"
            >
              <h3 className="text-2xl font-bold text-rice-600 mb-6">ทำรายการใหม่</h3>
              <form onSubmit={handleTransaction} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ประเภทรายการ *</label>
                  <select name="type" required className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all">
                    <option value="IN">📥 รับสินค้าเข้า (Receive)</option>
                    <option value="OUT">📤 ขายสินค้า (Sale)</option>
                    <option value="ADJUST">⚖️ ปรับปรุงสต็อก (Adjustment)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">สินค้า *</label>
                  <select 
                    name="product_id" 
                    required 
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  >
                    <option value="">เลือกสินค้า...</option>
                    {products.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name} ({p.on_hand_kg.toFixed(2)} กก. คงเหลือ)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวน (กก.) *</label>
                  <input name="qty" type="number" step="0.01" required min="0.01" className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">อ้างอิง (เช่น เลขที่ใบเสร็จ)</label>
                  <input name="ref" placeholder="INV-001" className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ</label>
                  <textarea name="note" rows={3} className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all" />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 border-2 border-rice-200 text-gray-600 rounded-xl font-bold hover:bg-rice-50 transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-rice-400 hover:bg-rice-600 text-white rounded-xl font-bold shadow-lg transition-all"
                  >
                    บันทึกรายการ
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

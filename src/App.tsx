import React, { useState, useEffect } from 'react';
import { supabase, ORG_ID } from './lib/supabase';
import { Product, Transaction, DashboardKPIs, DailyReportRow, MonthlyFinancialData, FinancialNote } from './types';
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
  AlertCircle,
  Loader2,
  Wallet,
  Calendar,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Banknote,
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
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNote(note?: string | null): FinancialNote & { text: string } {
  if (!note) return { text: '' };
  try {
    if (note.trim().startsWith('{')) {
      const p = JSON.parse(note) as FinancialNote;
      return {
        text: p.note || '',
        amount_thb: p.amount_thb,
        payment_method: p.payment_method,
        unit_price_thb: p.unit_price_thb,
      };
    }
  } catch {}
  return { text: note };
}

function buildNote(financial: {
  amount_thb?: number | null;
  payment_method?: string | null;
  unit_price_thb?: number | null;
  note?: string;
}): string | null {
  const { amount_thb, payment_method, unit_price_thb, note } = financial;
  const hasFinancial = amount_thb || payment_method || unit_price_thb;
  if (!hasFinancial && !note) return null;
  if (!hasFinancial) return note || null;
  return JSON.stringify({ amount_thb, payment_method, unit_price_thb, note: note || '' });
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const KPIBox = ({
  label,
  value,
  icon: Icon,
  colorClass,
  delta,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
  delta?: { value: number; isPositive: boolean };
}) => (
  <div className={cn('bg-white p-6 rounded-xl shadow-sm border-l-4', colorClass)}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-rice-600 font-mono">{value}</p>
        {delta && (
          <div
            className={cn(
              'text-xs mt-1 font-bold flex items-center gap-1',
              delta.isPositive ? 'text-emerald-600' : 'text-red-600'
            )}
          >
            {delta.isPositive ? '↑' : '↓'} {Math.abs(delta.value).toFixed(1)}% จากสัปดาห์ก่อน
          </div>
        )}
      </div>
      <Icon className="w-5 h-5 text-gray-400" />
    </div>
  </div>
);

const Badge = ({ type, children }: { type: string; children: React.ReactNode }) => {
  const styles: Record<string, string> = {
    ok: 'bg-emerald-100 text-emerald-800',
    low: 'bg-amber-100 text-amber-800',
    out: 'bg-red-100 text-red-800',
    in: 'bg-emerald-100 text-emerald-800',
    out_txn: 'bg-rice-100 text-rice-800',
    adjust: 'bg-indigo-100 text-indigo-800',
    cash: 'bg-green-100 text-green-700',
    transfer: 'bg-blue-100 text-blue-700',
  };
  return (
    <span
      className={cn(
        'px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider',
        styles[type] || 'bg-gray-100 text-gray-800'
      )}
    >
      {children}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [salesDelta, setSalesDelta] = useState<{ value: number; isPositive: boolean } | null>(null);
  const [salesData, setSalesData] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  const [salesRevenueData, setSalesRevenueData] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  // UI state
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [authError, setAuthError] = useState('');
  const [txnType, setTxnType] = useState<'IN' | 'OUT' | 'ADJUST'>('IN');
  const [qtyKg, setQtyKg] = useState('');
  const [unitPriceInput, setUnitPriceInput] = useState('');

  // Daily report
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyReport, setDailyReport] = useState<DailyReportRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  // Monthly report
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthlyData, setMonthlyData] = useState<MonthlyFinancialData | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loggedIn = localStorage.getItem('rice_stock_logged_in') === 'true';
    setIsLoggedIn(loggedIn);
    if (loggedIn) loadData();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    if (formData.get('username') === 'admin123' && formData.get('password') === '123') {
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

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchKPIs(), fetchProducts(), fetchTransactions(), fetchSalesData(), calculateSalesDelta()]);
    setLoading(false);
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
      .limit(100);
    if (!error && data) setTransactions(data);
  };

  const fetchSalesData = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
      .from('inventory_txn')
      .select('created_at, qty_kg, note')
      .eq('org_id', ORG_ID)
      .eq('type', 'OUT')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at');

    if (!error && data) {
      const salesByDate: Record<string, number> = {};
      const revenueByDate: Record<string, number> = {};

      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString();
        salesByDate[key] = 0;
        revenueByDate[key] = 0;
      }

      data.forEach((t) => {
        const key = new Date(t.created_at).toLocaleDateString();
        if (salesByDate[key] !== undefined) {
          salesByDate[key] += t.qty_kg;
          const { amount_thb } = parseNote(t.note);
          revenueByDate[key] += amount_thb || 0;
        }
      });

      setSalesData({ labels: Object.keys(salesByDate), values: Object.values(salesByDate) });
      setSalesRevenueData({ labels: Object.keys(revenueByDate), values: Object.values(revenueByDate) });
    }
  };

  const calculateSalesDelta = async () => {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(now.getDate() - 14);

    const { data: current } = await supabase
      .from('inventory_txn')
      .select('qty_kg')
      .eq('org_id', ORG_ID)
      .eq('type', 'OUT')
      .gte('created_at', sevenDaysAgo.toISOString());

    const { data: previous } = await supabase
      .from('inventory_txn')
      .select('qty_kg')
      .eq('org_id', ORG_ID)
      .eq('type', 'OUT')
      .gte('created_at', fourteenDaysAgo.toISOString())
      .lt('created_at', sevenDaysAgo.toISOString());

    const curr = current?.reduce((a, b) => a + b.qty_kg, 0) || 0;
    const prev = previous?.reduce((a, b) => a + b.qty_kg, 0) || 0;
    if (prev > 0) {
      const delta = ((curr - prev) / prev) * 100;
      setSalesDelta({ value: delta, isPositive: delta >= 0 });
    }
  };

  // ---------------------------------------------------------------------------
  // Daily report
  // ---------------------------------------------------------------------------

  const fetchDailyReport = async (date: string) => {
    if (products.length === 0) return;
    setDailyLoading(true);

    const nextDateStr = (() => {
      const d = new Date(date);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    // Transactions on selected day
    const { data: dayTxns } = await supabase
      .from('inventory_txn')
      .select('product_id, qty_kg, type')
      .eq('org_id', ORG_ID)
      .gte('created_at', date + 'T00:00:00')
      .lt('created_at', nextDateStr + 'T00:00:00');

    // Transactions AFTER selected day — to back-calculate historical balances
    const { data: afterTxns } = await supabase
      .from('inventory_txn')
      .select('product_id, qty_kg, type')
      .eq('org_id', ORG_ID)
      .gte('created_at', nextDateStr + 'T00:00:00');

    // Adjustments to reverse future transactions
    const futureAdj: Record<string, number> = {};
    afterTxns?.forEach((t) => {
      if (!futureAdj[t.product_id]) futureAdj[t.product_id] = 0;
      if (t.type === 'IN') futureAdj[t.product_id] -= t.qty_kg;
      else if (t.type === 'OUT') futureAdj[t.product_id] += t.qty_kg;
    });

    // Today's activity per product
    const activity: Record<string, { received: number; sold: number }> = {};
    dayTxns?.forEach((t) => {
      if (!activity[t.product_id]) activity[t.product_id] = { received: 0, sold: 0 };
      if (t.type === 'IN') activity[t.product_id].received += t.qty_kg;
      else if (t.type === 'OUT') activity[t.product_id].sold += t.qty_kg;
    });

    const rows: DailyReportRow[] = products
      .map((p) => {
        const adj = futureAdj[p.product_id] || 0;
        const act = activity[p.product_id] || { received: 0, sold: 0 };
        const closingKg = p.on_hand_kg + adj;
        const openingKg = closingKg - act.received + act.sold;
        return {
          product_id: p.product_id,
          name: p.name,
          name_th: p.name_th,
          pack_size_kg: p.pack_size_kg,
          opening_kg: Math.max(0, openingKg),
          received_kg: act.received,
          sold_kg: act.sold,
          closing_kg: Math.max(0, closingKg),
        };
      })
      .filter((r) => r.opening_kg > 0 || r.received_kg > 0 || r.sold_kg > 0 || r.closing_kg > 0);

    setDailyReport(rows);
    setDailyLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'daily' && isLoggedIn && products.length > 0) {
      fetchDailyReport(reportDate);
    }
  }, [activeTab, reportDate, products]);

  // ---------------------------------------------------------------------------
  // Monthly report
  // ---------------------------------------------------------------------------

  const fetchMonthlyReport = async (month: string) => {
    setMonthlyLoading(true);
    const [year, m] = month.split('-').map(Number);
    const lastDay = new Date(year, m, 0).getDate();

    const { data: txns } = await supabase
      .from('inventory_txn')
      .select('type, qty_kg, note, created_at')
      .eq('org_id', ORG_ID)
      .gte('created_at', `${month}-01T00:00:00`)
      .lte('created_at', `${month}-${String(lastDay).padStart(2, '0')}T23:59:59`);

    if (!txns) {
      setMonthlyLoading(false);
      return;
    }

    const purchaseByDate: Record<string, number> = {};
    const salesByDate: Record<string, number> = {};
    let totalPurchase = 0;
    let totalSales = 0;

    txns.forEach((t) => {
      const dateKey = t.created_at.split('T')[0];
      const { amount_thb, unit_price_thb } = parseNote(t.note);

      if (t.type === 'IN') {
        const cost = amount_thb || (unit_price_thb ? unit_price_thb * t.qty_kg : 0);
        purchaseByDate[dateKey] = (purchaseByDate[dateKey] || 0) + cost;
        totalPurchase += cost;
      } else if (t.type === 'OUT') {
        const revenue = amount_thb || 0;
        salesByDate[dateKey] = (salesByDate[dateKey] || 0) + revenue;
        totalSales += revenue;
      }
    });

    const purchaseRows = Object.entries(purchaseByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    const salesRows = Object.entries(salesByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    setMonthlyData({
      totalPurchaseThb: totalPurchase,
      totalSalesThb: totalSales,
      profitThb: totalSales - totalPurchase,
      purchaseRows,
      salesRows,
    });
    setMonthlyLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'monthly' && isLoggedIn) {
      fetchMonthlyReport(reportMonth);
    }
  }, [activeTab, reportMonth]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const newProduct = {
      org_id: ORG_ID,
      sku: `RICE-${Date.now()}`,
      name: formData.get('name') as string,
      name_th: (formData.get('name_th') as string) || null,
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

    const type = formData.get('type') as string;
    const amountThb = parseFloat(formData.get('amount_thb') as string) || null;
    const paymentMethod = (formData.get('payment_method') as string) || null;
    const unitPriceThb = parseFloat(formData.get('unit_price') as string) || null;
    const noteText = (formData.get('note') as string) || '';

    const composedNote = buildNote({
      amount_thb: type === 'OUT' ? amountThb : null,
      payment_method: type === 'OUT' ? paymentMethod : null,
      unit_price_thb: type === 'IN' ? unitPriceThb : null,
      note: noteText,
    });

    const txnData = {
      p_org_id: ORG_ID,
      p_product_id: formData.get('product_id') as string,
      p_type: type,
      p_qty_kg: parseFloat(formData.get('qty') as string),
      p_ref: (formData.get('ref') as string) || null,
      p_note: composedNote,
    };

    const { data, error } = await supabase.rpc('create_transaction', txnData);
    if (error) {
      alert(error.message);
    } else if (data && !data.success) {
      alert(data.error);
    } else {
      setIsModalOpen(false);
      setQtyKg('');
      setUnitPriceInput('');
      loadData();
    }
  };

  const openModal = (productId = '', type: 'IN' | 'OUT' | 'ADJUST' = 'IN') => {
    setSelectedProduct(productId);
    setTxnType(type);
    setQtyKg('');
    setUnitPriceInput('');
    setIsModalOpen(true);
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.name_th && p.name_th.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const computedTotalCost =
    qtyKg && unitPriceInput ? (parseFloat(qtyKg) * parseFloat(unitPriceInput)).toFixed(2) : null;

  // ---------------------------------------------------------------------------
  // Login screen
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Main layout
  // ---------------------------------------------------------------------------

  const tabs = [
    { id: 'overview', label: 'แผงควบคุม', icon: LayoutDashboard },
    { id: 'products', label: 'เพิ่มสินค้า', icon: PackagePlus },
    { id: 'transactions', label: 'ประวัติรายการ', icon: History },
    { id: 'sales', label: 'วิเคราะห์การขาย', icon: BarChart3 },
    { id: 'daily', label: 'สต็อกรายวัน', icon: Calendar },
    { id: 'monthly', label: 'รายงานรายเดือน', icon: ClipboardList },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-rice-600 flex items-center gap-2">🌾 ระบบจัดการสต็อกข้าว</h1>
          <p className="text-gray-500 text-sm">
            เข้าสู่ระบบโดย: <span className="font-bold">admin123</span>
          </p>
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
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 rounded-xl font-bold transition-all whitespace-nowrap border-2',
              activeTab === tab.id
                ? 'bg-rice-400 border-rice-400 text-white shadow-md'
                : 'bg-white border-rice-200 text-gray-600 hover:bg-rice-50'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        {/* ================================================================ */}
        {/* OVERVIEW TAB                                                     */}
        {/* ================================================================ */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPIBox
                label="สต็อกทั้งหมด"
                value={`${fmt(kpis?.total_stock_kg || 0)} กก.`}
                icon={ArrowDownCircle}
                colorClass="border-rice-400"
              />
              <KPIBox
                label="สินค้าทั้งหมด"
                value={kpis?.sku_count || 0}
                icon={LayoutDashboard}
                colorClass="border-emerald-400"
              />
              <KPIBox
                label="สินค้าใกล้หมด"
                value={kpis?.low_stock_count || 0}
                icon={AlertCircle}
                colorClass="border-red-400"
              />
              <KPIBox
                label="ยอดขาย 7 วัน (กก.)"
                value={`${fmt(kpis?.sales_7d_kg || 0)} กก.`}
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
                  onClick={() => openModal('', 'IN')}
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
                      <th className="p-4 font-bold text-sm text-gray-600">บรรจุ (กก.)</th>
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
                    ) : (
                      filteredProducts.map((p) => {
                        const isLow = p.reorder_point_kg > 0 && p.on_hand_kg < p.reorder_point_kg;
                        const isOut = p.on_hand_kg <= 0;
                        return (
                          <tr
                            key={p.product_id}
                            className="border-b border-rice-50 hover:bg-rice-50/50 transition-colors"
                          >
                            <td className="p-4">
                              <div className="font-semibold">{p.name}</div>
                              {p.name_th && <div className="text-xs text-gray-400">{p.name_th}</div>}
                            </td>
                            <td className="p-4 font-mono">{p.pack_size_kg.toFixed(2)}</td>
                            <td className="p-4 font-mono font-bold">{p.on_hand_kg.toFixed(2)}</td>
                            <td className="p-4">
                              {isOut ? (
                                <Badge type="out">หมด</Badge>
                              ) : isLow ? (
                                <Badge type="low">เหลือน้อย</Badge>
                              ) : (
                                <Badge type="ok">ปกติ</Badge>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openModal(p.product_id, 'IN')}
                                  className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-1 text-xs font-bold"
                                >
                                  <ArrowDownCircle className="w-3 h-3" /> รับเข้า
                                </button>
                                <button
                                  onClick={() => openModal(p.product_id, 'OUT')}
                                  className="px-3 py-1.5 bg-rice-50 text-rice-600 rounded-lg hover:bg-rice-100 transition-all flex items-center gap-1 text-xs font-bold"
                                >
                                  <ArrowUpCircle className="w-3 h-3" /> ขาย
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* ADD PRODUCT TAB                                                  */}
        {/* ================================================================ */}
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
                <input
                  name="name"
                  required
                  placeholder="Jasmine Rice Premium"
                  className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อสินค้า (ไทย)</label>
                <input
                  name="name_th"
                  placeholder="ข้าวหอมมะลิ"
                  className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">หมวดหมู่ *</label>
                  <select
                    name="category"
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  >
                    <option value="">เลือก...</option>
                    <option value="Jasmine">ข้าวหอมมะลิ (Jasmine)</option>
                    <option value="White">ข้าวขาว (White)</option>
                    <option value="Brown">ข้าวกล้อง (Brown)</option>
                    <option value="Sticky">ข้าวเหนียว (Sticky)</option>
                    <option value="Specialty">ข้าวพิเศษ (Specialty)</option>
                    <option value="Bran">รำข้าว (Bran)</option>
                    <option value="Broken">ปลายข้าว (Broken)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ขนาดบรรจุ (กก.) *</label>
                  <input
                    name="pack_size"
                    type="number"
                    step="0.1"
                    required
                    placeholder="25"
                    className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">จุดสั่งซื้อใหม่ (กก.)</label>
                <input
                  name="reorder"
                  type="number"
                  defaultValue="100"
                  className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-rice-400 hover:bg-rice-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg"
              >
                ✅ บันทึกสินค้า
              </button>
            </form>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* TRANSACTIONS TAB                                                 */}
        {/* ================================================================ */}
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
                    <th className="p-4 font-bold text-sm text-gray-600">เงิน (฿)</th>
                    <th className="p-4 font-bold text-sm text-gray-600">ชำระ</th>
                    <th className="p-4 font-bold text-sm text-gray-600">เลขที่บิล</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const { amount_thb, payment_method, unit_price_thb } = parseNote(t.note);
                    const displayAmount =
                      t.type === 'OUT'
                        ? amount_thb
                        : t.type === 'IN' && unit_price_thb
                        ? unit_price_thb * t.qty_kg
                        : null;
                    return (
                      <tr key={t.id} className="border-b border-rice-50 hover:bg-rice-50/50 transition-colors">
                        <td className="p-4 text-sm text-gray-500">
                          {new Date(t.created_at).toLocaleDateString('th-TH')}{' '}
                          {new Date(t.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4">
                          <Badge type={t.type === 'OUT' ? 'out_txn' : t.type.toLowerCase()}>
                            {t.type === 'IN' ? '📥 รับเข้า' : t.type === 'OUT' ? '📤 ขาย' : '⚖️ ปรับปรุง'}
                          </Badge>
                        </td>
                        <td className="p-4 font-semibold">{t.products?.name}</td>
                        <td className="p-4 font-mono font-bold">{t.qty_kg.toFixed(2)}</td>
                        <td className="p-4 font-mono font-bold text-emerald-700">
                          {displayAmount ? `฿${fmt(displayAmount)}` : '-'}
                        </td>
                        <td className="p-4">
                          {payment_method ? (
                            <Badge type={payment_method}>
                              {payment_method === 'cash' ? '💵 เงินสด' : '📲 โอน'}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-4 text-sm text-gray-500">{t.ref || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* SALES ANALYSIS TAB                                               */}
        {/* ================================================================ */}
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
                <BarChart3 className="w-6 h-6" /> ยอดขาย (กก.) — 30 วันล่าสุด
              </h2>
              <div className="h-80">
                <Line
                  data={{
                    labels: salesData.labels,
                    datasets: [
                      {
                        label: 'ยอดขาย (กก.)',
                        data: salesData.values,
                        borderColor: '#D4A574',
                        backgroundColor: 'rgba(212, 165, 116, 0.1)',
                        fill: true,
                        tension: 0.4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(2)} กก.` } },
                    },
                    scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v} กก.` } } },
                  }}
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold text-rice-600 mb-6 flex items-center gap-2">
                <Wallet className="w-6 h-6" /> รายได้ (฿) — 30 วันล่าสุด
              </h2>
              <div className="h-80">
                <Line
                  data={{
                    labels: salesRevenueData.labels,
                    datasets: [
                      {
                        label: 'รายได้ (฿)',
                        data: salesRevenueData.values,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx) => `฿${fmt(ctx.parsed.y)}` } },
                    },
                    scales: { y: { beginAtZero: true, ticks: { callback: (v) => `฿${v}` } } },
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* DAILY INVENTORY REPORT TAB                                       */}
        {/* ================================================================ */}
        {activeTab === 'daily' && (
          <motion.div
            key="daily"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-rice-600 flex items-center gap-2">
                  <Calendar className="w-6 h-6" /> สต็อกสินค้าคงคลังรายวัน
                </h2>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="px-4 py-2 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all font-mono"
                />
              </div>

              {dailyLoading ? (
                <div className="p-12 text-center text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  กำลังโหลดข้อมูล...
                </div>
              ) : dailyReport.length === 0 ? (
                <div className="p-12 text-center text-gray-400">ไม่มีรายการสินค้าในวันที่เลือก</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-rice-50 border-b-2 border-rice-100">
                        <th className="p-4 font-bold text-sm text-gray-600">สินค้า</th>
                        <th className="p-4 font-bold text-sm text-gray-600">บรรจุ (กก.)</th>
                        <th className="p-4 font-bold text-sm text-gray-600 text-center">ยกมา (กก.)</th>
                        <th className="p-4 font-bold text-sm text-emerald-700 text-center">รับเข้า (กก.)</th>
                        <th className="p-4 font-bold text-sm text-rice-600 text-center">ขายออก (กก.)</th>
                        <th className="p-4 font-bold text-sm text-indigo-700 text-center">คงเหลือ (กก.)</th>
                        <th className="p-4 font-bold text-sm text-gray-600 text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyReport.map((row) => {
                        const isLow =
                          products.find((p) => p.product_id === row.product_id)?.reorder_point_kg ?? 0;
                        const statusType =
                          row.closing_kg <= 0 ? 'out' : row.closing_kg < isLow ? 'low' : 'ok';
                        return (
                          <tr
                            key={row.product_id}
                            className="border-b border-rice-50 hover:bg-rice-50/50 transition-colors"
                          >
                            <td className="p-4">
                              <div className="font-semibold">{row.name}</div>
                              {row.name_th && <div className="text-xs text-gray-400">{row.name_th}</div>}
                            </td>
                            <td className="p-4 font-mono">{row.pack_size_kg.toFixed(2)}</td>
                            <td className="p-4 font-mono text-center">{fmt(row.opening_kg)}</td>
                            <td className="p-4 font-mono text-center font-bold text-emerald-700">
                              {row.received_kg > 0 ? `+${fmt(row.received_kg)}` : '-'}
                            </td>
                            <td className="p-4 font-mono text-center font-bold text-rice-600">
                              {row.sold_kg > 0 ? `-${fmt(row.sold_kg)}` : '-'}
                            </td>
                            <td className="p-4 font-mono text-center font-bold text-indigo-700">
                              {fmt(row.closing_kg)}
                            </td>
                            <td className="p-4 text-center">
                              {statusType === 'out' ? (
                                <Badge type="out">หมด</Badge>
                              ) : statusType === 'low' ? (
                                <Badge type="low">เหลือน้อย</Badge>
                              ) : (
                                <Badge type="ok">ปกติ</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-rice-50 border-t-2 border-rice-200 font-bold">
                        <td colSpan={2} className="p-4 text-gray-600">รวม</td>
                        <td className="p-4 font-mono text-center">
                          {fmt(dailyReport.reduce((s, r) => s + r.opening_kg, 0))}
                        </td>
                        <td className="p-4 font-mono text-center text-emerald-700">
                          +{fmt(dailyReport.reduce((s, r) => s + r.received_kg, 0))}
                        </td>
                        <td className="p-4 font-mono text-center text-rice-600">
                          -{fmt(dailyReport.reduce((s, r) => s + r.sold_kg, 0))}
                        </td>
                        <td className="p-4 font-mono text-center text-indigo-700">
                          {fmt(dailyReport.reduce((s, r) => s + r.closing_kg, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* MONTHLY FINANCIAL REPORT TAB                                     */}
        {/* ================================================================ */}
        {activeTab === 'monthly' && (
          <motion.div
            key="monthly"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Month picker */}
            <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h2 className="text-xl font-bold text-rice-600 flex items-center gap-2">
                <ClipboardList className="w-6 h-6" /> รายงานการเงินประจำเดือน
              </h2>
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="px-4 py-2 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all font-mono"
              />
            </div>

            {monthlyLoading ? (
              <div className="bg-white rounded-2xl p-12 text-center text-gray-400 shadow-sm">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                กำลังโหลดข้อมูล...
              </div>
            ) : monthlyData ? (
              <>
                {/* KPI Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-400">
                    <p className="text-sm font-medium text-gray-500 mb-1">ยอดซื้อรวม</p>
                    <p className="text-2xl font-bold text-emerald-700 font-mono">
                      ฿{fmt(monthlyData.totalPurchaseThb)}
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-rice-400">
                    <p className="text-sm font-medium text-gray-500 mb-1">ยอดขายรวม</p>
                    <p className="text-2xl font-bold text-rice-600 font-mono">
                      ฿{fmt(monthlyData.totalSalesThb)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'bg-white p-6 rounded-xl shadow-sm border-l-4',
                      monthlyData.profitThb >= 0 ? 'border-indigo-400' : 'border-red-400'
                    )}
                  >
                    <p className="text-sm font-medium text-gray-500 mb-1">กำไร / ขาดทุน</p>
                    <p
                      className={cn(
                        'text-2xl font-bold font-mono flex items-center gap-2',
                        monthlyData.profitThb >= 0 ? 'text-indigo-700' : 'text-red-600'
                      )}
                    >
                      {monthlyData.profitThb >= 0 ? (
                        <TrendingUp className="w-5 h-5" />
                      ) : (
                        <TrendingDown className="w-5 h-5" />
                      )}
                      ฿{fmt(Math.abs(monthlyData.profitThb))}
                    </p>
                  </div>
                </div>

                {/* Purchase & Sales tables side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Purchase table */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <ArrowDownCircle className="w-5 h-5 text-emerald-600" /> รายการซื้อ
                    </h3>
                    {monthlyData.purchaseRows.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-6">ไม่มีรายการซื้อ</p>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b-2 border-emerald-100">
                            <th className="pb-3 text-sm font-bold text-gray-600">วันที่</th>
                            <th className="pb-3 text-sm font-bold text-gray-600 text-right">จำนวนเงิน (฿)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyData.purchaseRows.map((row) => (
                            <tr key={row.date} className="border-b border-gray-50">
                              <td className="py-2 text-sm">{fmtDate(row.date)}</td>
                              <td className="py-2 text-sm font-mono text-right">
                                {row.amount > 0 ? fmt(row.amount) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-emerald-200 font-bold">
                            <td className="pt-3 text-sm">รวมซื้อ</td>
                            <td className="pt-3 text-sm font-mono text-right text-emerald-700">
                              ฿{fmt(monthlyData.totalPurchaseThb)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>

                  {/* Sales table */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <ArrowUpCircle className="w-5 h-5 text-rice-600" /> รายการขาย
                    </h3>
                    {monthlyData.salesRows.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-6">ไม่มีรายการขาย</p>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b-2 border-rice-100">
                            <th className="pb-3 text-sm font-bold text-gray-600">วันที่</th>
                            <th className="pb-3 text-sm font-bold text-gray-600 text-right">จำนวนเงิน (฿)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyData.salesRows.map((row) => (
                            <tr key={row.date} className="border-b border-gray-50">
                              <td className="py-2 text-sm">{fmtDate(row.date)}</td>
                              <td className="py-2 text-sm font-mono text-right">
                                {row.amount > 0 ? fmt(row.amount) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-rice-200 font-bold">
                            <td className="pt-3 text-sm">รวมขาย</td>
                            <td className="pt-3 text-sm font-mono text-right text-rice-600">
                              ฿{fmt(monthlyData.totalSalesThb)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                </div>

                {/* Current inventory snapshot */}
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-indigo-600" /> สินค้าคงเหลือ (ปัจจุบัน)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-indigo-50 border-b-2 border-indigo-100">
                          <th className="p-3 font-bold text-sm text-gray-600">สินค้า</th>
                          <th className="p-3 font-bold text-sm text-gray-600 text-right">บรรจุ (กก.)</th>
                          <th className="p-3 font-bold text-sm text-gray-600 text-right">คงเหลือ (กก.)</th>
                          <th className="p-3 font-bold text-sm text-gray-600 text-center">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products
                          .filter((p) => p.on_hand_kg > 0)
                          .map((p) => (
                            <tr key={p.product_id} className="border-b border-gray-50">
                              <td className="p-3">
                                <div className="font-semibold text-sm">{p.name}</div>
                                {p.name_th && <div className="text-xs text-gray-400">{p.name_th}</div>}
                              </td>
                              <td className="p-3 font-mono text-sm text-right">{p.pack_size_kg.toFixed(2)}</td>
                              <td className="p-3 font-mono text-sm font-bold text-indigo-700 text-right">
                                {fmt(p.on_hand_kg)}
                              </td>
                              <td className="p-3 text-center">
                                {p.on_hand_kg <= 0 ? (
                                  <Badge type="out">หมด</Badge>
                                ) : p.reorder_point_kg > 0 && p.on_hand_kg < p.reorder_point_kg ? (
                                  <Badge type="low">เหลือน้อย</Badge>
                                ) : (
                                  <Badge type="ok">ปกติ</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center text-gray-400 shadow-sm">
                เลือกเดือนเพื่อดูรายงาน
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================== */}
      {/* TRANSACTION MODAL                                                   */}
      {/* ================================================================== */}
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
              <form onSubmit={handleTransaction} className="space-y-5">
                {/* Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ประเภทรายการ *</label>
                  <select
                    name="type"
                    required
                    value={txnType}
                    onChange={(e) => {
                      setTxnType(e.target.value as 'IN' | 'OUT' | 'ADJUST');
                      setQtyKg('');
                      setUnitPriceInput('');
                    }}
                    className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  >
                    <option value="IN">📥 รับสินค้าเข้า (Receive)</option>
                    <option value="OUT">📤 ขายสินค้า (Sale)</option>
                    <option value="ADJUST">⚖️ ปรับปรุงสต็อก (Adjustment)</option>
                  </select>
                </div>

                {/* Product */}
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
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name} ({p.on_hand_kg.toFixed(2)} กก. คงเหลือ)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Qty */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวน (กก.) *</label>
                  <input
                    name="qty"
                    type="number"
                    step="0.01"
                    required
                    min="0.01"
                    value={qtyKg}
                    onChange={(e) => setQtyKg(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  />
                </div>

                {/* IN-specific: unit price */}
                {txnType === 'IN' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      ราคาต้นทุน / กก. (฿)
                    </label>
                    <input
                      name="unit_price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={unitPriceInput}
                      onChange={(e) => setUnitPriceInput(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                    />
                    {computedTotalCost && (
                      <p className="mt-1 text-sm text-emerald-700 font-semibold">
                        ต้นทุนรวม: ฿{fmt(parseFloat(computedTotalCost))}
                      </p>
                    )}
                  </div>
                )}

                {/* OUT-specific: amount, payment method */}
                {txnType === 'OUT' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        ยอดขาย (฿) *
                      </label>
                      <input
                        name="amount_thb"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        วิธีชำระเงิน *
                      </label>
                      <select
                        name="payment_method"
                        required
                        className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                      >
                        <option value="cash">💵 เงินสด</option>
                        <option value="transfer">📲 โอนเงิน</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Bill number (ref) */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    เลขที่บิล {txnType === 'OUT' ? '*' : ''}
                  </label>
                  <input
                    name="ref"
                    required={txnType === 'OUT'}
                    placeholder={txnType === 'IN' ? 'ใบสั่งซื้อ / อ้างอิง' : 'เลขที่บิล เช่น 001'}
                    className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  />
                </div>

                {/* Note */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ</label>
                  <textarea
                    name="note"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border-2 border-rice-200 focus:border-rice-400 outline-none transition-all"
                  />
                </div>

                <div className="flex gap-4 pt-2">
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

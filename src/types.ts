export interface Product {
  product_id: string;
  name: string;
  name_th?: string;
  category: string;
  pack_size_kg: number;
  reorder_point_kg: number;
  on_hand_kg: number;
  org_id: string;
}

export interface Transaction {
  id: string;
  created_at: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  product_id: string;
  qty_kg: number;
  ref?: string;
  note?: string;
  org_id: string;
  products?: {
    name: string;
  };
}

// Parsed financial data stored as JSON in the note field
export interface FinancialNote {
  amount_thb?: number;
  payment_method?: 'cash' | 'transfer';
  unit_price_thb?: number;
  note?: string;
}

export interface DashboardKPIs {
  total_stock_kg: number;
  sku_count: number;
  low_stock_count: number;
  sales_7d_kg: number;
}

export interface DailyReportRow {
  product_id: string;
  name: string;
  name_th?: string;
  pack_size_kg: number;
  opening_kg: number;
  received_kg: number;
  sold_kg: number;
  closing_kg: number;
}

export interface MonthlyFinancialData {
  totalPurchaseThb: number;
  totalSalesThb: number;
  profitThb: number;
  purchaseRows: { date: string; amount: number }[];
  salesRows: { date: string; amount: number }[];
}

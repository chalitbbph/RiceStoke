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

export interface DashboardKPIs {
  total_stock_kg: number;
  sku_count: number;
  low_stock_count: number;
  sales_7d_kg: number;
}

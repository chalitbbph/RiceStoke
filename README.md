# 🚀 Deploy to GitHub Pages - SUPER EASY!

## Method 1: Direct Upload (No Git Needed!) ✨

### Step 1: Create GitHub Repo (1 minute)
1. Go to: **https://github.com/new**
2. Repository name: `rice-stock` (or anything you want)
3. Make it **Public**
4. ✅ Check "Add a README file"
5. Click **"Create repository"**

### Step 2: Upload Files (30 seconds)
1. In your new repo, click **"Add file"** → **"Upload files"**
2. **Drag and drop** the `index.html` file
3. Click **"Commit changes"**

### Step 3: Enable GitHub Pages (30 seconds)
1. Go to **Settings** (top menu)
2. Scroll to **Pages** (left sidebar)
3. Under "Branch", select **main**
4. Click **Save**
5. Wait 1 minute...
6. Your site is live at: `https://YOUR-USERNAME.github.io/rice-stock/`

### Step 4: Setup Database (1 minute, ONE TIME)
1. Go to: **https://supabase.com/dashboard/project/sopkquvohihiwcpqntqu/sql**
2. Copy & paste this SQL:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  name_th TEXT,
  category TEXT,
  pack_size_kg NUMERIC NOT NULL,
  barcode TEXT,
  reorder_point_kg NUMERIC DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, sku)
);

CREATE TABLE inventory_txn (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  product_id UUID NOT NULL REFERENCES products(id),
  type TEXT CHECK (type IN ('IN', 'OUT', 'ADJUST')),
  qty_kg NUMERIC NOT NULL,
  ref TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE VIEW inventory_on_hand AS
SELECT 
  p.id AS product_id, p.org_id, p.sku, p.name, p.name_th,
  p.category, p.pack_size_kg, p.reorder_point_kg, p.active,
  COALESCE(SUM(CASE 
    WHEN t.type = 'IN' THEN t.qty_kg
    WHEN t.type = 'OUT' THEN -t.qty_kg
    WHEN t.type = 'ADJUST' THEN t.qty_kg
  END), 0) AS on_hand_kg
FROM products p
LEFT JOIN inventory_txn t ON p.id = t.product_id
WHERE p.active = TRUE
GROUP BY p.id, p.org_id, p.sku, p.name, p.name_th, p.category, 
         p.pack_size_kg, p.reorder_point_kg, p.active;

CREATE OR REPLACE FUNCTION create_transaction(
  p_org_id UUID, p_product_id UUID, p_type TEXT, p_qty_kg NUMERIC,
  p_ref TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE v_current_stock NUMERIC; v_new_txn_id UUID;
BEGIN
  SELECT on_hand_kg INTO v_current_stock
  FROM inventory_on_hand WHERE product_id = p_product_id;
  
  IF p_type = 'OUT' AND v_current_stock < p_qty_kg THEN
    RETURN json_build_object('success', FALSE, 'error', 'Insufficient stock');
  END IF;
  
  INSERT INTO inventory_txn (org_id, product_id, type, qty_kg, ref, note)
  VALUES (p_org_id, p_product_id, p_type, ABS(p_qty_kg), p_ref, p_note)
  RETURNING id INTO v_new_txn_id;
  
  RETURN json_build_object('success', TRUE, 'transaction_id', v_new_txn_id);
END; $$;

CREATE OR REPLACE FUNCTION get_dashboard_kpis(p_org_id UUID)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE
  v_total NUMERIC; v_count INT; v_low INT; v_sales NUMERIC;
BEGIN
  SELECT COALESCE(SUM(on_hand_kg), 0) INTO v_total FROM inventory_on_hand WHERE org_id = p_org_id;
  SELECT COUNT(*) INTO v_count FROM products WHERE org_id = p_org_id AND active = TRUE;
  SELECT COUNT(*) INTO v_low FROM inventory_on_hand WHERE org_id = p_org_id AND on_hand_kg < reorder_point_kg;
  SELECT COALESCE(SUM(qty_kg), 0) INTO v_sales FROM inventory_txn 
    WHERE org_id = p_org_id AND type = 'OUT' AND created_at >= NOW() - INTERVAL '7 days';
  
  RETURN json_build_object('total_stock_kg', v_total, 'sku_count', v_count,
    'low_stock_count', v_low, 'sales_7d_kg', v_sales);
END; $$;

INSERT INTO organizations (id, name) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Demo Rice Company')
ON CONFLICT DO NOTHING;
```

3. Click **"Run"** (Ctrl+Enter)

### Step 5: Login & Use! 🎉
Visit: `https://YOUR-USERNAME.github.io/rice-stock/`

Login:
- **Username:** `admin123`
- **Password:** `123`

---

## Method 2: Using Git (For Developers) 💻

```bash
# 1. Extract the ZIP file
cd rice-stock-github

# 2. Initialize Git
git init
git add .
git commit -m "Initial commit - Rice Stock Management"

# 3. Create repo on GitHub (via web interface)
# Then link it:
git remote add origin https://github.com/YOUR-USERNAME/rice-stock.git
git branch -M main
git push -u origin main

# 4. Enable GitHub Pages
# Go to Settings → Pages → Select main branch → Save
```

---

## 🎯 Your App URL

After enabling GitHub Pages, your app will be at:
```
https://YOUR-USERNAME.github.io/rice-stock/
```

Example: If your username is `johndoe`, the URL is:
```
https://johndoe.github.io/rice-stock/
```

---

## ✨ Features

✅ Fixed login (admin123 / 123)
✅ Dashboard with real-time KPIs
✅ Product management
✅ Stock transactions (IN/OUT/ADJUST)
✅ Sales analytics with charts
✅ Mobile responsive
✅ Works on any device!

---

## 🔧 Need Custom Domain?

In GitHub repo settings:
1. Go to **Settings** → **Pages**
2. Under "Custom domain", enter: `yourdomain.com`
3. Follow the DNS setup instructions
4. Done!

---

## 📱 Share Your App

Once deployed, anyone can access:
`https://YOUR-USERNAME.github.io/rice-stock/`

Everyone uses the same login: **admin123 / 123**

---

## 🎨 Want to Change Login?

Edit `index.html` around line 610:
```javascript
const ADMIN_USERNAME = 'admin123'; // Change this
const ADMIN_PASSWORD = '123';      // Change this
```

Then commit and push:
```bash
git add index.html
git commit -m "Updated login credentials"
git push
```

Wait 1 minute, changes are live!

---

## 💡 Pro Tips

**Add sample data:** Use the SQL at the bottom of this file

**Multiple users:** Just share the URL! Same login for everyone

**Update the app:** Just upload a new `index.html` file

**Free hosting:** GitHub Pages is 100% free forever!

---

## 🆘 Troubleshooting

**Page not loading?**
- Wait 1-2 minutes after enabling Pages
- Check Settings → Pages for the URL
- Make sure repo is Public

**Database not working?**
- Run the SQL script in Supabase
- Check Supabase URL in index.html (should be: sopkquvohihiwcpqntqu)

**Can't login?**
- Use: admin123 / 123
- Check browser console (F12) for errors

---

## 📊 Sample Data (Optional)

Want some test data? Run this in Supabase:

```sql
-- Add sample products
INSERT INTO products (org_id, sku, name, name_th, category, pack_size_kg, reorder_point_kg) VALUES
  ('00000000-0000-0000-0000-000000000001', 'RICE-001', 'Jasmine Rice Premium', 'ข้าวหอมมะลิพรีเมียม', 'Jasmine', 25, 500),
  ('00000000-0000-0000-0000-000000000001', 'RICE-002', 'Thai Hom Mali', 'ข้าวหอมมะลิไทย', 'Jasmine', 5, 200),
  ('00000000-0000-0000-0000-000000000001', 'RICE-003', 'White Rice', 'ข้าวขาว', 'White', 10, 300),
  ('00000000-0000-0000-0000-000000000001', 'RICE-004', 'Brown Rice', 'ข้าวกล้อง', 'Brown', 2, 100),
  ('00000000-0000-0000-0000-000000000001', 'RICE-005', 'Sticky Rice', 'ข้าวเหนียว', 'Sticky', 5, 150);

-- Add initial stock
INSERT INTO inventory_txn (org_id, product_id, type, qty_kg, ref, note) 
SELECT 
  '00000000-0000-0000-0000-000000000001',
  id,
  'IN',
  pack_size_kg * 50,
  'PO-INITIAL',
  'Initial stock'
FROM products 
WHERE org_id = '00000000-0000-0000-0000-000000000001';

-- Add some sales
INSERT INTO inventory_txn (org_id, product_id, type, qty_kg, ref, note)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  id,
  'OUT',
  pack_size_kg * 5,
  'SALE-001',
  'Customer order'
FROM products 
WHERE org_id = '00000000-0000-0000-0000-000000000001'
LIMIT 3;
```

---

**Total deployment time: Under 3 minutes! 🚀**

GitHub Pages + Supabase = FREE forever hosting! 💰

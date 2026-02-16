-- ==================== DIRECT SALES / OPEN ROUTE SALES MODULE ====================
-- Allows delivery agents to sell directly to road/home customers without registered shops
-- Tracks customer info, batch-wise sales, cash collection, and dues

-- ==================== DIRECT CUSTOMERS ====================
-- Reusable customer profiles (auto-created when mobile number provided)
CREATE TABLE IF NOT EXISTS direct_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  mobile VARCHAR(20) UNIQUE,
  road_area VARCHAR(255),
  house_no VARCHAR(100),
  city VARCHAR(255),
  customer_type VARCHAR(30) DEFAULT 'walk_in' CHECK (customer_type IN ('walk_in', 'home_delivery', 'temporary')),
  notes TEXT,
  total_purchases NUMERIC(12,2) DEFAULT 0,
  total_dues NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_customers_mobile ON direct_customers(mobile);
CREATE INDEX IF NOT EXISTS idx_direct_customers_road ON direct_customers(road_area);

-- ==================== DIRECT SALES ====================
-- Main record for each direct sale transaction (analogous to 'deliveries' for shops)
CREATE TABLE IF NOT EXISTS direct_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES app_users(id),
  allocation_id UUID REFERENCES agent_stock_allocations(id),
  route_id UUID REFERENCES routes(id),
  customer_id UUID REFERENCES direct_customers(id),
  customer_name VARCHAR(255),
  customer_mobile VARCHAR(20),
  road_area VARCHAR(255) NOT NULL,
  house_no VARCHAR(100),
  customer_type VARCHAR(30) NOT NULL DEFAULT 'walk_in' CHECK (customer_type IN ('walk_in', 'home_delivery', 'temporary')),
  total_items INTEGER NOT NULL DEFAULT 0,
  total_quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(30) NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'upi', 'mixed')),
  notes TEXT,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_sales_agent ON direct_sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_direct_sales_route ON direct_sales(route_id);
CREATE INDEX IF NOT EXISTS idx_direct_sales_allocation ON direct_sales(allocation_id);
CREATE INDEX IF NOT EXISTS idx_direct_sales_customer ON direct_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_direct_sales_road ON direct_sales(road_area);
CREATE INDEX IF NOT EXISTS idx_direct_sales_date ON direct_sales(sale_date);

-- ==================== DIRECT SALE ITEMS ====================
-- Line items for each direct sale (batch-wise product tracking)
CREATE TABLE IF NOT EXISTS direct_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_sale_id UUID NOT NULL REFERENCES direct_sales(id) ON DELETE CASCADE,
  allocation_item_id UUID REFERENCES agent_stock_items(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  packaging_type VARCHAR(100),
  package_size VARCHAR(50),
  quantity_sold NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  price_per_unit NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_sale_items_sale ON direct_sale_items(direct_sale_id);
CREATE INDEX IF NOT EXISTS idx_direct_sale_items_allocation ON direct_sale_items(allocation_item_id);

-- ==================== RLS POLICIES ====================
ALTER TABLE direct_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_sale_items ENABLE ROW LEVEL SECURITY;

-- direct_customers: Full access for authenticated users
CREATE POLICY "direct_customers_select" ON direct_customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "direct_customers_insert" ON direct_customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "direct_customers_update" ON direct_customers FOR UPDATE TO authenticated USING (true);

-- direct_sales: Full access for authenticated users
CREATE POLICY "direct_sales_select" ON direct_sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "direct_sales_insert" ON direct_sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "direct_sales_update" ON direct_sales FOR UPDATE TO authenticated USING (true);

-- direct_sale_items: Full access for authenticated users
CREATE POLICY "direct_sale_items_select" ON direct_sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "direct_sale_items_insert" ON direct_sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "direct_sale_items_update" ON direct_sale_items FOR UPDATE TO authenticated USING (true);

-- ==================== UPDATED_AT TRIGGER ====================
CREATE OR REPLACE FUNCTION update_direct_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_direct_sales_updated_at
  BEFORE UPDATE ON direct_sales
  FOR EACH ROW EXECUTE FUNCTION update_direct_sales_updated_at();

CREATE TRIGGER trg_direct_customers_updated_at
  BEFORE UPDATE ON direct_customers
  FOR EACH ROW EXECUTE FUNCTION update_direct_sales_updated_at();

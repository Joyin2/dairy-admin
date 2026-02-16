-- ============================================================
-- PRODUCT RETURN MANAGEMENT SYSTEM
-- Shop → Delivery Agent → Admin Approval → Inventory/Waste
-- ============================================================

-- ==================== PRODUCT RETURNS (Main Request) ====================
CREATE TABLE IF NOT EXISTS product_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id),
  route_id UUID REFERENCES routes(id),
  agent_id UUID NOT NULL REFERENCES app_users(id),
  allocation_id UUID REFERENCES agent_stock_allocations(id),
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_type VARCHAR(30) NOT NULL DEFAULT 'sale_return' CHECK (return_type IN ('sale_return', 'delivery_return')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved_restock', 'approved_waste', 'partial', 'rejected')),
  total_items INTEGER NOT NULL DEFAULT 0,
  total_quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_returns_shop ON product_returns(shop_id);
CREATE INDEX IF NOT EXISTS idx_product_returns_agent ON product_returns(agent_id);
CREATE INDEX IF NOT EXISTS idx_product_returns_status ON product_returns(status);
CREATE INDEX IF NOT EXISTS idx_product_returns_date ON product_returns(return_date);

-- ==================== PRODUCT RETURN ITEMS ====================
CREATE TABLE IF NOT EXISTS product_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES product_returns(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  packaging_type VARCHAR(100),
  package_size VARCHAR(50),
  quantity_returned NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  price_per_unit NUMERIC(10,2) DEFAULT 0,
  total_value NUMERIC(12,2) DEFAULT 0,
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('expired', 'damaged', 'leakage', 'wrong_supply', 'customer_complaint', 'other')),
  reason_note TEXT,
  photo_url TEXT,
  disposition VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (disposition IN ('pending', 'restock', 'waste', 'rejected')),
  admin_notes TEXT,
  inventory_item_id UUID,
  delivery_sale_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_return_items_return ON product_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_product_return_items_batch ON product_return_items(batch_number);
CREATE INDEX IF NOT EXISTS idx_product_return_items_disposition ON product_return_items(disposition);

-- ==================== WASTE LEDGER ====================
CREATE TABLE IF NOT EXISTS waste_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_return_item_id UUID REFERENCES product_return_items(id),
  product_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  value_loss NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason VARCHAR(50) NOT NULL,
  reason_note TEXT,
  shop_name VARCHAR(255),
  agent_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id)
);

CREATE INDEX IF NOT EXISTS idx_waste_ledger_batch ON waste_ledger(batch_number);
CREATE INDEX IF NOT EXISTS idx_waste_ledger_date ON waste_ledger(created_at);

-- ==================== RLS POLICIES ====================

-- product_returns: All authenticated users can read, agents can insert their own
ALTER TABLE product_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all read product_returns" ON product_returns;
CREATE POLICY "Allow all read product_returns" ON product_returns
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert product_returns" ON product_returns;
CREATE POLICY "Allow insert product_returns" ON product_returns
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update product_returns" ON product_returns;
CREATE POLICY "Allow update product_returns" ON product_returns
  FOR UPDATE USING (true);

-- product_return_items: Same policies
ALTER TABLE product_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all read product_return_items" ON product_return_items;
CREATE POLICY "Allow all read product_return_items" ON product_return_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert product_return_items" ON product_return_items;
CREATE POLICY "Allow insert product_return_items" ON product_return_items
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update product_return_items" ON product_return_items;
CREATE POLICY "Allow update product_return_items" ON product_return_items
  FOR UPDATE USING (true);

-- waste_ledger: Read all, insert/update allowed
ALTER TABLE waste_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all read waste_ledger" ON waste_ledger;
CREATE POLICY "Allow all read waste_ledger" ON waste_ledger
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert waste_ledger" ON waste_ledger;
CREATE POLICY "Allow insert waste_ledger" ON waste_ledger
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update waste_ledger" ON waste_ledger;
CREATE POLICY "Allow update waste_ledger" ON waste_ledger
  FOR UPDATE USING (true);

-- ==================== AUTO-UPDATE TIMESTAMP ====================
CREATE OR REPLACE FUNCTION update_product_returns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_returns_updated_at ON product_returns;
CREATE TRIGGER trigger_update_product_returns_updated_at
  BEFORE UPDATE ON product_returns
  FOR EACH ROW
  EXECUTE FUNCTION update_product_returns_updated_at();

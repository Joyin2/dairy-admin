-- Stock Returns Approval Workflow Migration
-- Run this in Supabase SQL Editor

-- ==================== STOCK RETURNS TABLE ====================
-- Records return requests from delivery agents for admin approval
CREATE TABLE IF NOT EXISTS stock_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id UUID NOT NULL REFERENCES agent_stock_allocations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status VARCHAR(30) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected', 'partial')),
  total_items INTEGER DEFAULT 0,
  total_quantity NUMERIC(10,3) DEFAULT 0,
  notes TEXT,
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_returns_allocation ON stock_returns(allocation_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_agent ON stock_returns(agent_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_status ON stock_returns(status);

-- ==================== STOCK RETURN ITEMS ====================
-- Individual items within a return request with disposition
CREATE TABLE IF NOT EXISTS stock_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES stock_returns(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES agent_stock_items(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  packaging_type VARCHAR(100),
  package_size VARCHAR(50),
  quantity_returned NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  -- Admin disposition fields
  disposition VARCHAR(30) DEFAULT 'pending'
    CHECK (disposition IN ('pending', 'restock', 'waste', 'rejected')),
  restock_quantity NUMERIC(10,3) DEFAULT 0,
  waste_quantity NUMERIC(10,3) DEFAULT 0,
  waste_reason TEXT,
  inventory_item_id UUID REFERENCES production_inventory(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_return_items_return ON stock_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_stock_return_items_stock_item ON stock_return_items(stock_item_id);

-- ==================== RLS POLICIES ====================
ALTER TABLE stock_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_return_items ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users
CREATE POLICY "Allow all for authenticated users" ON stock_returns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON stock_return_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==================== COMMENTS ====================
COMMENT ON TABLE stock_returns IS 'Return requests from delivery agents awaiting admin approval';
COMMENT ON TABLE stock_return_items IS 'Individual items in a return request with admin disposition';
COMMENT ON COLUMN stock_return_items.disposition IS 'pending=awaiting review, restock=return to inventory, waste=damaged/expired, rejected=not accepted';
COMMENT ON COLUMN stock_return_items.waste_reason IS 'Reason for marking item as waste (damaged, expired, contaminated, etc.)';

-- ==================== NOTIFY SCHEMA RELOAD ====================
NOTIFY pgrst, 'reload schema';

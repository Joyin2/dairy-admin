-- Agent Stock Dispatch & Delivery System Migration
-- Run this in Supabase SQL Editor

-- ==================== AGENT STOCK ALLOCATIONS ====================
-- Admin creates an allocation to dispatch stock to a delivery agent
CREATE TABLE IF NOT EXISTS agent_stock_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status VARCHAR(30) DEFAULT 'pending_pickup' 
    CHECK (status IN ('pending_pickup', 'picked_up', 'in_delivery', 'completed', 'returned')),
  notes TEXT,
  created_by UUID REFERENCES app_users(id),
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  picked_up_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_stock_allocations_agent ON agent_stock_allocations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_stock_allocations_status ON agent_stock_allocations(status);

-- ==================== AGENT STOCK ITEMS ====================
-- Individual products within an allocation (batch-level tracking)
CREATE TABLE IF NOT EXISTS agent_stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id UUID NOT NULL REFERENCES agent_stock_allocations(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES production_inventory(id),
  product_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  packaging_type VARCHAR(100),
  package_size VARCHAR(50),
  quantity_allocated NUMERIC(10,3) NOT NULL,
  quantity_sold NUMERIC(10,3) DEFAULT 0,
  quantity_returned NUMERIC(10,3) DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_stock_items_allocation ON agent_stock_items(allocation_id);

-- ==================== DELIVERY SALES ====================
-- Records per-delivery, per-product/batch sales
CREATE TABLE IF NOT EXISTS delivery_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
  allocation_item_id UUID REFERENCES agent_stock_items(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  quantity_sold NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  price_per_unit NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_sales_delivery ON delivery_sales(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sales_allocation_item ON delivery_sales(allocation_item_id);

-- ==================== RLS POLICIES ====================
ALTER TABLE agent_stock_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_sales ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users
CREATE POLICY "Allow all for authenticated users" ON agent_stock_allocations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON agent_stock_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON delivery_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==================== COMMENTS ====================
COMMENT ON TABLE agent_stock_allocations IS 'Admin-created stock allocations dispatched to delivery agents';
COMMENT ON TABLE agent_stock_items IS 'Individual batch-level products within a stock allocation';
COMMENT ON TABLE delivery_sales IS 'Per-delivery, per-product sales records with batch tracking';
COMMENT ON COLUMN agent_stock_allocations.status IS 'pending_pickup=approved by admin, picked_up=agent confirmed, in_delivery=agent delivering, completed=all done, returned=stock returned';

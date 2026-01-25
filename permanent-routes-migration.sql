-- Migration to transform routes from date-based to permanent structures
-- This implements the requirement where routes are permanent and daily deliveries reference them

-- ===== Step 1: Modify routes table to be permanent (not date-based) =====

-- Remove date column requirement, make it nullable for backward compatibility
ALTER TABLE routes ALTER COLUMN date DROP NOT NULL;

-- Add new columns for permanent routes
ALTER TABLE routes
ADD COLUMN IF NOT EXISTS area TEXT,
ADD COLUMN IF NOT EXISTS locality TEXT,
ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'morning', -- morning, evening, both
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES app_users(id);

-- Add comments
COMMENT ON COLUMN routes.area IS 'Geographic area covered by route (e.g., South Area)';
COMMENT ON COLUMN routes.delivery_type IS 'When deliveries happen: morning, evening, or both';
COMMENT ON COLUMN routes.is_active IS 'Whether route is currently active';
COMMENT ON COLUMN routes.created_by IS 'User who created the route (typically delivery agent)';

-- ===== Step 2: Create route_shops junction table for permanent shop assignments =====

CREATE TABLE IF NOT EXISTS route_shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL, -- Order in which shops are visited (1, 2, 3...)
  expected_products JSONB DEFAULT '[]'::jsonb, -- [{product_id, product_name, default_qty}]
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(route_id, shop_id), -- A shop can only appear once in a route
  UNIQUE(route_id, sequence) -- Each sequence number must be unique within a route
);

-- Add indexes for route_shops
CREATE INDEX IF NOT EXISTS idx_route_shops_route ON route_shops(route_id);
CREATE INDEX IF NOT EXISTS idx_route_shops_shop ON route_shops(shop_id);
CREATE INDEX IF NOT EXISTS idx_route_shops_sequence ON route_shops(route_id, sequence);

-- Add comments
COMMENT ON TABLE route_shops IS 'Junction table linking routes to shops with delivery sequence';
COMMENT ON COLUMN route_shops.sequence IS 'Order of delivery (1 = first stop, 2 = second stop, etc.)';

-- ===== Step 3: Add approval workflow columns to shops =====

ALTER TABLE shops
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved', -- pending_approval, approved, rejected
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES app_users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS gps_location GEOGRAPHY(POINT, 4326); -- GPS coordinates for shop

-- Add index for filtering by status
CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status);
CREATE INDEX IF NOT EXISTS idx_shops_created_by ON shops(created_by);

-- Add comments
COMMENT ON COLUMN shops.status IS 'Approval status: pending_approval (agent created), approved, rejected';
COMMENT ON COLUMN shops.gps_location IS 'GPS coordinates captured when shop was added';

-- ===== Step 4: Create daily_deliveries table (separating daily execution from permanent routes) =====

CREATE TABLE IF NOT EXISTS daily_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date DATE NOT NULL,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  sequence INTEGER, -- Copied from route_shops for this day
  expected_products JSONB DEFAULT '[]'::jsonb, -- Copied from route_shops
  delivered_items JSONB DEFAULT '[]'::jsonb, -- Actual delivery: [{product_id, qty, price}]
  status TEXT DEFAULT 'pending', -- pending, in_transit, delivered, partial, returned, failed
  expected_qty NUMERIC(12,3),
  delivered_qty NUMERIC(12,3),
  proof_url TEXT,
  signature_url TEXT,
  collected_amount NUMERIC(14,2) DEFAULT 0,
  payment_mode TEXT DEFAULT 'cash',
  notes TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(delivery_date, route_id, shop_id) -- One delivery per shop per route per day
);

-- Add indexes for daily_deliveries
CREATE INDEX IF NOT EXISTS idx_daily_deliveries_date ON daily_deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_daily_deliveries_route ON daily_deliveries(route_id);
CREATE INDEX IF NOT EXISTS idx_daily_deliveries_shop ON daily_deliveries(shop_id);
CREATE INDEX IF NOT EXISTS idx_daily_deliveries_agent ON daily_deliveries(agent_id);
CREATE INDEX IF NOT EXISTS idx_daily_deliveries_status ON daily_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_daily_deliveries_date_route ON daily_deliveries(delivery_date, route_id);

-- Add comments
COMMENT ON TABLE daily_deliveries IS 'Daily execution of deliveries based on permanent routes';
COMMENT ON COLUMN daily_deliveries.route_id IS 'References permanent route being executed';

-- ===== Step 5: Enable RLS on new tables =====

ALTER TABLE route_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for route_shops
DROP POLICY IF EXISTS route_shops_all_authenticated ON route_shops;
CREATE POLICY route_shops_all_authenticated ON route_shops
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for daily_deliveries
DROP POLICY IF EXISTS daily_deliveries_all_authenticated ON daily_deliveries;
CREATE POLICY daily_deliveries_all_authenticated ON daily_deliveries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Update RLS for shops to allow agent creation
DROP POLICY IF EXISTS shops_all_authenticated ON shops;
CREATE POLICY shops_all_authenticated ON shops
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Step 6: Add triggers for updated_at =====

DROP TRIGGER IF EXISTS route_shops_updated_at ON route_shops;
CREATE TRIGGER route_shops_updated_at
  BEFORE UPDATE ON route_shops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS daily_deliveries_updated_at ON daily_deliveries;
CREATE TRIGGER daily_deliveries_updated_at
  BEFORE UPDATE ON daily_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===== Step 7: Helper function to create daily deliveries from a route =====

CREATE OR REPLACE FUNCTION generate_daily_deliveries_for_route(
  p_route_id UUID,
  p_delivery_date DATE,
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE(delivery_id UUID, shop_name TEXT) AS $$
DECLARE
  v_route_exists BOOLEAN;
  v_agent UUID;
BEGIN
  -- Check if route exists and is active
  SELECT EXISTS(SELECT 1 FROM routes WHERE id = p_route_id AND is_active = true)
  INTO v_route_exists;
  
  IF NOT v_route_exists THEN
    RAISE EXCEPTION 'Route does not exist or is not active';
  END IF;
  
  -- Get agent from route if not provided
  IF p_agent_id IS NULL THEN
    SELECT agent_id INTO v_agent FROM routes WHERE id = p_route_id;
  ELSE
    v_agent := p_agent_id;
  END IF;
  
  -- Insert daily deliveries for all shops in the route
  RETURN QUERY
  INSERT INTO daily_deliveries (
    delivery_date,
    route_id,
    shop_id,
    agent_id,
    sequence,
    expected_products,
    status
  )
  SELECT
    p_delivery_date,
    rs.route_id,
    rs.shop_id,
    v_agent,
    rs.sequence,
    rs.expected_products,
    'pending'
  FROM route_shops rs
  INNER JOIN shops s ON rs.shop_id = s.id
  WHERE rs.route_id = p_route_id
    AND s.status = 'approved' -- Only include approved shops
  ORDER BY rs.sequence
  ON CONFLICT (delivery_date, route_id, shop_id) DO NOTHING
  RETURNING id, (SELECT name FROM shops WHERE id = shop_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_daily_deliveries_for_route IS 'Creates daily delivery records for all shops in a route';

-- ===== Step 8: Migration helper - convert existing date-based routes to permanent =====
-- This is optional and can be run to preserve existing data

-- Mark all existing routes as permanent (if any exist)
UPDATE routes 
SET is_active = true, 
    created_by = agent_id,
    description = 'Migrated from date-based system'
WHERE date IS NOT NULL;

-- ===== Verification queries =====
SELECT 'Routes table modified' AS status;
SELECT 'route_shops table created' AS status;
SELECT 'daily_deliveries table created' AS status;
SELECT 'Shops approval columns added' AS status;
SELECT 'Helper function created' AS status;

-- Show table structures
SELECT 
  'routes' as table_name, 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'routes' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

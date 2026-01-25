-- Enforce one-to-many relationship: Each shop belongs to only ONE route at a time
-- This migration enforces fixed route-shop assignments

-- ===== Step 1: Migrate data from route_shops to shops.route_id (if table exists) =====

-- Check if route_shops exists and migrate data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'route_shops') THEN
    -- Update shops.route_id from route_shops junction table (take first/lowest sequence route)
    UPDATE shops s
    SET route_id = (
      SELECT rs.route_id 
      FROM route_shops rs 
      WHERE rs.shop_id = s.id 
      ORDER BY rs.sequence 
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM route_shops rs WHERE rs.shop_id = s.id
    );
    
    RAISE NOTICE 'Migrated data from route_shops to shops.route_id';
  ELSE
    RAISE NOTICE 'route_shops table does not exist, skipping migration';
  END IF;
END $$;

-- ===== Step 2: Drop route_shops junction table (if exists) =====
-- We no longer need many-to-many, using direct foreign key instead

DROP TABLE IF EXISTS route_shops CASCADE;

-- ===== Step 3: Add route_id column to shops if it doesn't exist =====

ALTER TABLE shops
ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES routes(id) ON DELETE SET NULL;

-- Add index for route_id lookups
CREATE INDEX IF NOT EXISTS idx_shops_route ON shops(route_id);

-- ===== Step 4: Make route_id NOT NULL for active shops =====
-- Shops must belong to a route (can be nullable for shops without routes)

-- Add constraint to prevent shop from being in multiple routes
-- (Already enforced by single column, but good to document)
COMMENT ON COLUMN shops.route_id IS 'Route this shop belongs to (one shop = one route)';

-- ===== Step 5: Add sequence column to shops for delivery order =====

ALTER TABLE shops
ADD COLUMN IF NOT EXISTS sequence INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS expected_products JSONB DEFAULT '[]'::jsonb;

-- Add index for route_id lookups
CREATE INDEX IF NOT EXISTS idx_shops_route_sequence ON shops(route_id, sequence);

COMMENT ON COLUMN shops.sequence IS 'Delivery order within the route (1, 2, 3...)';
COMMENT ON COLUMN shops.expected_products IS 'Default products expected at this shop [{product_id, qty}]';

-- ===== Step 6: Add unique constraint for sequence within route =====

CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_route_sequence_unique 
ON shops(route_id, sequence) 
WHERE route_id IS NOT NULL;

-- ===== Step 7: Update daily_deliveries to reference shops directly =====

-- The daily_deliveries table will get route_id from shops automatically
-- Update existing daily_deliveries to ensure route_id matches shop's route

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_deliveries') THEN
    UPDATE daily_deliveries dd
    SET route_id = (SELECT route_id FROM shops WHERE id = dd.shop_id)
    WHERE dd.shop_id IS NOT NULL;
    
    RAISE NOTICE 'Updated daily_deliveries to match shop routes';
  ELSE
    RAISE NOTICE 'daily_deliveries table does not exist, skipping';
  END IF;
END $$;

-- ===== Step 8: Add constraint to daily_deliveries =====

-- Ensure delivery route matches shop's route
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_deliveries') THEN
    ALTER TABLE daily_deliveries
    DROP CONSTRAINT IF EXISTS daily_deliveries_route_shop_match;
    
    ALTER TABLE daily_deliveries
    ADD CONSTRAINT daily_deliveries_route_shop_match
    CHECK (route_id = (SELECT route_id FROM shops WHERE id = shop_id));
    
    RAISE NOTICE 'Added constraint to daily_deliveries';
  ELSE
    RAISE NOTICE 'daily_deliveries table does not exist, skipping constraint';
  END IF;
END $$;

-- ===== Step 9: Create helper function to reassign shop to different route =====

CREATE OR REPLACE FUNCTION reassign_shop_to_route(
  p_shop_id UUID,
  p_new_route_id UUID,
  p_sequence INTEGER DEFAULT 999
)
RETURNS JSONB AS $$
DECLARE
  v_old_route_id UUID;
  v_shop_name TEXT;
BEGIN
  -- Get current route
  SELECT route_id, name INTO v_old_route_id, v_shop_name
  FROM shops WHERE id = p_shop_id;
  
  -- Update shop to new route
  UPDATE shops
  SET route_id = p_new_route_id,
      sequence = p_sequence
  WHERE id = p_shop_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'shop_name', v_shop_name,
    'old_route', v_old_route_id,
    'new_route', p_new_route_id
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reassign_shop_to_route IS 'Move shop from one route to another';

-- ===== Step 10: Create function to get shops for a route =====

CREATE OR REPLACE FUNCTION get_route_shops(p_route_id UUID)
RETURNS TABLE(
  shop_id UUID,
  shop_name TEXT,
  sequence INTEGER,
  contact TEXT,
  address TEXT,
  expected_products JSONB,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.sequence,
    s.contact,
    s.address,
    s.expected_products,
    s.status
  FROM shops s
  WHERE s.route_id = p_route_id
    AND s.status = 'approved'
  ORDER BY s.sequence ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_route_shops IS 'Get all shops assigned to a specific route, ordered by sequence';

-- ===== Step 11: Update generate_daily_deliveries_for_route function =====

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
    p_route_id,
    s.id,
    v_agent,
    s.sequence,
    s.expected_products,
    'pending'
  FROM shops s
  WHERE s.route_id = p_route_id
    AND s.status = 'approved'
  ORDER BY s.sequence
  ON CONFLICT (delivery_date, route_id, shop_id) DO NOTHING
  RETURNING id, (SELECT name FROM shops WHERE id = shop_id);
END;
$$ LANGUAGE plpgsql;

-- ===== Verification =====

SELECT 'Migrated to single route per shop' AS status;
SELECT COUNT(*) AS shops_with_routes FROM shops WHERE route_id IS NOT NULL;
SELECT r.name, COUNT(s.id) AS shop_count 
FROM routes r 
LEFT JOIN shops s ON s.route_id = r.id 
GROUP BY r.id, r.name 
ORDER BY r.name;

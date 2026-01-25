-- Pool Archive System Migration
-- Direct: Milk Pool → Usage History → Inventory (No Batches)
-- Features: Reset Pool, Archive Previous Pools, View History

-- ===== Step 1: Add reset_at column to milk_pool =====
ALTER TABLE milk_pool ADD COLUMN IF NOT EXISTS reset_at TIMESTAMPTZ;

-- ===== Step 2: Create milk_pool_archive table =====
CREATE TABLE IF NOT EXISTS milk_pool_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_pool_id UUID NOT NULL,
  pool_name TEXT NOT NULL,
  total_milk_liters NUMERIC(12,3) NOT NULL DEFAULT 0,
  total_fat_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_snf_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  original_avg_fat NUMERIC(6,3) NOT NULL DEFAULT 0,
  original_avg_snf NUMERIC(6,3) NOT NULL DEFAULT 0,
  remaining_milk_liters NUMERIC(12,3) NOT NULL DEFAULT 0,
  remaining_fat_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  remaining_snf_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  current_avg_fat NUMERIC(6,3) NOT NULL DEFAULT 0,
  current_avg_snf NUMERIC(6,3) NOT NULL DEFAULT 0,
  pool_created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now(),
  archived_by UUID REFERENCES app_users(id),
  snapshot_data JSONB DEFAULT '{}'::jsonb -- stores usage_history, collections, etc.
);

-- ===== Step 3: Add usage_id to inventory_items for direct linking =====
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS usage_id UUID REFERENCES milk_usage_log(id);

-- ===== Step 4: Create usage_inventory junction table =====
-- This links each usage to inventory items created
CREATE TABLE IF NOT EXISTS usage_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_id UUID NOT NULL REFERENCES milk_usage_log(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT DEFAULT 'L',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== Step 5: Enable RLS =====
ALTER TABLE milk_pool_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS milk_pool_archive_all_authenticated ON milk_pool_archive;
CREATE POLICY milk_pool_archive_all_authenticated ON milk_pool_archive
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS usage_inventory_items_all_authenticated ON usage_inventory_items;
CREATE POLICY usage_inventory_items_all_authenticated ON usage_inventory_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Step 6: Function to reset pool and archive =====
CREATE OR REPLACE FUNCTION reset_milk_pool(
  p_pool_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_pool RECORD;
  v_archive_id UUID;
  v_usage_history JSONB;
  v_collections_history JSONB;
  v_inventory_history JSONB;
  v_new_pool_id UUID;
BEGIN
  -- Get current pool
  SELECT * INTO v_pool FROM milk_pool WHERE id = p_pool_id AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Active pool not found');
  END IF;

  -- Gather usage history for this pool
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ul.id,
      'used_liters', ul.used_liters,
      'manual_fat_percent', ul.manual_fat_percent,
      'used_fat_units', ul.used_fat_units,
      'purpose', ul.purpose,
      'used_at', ul.used_at,
      'remaining_liters_after', ul.remaining_liters_after,
      'remaining_avg_fat_after', ul.remaining_avg_fat_after
    ) ORDER BY ul.used_at
  ), '[]'::jsonb)
  INTO v_usage_history
  FROM milk_usage_log ul
  WHERE ul.milk_pool_id = p_pool_id;

  -- Gather collections history
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'collection_id', pc.collection_id,
      'added_at', pc.added_at,
      'qty_liters', mc.qty_liters,
      'fat', mc.fat,
      'snf', mc.snf,
      'supplier_id', mc.supplier_id
    ) ORDER BY pc.added_at
  ), '[]'::jsonb)
  INTO v_collections_history
  FROM pool_collections pc
  JOIN milk_collections mc ON mc.id = pc.collection_id
  WHERE pc.milk_pool_id = p_pool_id;

  -- Gather inventory items created from this pool's usage
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'usage_id', uii.usage_id,
      'product_id', uii.product_id,
      'quantity', uii.quantity,
      'unit', uii.unit,
      'created_at', uii.created_at
    )
  ), '[]'::jsonb)
  INTO v_inventory_history
  FROM usage_inventory_items uii
  JOIN milk_usage_log ul ON ul.id = uii.usage_id
  WHERE ul.milk_pool_id = p_pool_id;

  -- Create archive entry
  INSERT INTO milk_pool_archive (
    original_pool_id,
    pool_name,
    total_milk_liters,
    total_fat_units,
    total_snf_units,
    original_avg_fat,
    original_avg_snf,
    remaining_milk_liters,
    remaining_fat_units,
    remaining_snf_units,
    current_avg_fat,
    current_avg_snf,
    pool_created_at,
    archived_by,
    snapshot_data
  ) VALUES (
    v_pool.id,
    v_pool.name,
    v_pool.total_milk_liters,
    v_pool.total_fat_units,
    v_pool.total_snf_units,
    v_pool.original_avg_fat,
    v_pool.original_avg_snf,
    v_pool.remaining_milk_liters,
    v_pool.remaining_fat_units,
    v_pool.remaining_snf_units,
    v_pool.current_avg_fat,
    v_pool.current_avg_snf,
    v_pool.created_at,
    p_user_id,
    jsonb_build_object(
      'usage_history', v_usage_history,
      'collections', v_collections_history,
      'inventory_items', v_inventory_history
    )
  )
  RETURNING id INTO v_archive_id;

  -- Mark old pool as archived
  UPDATE milk_pool SET
    status = 'archived',
    reset_at = now(),
    updated_at = now()
  WHERE id = p_pool_id;

  -- Create new empty active pool
  INSERT INTO milk_pool (
    name,
    total_milk_liters,
    total_fat_units,
    total_snf_units,
    original_avg_fat,
    original_avg_snf,
    remaining_milk_liters,
    remaining_fat_units,
    remaining_snf_units,
    current_avg_fat,
    current_avg_snf,
    status,
    created_by
  ) VALUES (
    'Main Pool',
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    'active',
    p_user_id
  )
  RETURNING id INTO v_new_pool_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Pool reset successfully',
    'archive_id', v_archive_id,
    'new_pool_id', v_new_pool_id,
    'archived_data', jsonb_build_object(
      'total_milk', v_pool.total_milk_liters,
      'remaining_milk', v_pool.remaining_milk_liters,
      'usage_count', jsonb_array_length(v_usage_history),
      'collections_count', jsonb_array_length(v_collections_history)
    )
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Step 7: Function to use milk and create inventory items =====
CREATE OR REPLACE FUNCTION use_milk_create_inventory(
  p_pool_id UUID,
  p_use_liters NUMERIC,
  p_manual_fat_percent NUMERIC,
  p_inventory_items JSONB DEFAULT '[]'::jsonb, -- [{product_id, quantity, unit}]
  p_purpose TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_pool RECORD;
  v_used_fat_units NUMERIC;
  v_remaining_liters NUMERIC;
  v_remaining_fat_units NUMERIC;
  v_new_avg_fat NUMERIC;
  v_usage_id UUID;
  v_item JSONB;
BEGIN
  -- Get current pool
  SELECT * INTO v_pool FROM milk_pool WHERE id = p_pool_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Pool not found');
  END IF;

  -- Validate quantity
  IF p_use_liters > v_pool.remaining_milk_liters THEN
    RETURN json_build_object('success', false, 'error', 'Not enough milk in pool. Available: ' || v_pool.remaining_milk_liters || 'L');
  END IF;

  -- Calculate fat units being used
  v_used_fat_units := p_use_liters * p_manual_fat_percent;
  
  -- Validate fat units available
  IF v_used_fat_units > v_pool.remaining_fat_units THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Not enough fat units. Max fat % possible: ' || ROUND(v_pool.remaining_fat_units / p_use_liters, 2) || '%'
    );
  END IF;

  -- Calculate remaining
  v_remaining_liters := v_pool.remaining_milk_liters - p_use_liters;
  v_remaining_fat_units := v_pool.remaining_fat_units - v_used_fat_units;

  -- Calculate new average fat for remaining milk
  IF v_remaining_liters > 0 THEN
    v_new_avg_fat := v_remaining_fat_units / v_remaining_liters;
  ELSE
    v_new_avg_fat := 0;
  END IF;

  -- Create usage log entry
  INSERT INTO milk_usage_log (
    milk_pool_id, used_liters, manual_fat_percent,
    used_fat_units, remaining_liters_after,
    remaining_fat_units_after, remaining_avg_fat_after,
    purpose, used_by
  ) VALUES (
    p_pool_id, p_use_liters, p_manual_fat_percent,
    v_used_fat_units, v_remaining_liters,
    v_remaining_fat_units, v_new_avg_fat,
    p_purpose, p_user_id
  )
  RETURNING id INTO v_usage_id;

  -- Create inventory items directly from usage
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_inventory_items)
  LOOP
    -- Insert into usage_inventory_items junction
    INSERT INTO usage_inventory_items (usage_id, product_id, quantity, unit)
    VALUES (
      v_usage_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', 'L')
    );

    -- Update or insert into main inventory_items
    INSERT INTO inventory_items (product_id, qty, uom, usage_id, metadata)
    VALUES (
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', 'L'),
      v_usage_id,
      jsonb_build_object('from_milk_pool', p_pool_id, 'fat_percent', p_manual_fat_percent)
    )
    ON CONFLICT (product_id, location_id) WHERE location_id IS NULL
    DO UPDATE SET
      qty = inventory_items.qty + EXCLUDED.qty,
      last_updated = now();
  END LOOP;

  -- Update pool
  UPDATE milk_pool SET
    remaining_milk_liters = v_remaining_liters,
    remaining_fat_units = v_remaining_fat_units,
    current_avg_fat = v_new_avg_fat,
    updated_at = now()
  WHERE id = p_pool_id;

  RETURN json_build_object(
    'success', true,
    'usage_id', v_usage_id,
    'used_liters', p_use_liters,
    'used_fat_percent', p_manual_fat_percent,
    'used_fat_units', v_used_fat_units,
    'remaining_liters', v_remaining_liters,
    'remaining_avg_fat', ROUND(v_new_avg_fat, 3),
    'inventory_items_created', jsonb_array_length(p_inventory_items),
    'message', 'Milk used successfully. ' || jsonb_array_length(p_inventory_items) || ' inventory items created.'
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Step 8: Get archived pools function =====
CREATE OR REPLACE FUNCTION get_archived_pools()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'id', a.id,
        'original_pool_id', a.original_pool_id,
        'pool_name', a.pool_name,
        'total_milk_liters', a.total_milk_liters,
        'original_avg_fat', a.original_avg_fat,
        'remaining_milk_liters', a.remaining_milk_liters,
        'current_avg_fat', a.current_avg_fat,
        'pool_created_at', a.pool_created_at,
        'archived_at', a.archived_at,
        'usage_count', jsonb_array_length(a.snapshot_data->'usage_history'),
        'collections_count', jsonb_array_length(a.snapshot_data->'collections'),
        'snapshot_data', a.snapshot_data
      ) ORDER BY a.archived_at DESC
    ), '[]'::json)
    FROM milk_pool_archive a
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Verification =====
SELECT 'milk_pool_archive table created' AS status;
SELECT 'usage_inventory_items table created' AS status;
SELECT 'Functions created: reset_milk_pool, use_milk_create_inventory, get_archived_pools' AS status;

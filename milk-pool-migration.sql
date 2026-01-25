-- Milk Pool System Migration
-- Dynamic fat adjustment with mass-balance tracking

-- ===== Step 1: Create milk_pool table =====
CREATE TABLE IF NOT EXISTS milk_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Main Pool',
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
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES app_users(id)
);

-- ===== Step 2: Create milk_usage_log table =====
CREATE TABLE IF NOT EXISTS milk_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milk_pool_id UUID NOT NULL REFERENCES milk_pool(id) ON DELETE CASCADE,
  used_liters NUMERIC(12,3) NOT NULL,
  manual_fat_percent NUMERIC(6,3) NOT NULL,
  manual_snf_percent NUMERIC(6,3),
  used_fat_units NUMERIC(14,4) NOT NULL,
  used_snf_units NUMERIC(14,4),
  remaining_liters_after NUMERIC(12,3) NOT NULL,
  remaining_fat_units_after NUMERIC(14,4) NOT NULL,
  remaining_avg_fat_after NUMERIC(6,3) NOT NULL,
  purpose TEXT,
  batch_id UUID REFERENCES batches(id),
  used_at TIMESTAMPTZ DEFAULT now(),
  used_by UUID REFERENCES app_users(id)
);

-- ===== Step 3: Create pool_collections junction table =====
CREATE TABLE IF NOT EXISTS pool_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milk_pool_id UUID NOT NULL REFERENCES milk_pool(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES milk_collections(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(milk_pool_id, collection_id)
);

-- ===== Step 4: Enable RLS =====
ALTER TABLE milk_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY milk_pool_all_authenticated ON milk_pool
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY milk_usage_log_all_authenticated ON milk_usage_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pool_collections_all_authenticated ON pool_collections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Step 5: Function to add collections to pool =====
CREATE OR REPLACE FUNCTION add_collections_to_pool(
  p_pool_id UUID,
  p_collection_ids UUID[],
  p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_total_liters NUMERIC := 0;
  v_total_fat_units NUMERIC := 0;
  v_total_snf_units NUMERIC := 0;
  v_collection RECORD;
  v_pool RECORD;
  v_new_total_liters NUMERIC;
  v_new_fat_units NUMERIC;
  v_new_snf_units NUMERIC;
  v_new_avg_fat NUMERIC;
  v_new_avg_snf NUMERIC;
BEGIN
  -- Get current pool values
  SELECT * INTO v_pool FROM milk_pool WHERE id = p_pool_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Pool not found');
  END IF;

  -- Calculate totals from new collections
  FOR v_collection IN 
    SELECT id, qty_liters, fat, snf 
    FROM milk_collections 
    WHERE id = ANY(p_collection_ids) 
    AND qc_status = 'approved'
    AND status = 'new'
  LOOP
    v_total_liters := v_total_liters + v_collection.qty_liters;
    v_total_fat_units := v_total_fat_units + (v_collection.qty_liters * COALESCE(v_collection.fat, 0));
    v_total_snf_units := v_total_snf_units + (v_collection.qty_liters * COALESCE(v_collection.snf, 0));
    
    -- Mark collection as added to pool
    UPDATE milk_collections SET status = 'in_pool' WHERE id = v_collection.id;
    
    -- Add to junction table
    INSERT INTO pool_collections (milk_pool_id, collection_id)
    VALUES (p_pool_id, v_collection.id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Calculate new totals
  v_new_total_liters := v_pool.total_milk_liters + v_total_liters;
  v_new_fat_units := v_pool.total_fat_units + v_total_fat_units;
  v_new_snf_units := v_pool.total_snf_units + v_total_snf_units;
  
  -- Calculate new averages
  IF v_new_total_liters > 0 THEN
    v_new_avg_fat := v_new_fat_units / v_new_total_liters;
    v_new_avg_snf := v_new_snf_units / v_new_total_liters;
  ELSE
    v_new_avg_fat := 0;
    v_new_avg_snf := 0;
  END IF;

  -- Update pool
  UPDATE milk_pool SET
    total_milk_liters = v_new_total_liters,
    total_fat_units = v_new_fat_units,
    total_snf_units = v_new_snf_units,
    original_avg_fat = v_new_avg_fat,
    original_avg_snf = v_new_avg_snf,
    remaining_milk_liters = v_pool.remaining_milk_liters + v_total_liters,
    remaining_fat_units = v_pool.remaining_fat_units + v_total_fat_units,
    remaining_snf_units = v_pool.remaining_snf_units + v_total_snf_units,
    current_avg_fat = CASE 
      WHEN (v_pool.remaining_milk_liters + v_total_liters) > 0 
      THEN (v_pool.remaining_fat_units + v_total_fat_units) / (v_pool.remaining_milk_liters + v_total_liters)
      ELSE 0 
    END,
    current_avg_snf = CASE 
      WHEN (v_pool.remaining_milk_liters + v_total_liters) > 0 
      THEN (v_pool.remaining_snf_units + v_total_snf_units) / (v_pool.remaining_milk_liters + v_total_liters)
      ELSE 0 
    END,
    updated_at = now()
  WHERE id = p_pool_id;

  RETURN json_build_object(
    'success', true,
    'added_liters', v_total_liters,
    'added_fat_units', v_total_fat_units,
    'new_avg_fat', v_new_avg_fat
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Step 6: Function to use milk from pool =====
CREATE OR REPLACE FUNCTION use_milk_from_pool(
  p_pool_id UUID,
  p_use_liters NUMERIC,
  p_manual_fat_percent NUMERIC,
  p_manual_snf_percent NUMERIC DEFAULT NULL,
  p_purpose TEXT DEFAULT NULL,
  p_batch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_pool RECORD;
  v_used_fat_units NUMERIC;
  v_used_snf_units NUMERIC;
  v_remaining_liters NUMERIC;
  v_remaining_fat_units NUMERIC;
  v_remaining_snf_units NUMERIC;
  v_new_avg_fat NUMERIC;
  v_new_avg_snf NUMERIC;
BEGIN
  -- Get current pool
  SELECT * INTO v_pool FROM milk_pool WHERE id = p_pool_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Pool not found');
  END IF;

  -- Validate quantity
  IF p_use_liters > v_pool.remaining_milk_liters THEN
    RETURN json_build_object('success', false, 'error', 'Not enough milk in pool');
  END IF;

  -- Calculate fat units being used
  v_used_fat_units := p_use_liters * p_manual_fat_percent;
  
  -- Validate fat units available
  IF v_used_fat_units > v_pool.remaining_fat_units THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Not enough fat units. Max fat % possible: ' || ROUND(v_pool.remaining_fat_units / p_use_liters, 2)
    );
  END IF;

  -- Calculate SNF if provided
  IF p_manual_snf_percent IS NOT NULL THEN
    v_used_snf_units := p_use_liters * p_manual_snf_percent;
    IF v_used_snf_units > v_pool.remaining_snf_units THEN
      RETURN json_build_object('success', false, 'error', 'Not enough SNF units');
    END IF;
  ELSE
    v_used_snf_units := p_use_liters * v_pool.current_avg_snf;
  END IF;

  -- Calculate remaining
  v_remaining_liters := v_pool.remaining_milk_liters - p_use_liters;
  v_remaining_fat_units := v_pool.remaining_fat_units - v_used_fat_units;
  v_remaining_snf_units := v_pool.remaining_snf_units - v_used_snf_units;

  -- Calculate new averages for remaining milk
  IF v_remaining_liters > 0 THEN
    v_new_avg_fat := v_remaining_fat_units / v_remaining_liters;
    v_new_avg_snf := v_remaining_snf_units / v_remaining_liters;
  ELSE
    v_new_avg_fat := 0;
    v_new_avg_snf := 0;
  END IF;

  -- Log the usage
  INSERT INTO milk_usage_log (
    milk_pool_id, used_liters, manual_fat_percent, manual_snf_percent,
    used_fat_units, used_snf_units, remaining_liters_after,
    remaining_fat_units_after, remaining_avg_fat_after,
    purpose, batch_id, used_by
  ) VALUES (
    p_pool_id, p_use_liters, p_manual_fat_percent, p_manual_snf_percent,
    v_used_fat_units, v_used_snf_units, v_remaining_liters,
    v_remaining_fat_units, v_new_avg_fat,
    p_purpose, p_batch_id, p_user_id
  );

  -- Update pool
  UPDATE milk_pool SET
    remaining_milk_liters = v_remaining_liters,
    remaining_fat_units = v_remaining_fat_units,
    remaining_snf_units = v_remaining_snf_units,
    current_avg_fat = v_new_avg_fat,
    current_avg_snf = v_new_avg_snf,
    updated_at = now()
  WHERE id = p_pool_id;

  RETURN json_build_object(
    'success', true,
    'used_liters', p_use_liters,
    'used_fat_percent', p_manual_fat_percent,
    'used_fat_units', v_used_fat_units,
    'remaining_liters', v_remaining_liters,
    'remaining_avg_fat', ROUND(v_new_avg_fat, 3),
    'message', 'Milk used successfully. Remaining fat auto-adjusted to ' || ROUND(v_new_avg_fat, 2) || '%'
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Step 7: Create triggers for updated_at =====
CREATE OR REPLACE FUNCTION update_milk_pool_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milk_pool_updated_at ON milk_pool;
CREATE TRIGGER milk_pool_updated_at
  BEFORE UPDATE ON milk_pool
  FOR EACH ROW
  EXECUTE FUNCTION update_milk_pool_updated_at();

-- ===== Step 8: Create default pool =====
INSERT INTO milk_pool (name, status) 
VALUES ('Main Pool', 'active')
ON CONFLICT DO NOTHING;

-- ===== Verification =====
SELECT 'milk_pool table created' AS status;
SELECT 'milk_usage_log table created' AS status;
SELECT 'Functions created: add_collections_to_pool, use_milk_from_pool' AS status;

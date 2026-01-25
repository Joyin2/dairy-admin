-- Fix RLS for milk_collections insert
-- Allow authenticated users to insert milk collections

DROP POLICY IF EXISTS milk_collections_insert ON milk_collections;

CREATE POLICY milk_collections_insert ON milk_collections
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also allow authenticated users to update (for QC approval)
DROP POLICY IF EXISTS milk_collections_update ON milk_collections;

CREATE POLICY milk_collections_update ON milk_collections
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to select all
DROP POLICY IF EXISTS milk_collections_select ON milk_collections;

CREATE POLICY milk_collections_select ON milk_collections
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to delete
DROP POLICY IF EXISTS milk_collections_delete ON milk_collections;

CREATE POLICY milk_collections_delete ON milk_collections
  FOR DELETE
  TO authenticated
  USING (true);

-- ===== inventory_items RLS =====
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_items_all ON inventory_items;

CREATE POLICY inventory_items_all ON inventory_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ===== Fix audit_logs foreign key issue =====
-- Option 1: Make user_id nullable in audit_logs
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;

-- Option 2: Fix the trigger function to handle null gracefully
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid;
BEGIN
  -- Try to get user from JWT, default to NULL if not available
  BEGIN
    v_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, meta, created_at)
  VALUES (
    v_user,
    TG_OP || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    row_to_json(COALESCE(NEW, OLD))::jsonb,
    now()
  );
  RETURN NEW;
END;
$$;

-- Drop foreign key constraint on audit_logs.user_id to allow any user_id
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- ===== batches RLS =====
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batches_all ON batches;

CREATE POLICY batches_all ON batches
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ===== suppliers RLS =====
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_all ON suppliers;

CREATE POLICY suppliers_all ON suppliers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ===== shops RLS =====
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shops_all ON shops;

CREATE POLICY shops_all ON shops
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ===== products RLS =====
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_all ON products;

CREATE POLICY products_all ON products
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Remove all batch-related database objects (safe execution)

-- Drop all batch-related triggers
DROP TRIGGER IF EXISTS trigger_update_inventory_from_usage_log ON milk_usage_log;
DROP TRIGGER IF EXISTS trigger_update_batch_from_usage_log ON milk_usage_log;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_audit_batches ON batches;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop functions (with all possible signatures)
DROP FUNCTION IF EXISTS create_production_batch(UUID, NUMERIC, NUMERIC, JSONB, TEXT, DATE, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS create_batch(UUID, UUID[], UUID, NUMERIC, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_inventory_from_usage_log() CASCADE;

-- Drop views
DROP VIEW IF EXISTS batch_details CASCADE;

-- Drop indexes (safe - ignore if not exist)
DO $$ BEGIN
  DROP INDEX IF EXISTS idx_batch_outputs_batch_id;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP INDEX IF EXISTS idx_batch_outputs_product_id;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP INDEX IF EXISTS idx_batches_milk_pool_id;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop policies (safe - ignore if table doesn't exist)
DO $$ BEGIN
  DROP POLICY IF EXISTS batch_outputs_all_authenticated ON batch_outputs;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS batches_all ON batches;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Remove foreign key constraints that reference batches
DO $$ BEGIN
  ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_batch_id_fkey;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE milk_usage_log DROP CONSTRAINT IF EXISTS milk_usage_log_batch_id_fkey;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Drop batch_id columns with CASCADE
ALTER TABLE inventory_items DROP COLUMN IF EXISTS batch_id CASCADE;
ALTER TABLE milk_usage_log DROP COLUMN IF EXISTS batch_id CASCADE;

-- Drop tables (safe cascade)
DROP TABLE IF EXISTS batch_outputs CASCADE;
DROP TABLE IF EXISTS batches CASCADE;

-- Recreate the trigger for milk pool without batch reference
CREATE OR REPLACE FUNCTION update_inventory_from_usage_log()
RETURNS TRIGGER AS $$
DECLARE
  v_inventory RECORD;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT * INTO v_inventory 
    FROM inventory_items 
    WHERE product_id = NEW.product_id 
    ORDER BY last_updated DESC 
    LIMIT 1;
    
    IF FOUND THEN
      UPDATE inventory_items SET
        qty = qty + NEW.used_liters,
        fat_percent = NEW.manual_fat_percent,
        last_updated = NOW()
      WHERE id = v_inventory.id;
    ELSE
      INSERT INTO inventory_items (product_id, qty, uom, fat_percent, last_updated, created_at)
      VALUES (NEW.product_id, NEW.used_liters, 'liter', NEW.manual_fat_percent, NOW(), NOW());
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_from_usage_log
  AFTER INSERT OR UPDATE ON milk_usage_log
  FOR EACH ROW
  WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION update_inventory_from_usage_log();

SELECT 'Batch system removed successfully' AS status;

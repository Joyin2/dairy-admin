-- Verify and fix inventory auto-update from usage log

-- Check if product_id column exists in milk_usage_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'milk_usage_log' 
    AND column_name = 'product_id'
  ) THEN
    ALTER TABLE milk_usage_log ADD COLUMN product_id UUID REFERENCES products(id);
    RAISE NOTICE 'Added product_id column to milk_usage_log';
  END IF;
END $$;

-- Drop existing trigger and function to recreate cleanly
DROP TRIGGER IF EXISTS trigger_update_inventory_from_usage_log ON milk_usage_log;
DROP FUNCTION IF EXISTS update_inventory_from_usage_log() CASCADE;

-- Recreate the function
CREATE OR REPLACE FUNCTION update_inventory_from_usage_log()
RETURNS TRIGGER AS $$
DECLARE
  v_inventory RECORD;
BEGIN
  -- Only process if there's a product_id associated with the usage log
  IF NEW.product_id IS NOT NULL THEN
    -- Check if inventory item exists for this product
    SELECT * INTO v_inventory 
    FROM inventory_items 
    WHERE product_id = NEW.product_id 
    ORDER BY last_updated DESC 
    LIMIT 1;
    
    IF FOUND THEN
      -- Update existing inventory
      UPDATE inventory_items SET
        qty = qty + NEW.used_liters,
        fat_percent = NEW.manual_fat_percent,
        last_updated = NOW()
      WHERE id = v_inventory.id;
      
      RAISE NOTICE 'Updated inventory item % with % liters', v_inventory.id, NEW.used_liters;
    ELSE
      -- Create new inventory item
      INSERT INTO inventory_items (product_id, qty, uom, fat_percent, last_updated, created_at)
      VALUES (NEW.product_id, NEW.used_liters, 'liter', NEW.manual_fat_percent, NOW(), NOW());
      
      RAISE NOTICE 'Created new inventory item for product % with % liters', NEW.product_id, NEW.used_liters;
    END IF;
  ELSE
    RAISE NOTICE 'Skipped inventory update - no product_id in usage log entry';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trigger_update_inventory_from_usage_log
  AFTER INSERT OR UPDATE ON milk_usage_log
  FOR EACH ROW
  WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION update_inventory_from_usage_log();

-- Verify setup
SELECT 'Inventory auto-update trigger recreated successfully' AS status;

-- Show existing usage log entries without product_id
SELECT 
  id,
  used_liters,
  manual_fat_percent,
  purpose,
  product_id,
  used_at
FROM milk_usage_log
ORDER BY used_at DESC
LIMIT 10;

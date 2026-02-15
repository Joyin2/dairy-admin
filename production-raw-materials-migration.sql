-- Production Table (Parent Entry)
CREATE TABLE IF NOT EXISTS production (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_code VARCHAR(50) UNIQUE NOT NULL,
  milk_pool_id UUID REFERENCES milk_pool(id),
  milk_usage_log_id UUID REFERENCES milk_usage_log(id),
  milk_used_liters NUMERIC(10,3) NOT NULL,
  milk_used_fat_percent NUMERIC(5,2),
  milk_used_snf_percent NUMERIC(5,2),
  milk_used_fat_units NUMERIC(10,4),
  milk_used_snf_units NUMERIC(10,4),
  notes TEXT,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'completed', 'cancelled'))
);

-- Raw Materials Master Table
CREATE TABLE IF NOT EXISTS raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  category VARCHAR(100),
  unit VARCHAR(50) NOT NULL,
  current_stock NUMERIC(10,3) DEFAULT 0,
  min_stock_level NUMERIC(10,3) DEFAULT 0,
  cost_per_unit NUMERIC(10,2),
  supplier_info JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Raw Materials (Consumption Record)
CREATE TABLE IF NOT EXISTS production_raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES raw_materials(id),
  quantity_used NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  cost_per_unit NUMERIC(10,2),
  total_cost NUMERIC(12,2),
  consumed_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_by UUID REFERENCES app_users(id)
);

-- Production Inventory (Final Output)
CREATE TABLE IF NOT EXISTS production_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  cost_per_unit NUMERIC(10,2),
  total_cost NUMERIC(12,2),
  batch_number VARCHAR(100),
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to update raw material stock on consumption
CREATE OR REPLACE FUNCTION update_raw_material_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE raw_materials
    SET current_stock = current_stock - NEW.quantity_used,
        updated_at = NOW()
    WHERE id = NEW.material_id;
    
    -- Check if stock went negative
    IF (SELECT current_stock FROM raw_materials WHERE id = NEW.material_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for material. Available: %, Required: %',
        (SELECT current_stock + NEW.quantity_used FROM raw_materials WHERE id = NEW.material_id),
        NEW.quantity_used;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Restore stock on deletion (undo consumption)
    UPDATE raw_materials
    SET current_stock = current_stock + OLD.quantity_used,
        updated_at = NOW()
    WHERE id = OLD.material_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_raw_material_stock ON production_raw_materials;
CREATE TRIGGER trigger_update_raw_material_stock
  AFTER INSERT OR DELETE ON production_raw_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_raw_material_stock();

-- Function to generate production code
CREATE OR REPLACE FUNCTION generate_production_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(production_code FROM 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM production
  WHERE production_code ~ '^P-[0-9]+$';
  
  code := 'P-' || LPAD(next_num::TEXT, 4, '0');
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_production_status ON production(status);
CREATE INDEX IF NOT EXISTS idx_production_created_at ON production(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_raw_materials_production ON production_raw_materials(production_id);
CREATE INDEX IF NOT EXISTS idx_production_raw_materials_material ON production_raw_materials(material_id);
CREATE INDEX IF NOT EXISTS idx_production_inventory_production ON production_inventory(production_id);
CREATE INDEX IF NOT EXISTS idx_production_inventory_product ON production_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_active ON raw_materials(is_active);

NOTIFY pgrst, 'reload schema';

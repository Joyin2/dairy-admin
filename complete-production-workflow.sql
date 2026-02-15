-- Complete Production Workflow Schema
-- Flow: Milk Pool → Milk Usage → Raw Materials → Processing → Final Product → Packaging → Inventory

-- ==================== MILK POOL (Already exists, ensure SNF support) ====================
ALTER TABLE milk_pool ADD COLUMN IF NOT EXISTS total_snf_units NUMERIC(14,4) DEFAULT 0;
ALTER TABLE milk_pool ADD COLUMN IF NOT EXISTS original_avg_snf NUMERIC(6,3) DEFAULT 0;
ALTER TABLE milk_pool ADD COLUMN IF NOT EXISTS remaining_snf_units NUMERIC(14,4) DEFAULT 0;
ALTER TABLE milk_pool ADD COLUMN IF NOT EXISTS current_avg_snf NUMERIC(6,3) DEFAULT 0;

-- ==================== MILK USAGE (Already exists, ensure SNF support) ====================
ALTER TABLE milk_usage_log ADD COLUMN IF NOT EXISTS manual_snf_percent NUMERIC(5,2);
ALTER TABLE milk_usage_log ADD COLUMN IF NOT EXISTS used_snf_units NUMERIC(10,4);
ALTER TABLE milk_usage_log ADD COLUMN IF NOT EXISTS remaining_avg_snf_after NUMERIC(6,3);
ALTER TABLE milk_usage_log ADD COLUMN IF NOT EXISTS production_id UUID REFERENCES production(id);

-- ==================== RAW MATERIALS ====================

-- Raw Materials Master
CREATE TABLE IF NOT EXISTS raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  category VARCHAR(100),
  default_unit VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id)
);

-- Raw Material Purchases (Track incoming stock)
CREATE TABLE IF NOT EXISTS raw_material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES raw_materials(id),
  quantity NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  rate_per_unit NUMERIC(10,2),
  total_amount NUMERIC(12,2),
  supplier VARCHAR(255),
  invoice_number VARCHAR(100),
  purchase_date DATE DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw Material Stock (Current stock levels)
CREATE TABLE IF NOT EXISTS raw_material_stock (
  material_id UUID PRIMARY KEY REFERENCES raw_materials(id),
  current_stock NUMERIC(10,3) DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== PRODUCTION (Parent Record) ====================
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
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Production Raw Materials (Consumption before processing)
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

-- ==================== PROCESSING BATCHES ====================
CREATE TABLE IF NOT EXISTS processing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL REFERENCES production(id),
  batch_number VARCHAR(100) UNIQUE NOT NULL,
  product_type VARCHAR(255) NOT NULL,
  input_milk_liters NUMERIC(10,3) NOT NULL,
  input_fat_percent NUMERIC(5,2),
  input_snf_percent NUMERIC(5,2),
  final_fat_percent NUMERIC(5,2),
  final_snf_percent NUMERIC(5,2),
  temperature VARCHAR(50),
  processing_time VARCHAR(50),
  culture_details TEXT,
  extra_parameters JSONB,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id)
);

-- ==================== FINAL PRODUCTS (QC Stage) ====================
CREATE TABLE IF NOT EXISTS final_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_batch_id UUID NOT NULL REFERENCES processing_batches(id),
  batch_number VARCHAR(100) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  bulk_quantity NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  qc_status VARCHAR(20) DEFAULT 'pending' CHECK (qc_status IN ('pending', 'approved', 'rejected')),
  qc_checked_by UUID REFERENCES app_users(id),
  qc_checked_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== PACKAGING ====================
CREATE TABLE IF NOT EXISTS packaging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  final_product_id UUID NOT NULL REFERENCES final_products(id),
  batch_number VARCHAR(100) NOT NULL,
  packaging_type VARCHAR(100) NOT NULL,
  package_size VARCHAR(50) NOT NULL,
  number_of_packages INTEGER NOT NULL,
  unit VARCHAR(50) NOT NULL,
  packaged_quantity_total NUMERIC(10,3) NOT NULL,
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'partial', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id)
);

-- ==================== INVENTORY (Final Output) ====================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packaging_id UUID REFERENCES packaging(id),
  batch_number VARCHAR(100) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  packaging_type VARCHAR(100) NOT NULL,
  package_size VARCHAR(50) NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  expiry_date DATE,
  location VARCHAR(255),
  current_stock NUMERIC(10,3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== TRIGGERS ====================

-- Trigger: Update raw material stock on purchase
CREATE OR REPLACE FUNCTION update_stock_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO raw_material_stock (material_id, current_stock, unit, last_updated)
  VALUES (NEW.material_id, NEW.quantity, NEW.unit, NOW())
  ON CONFLICT (material_id) 
  DO UPDATE SET 
    current_stock = raw_material_stock.current_stock + NEW.quantity,
    last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_stock_on_purchase ON raw_material_purchases;
CREATE TRIGGER trigger_update_stock_on_purchase
  AFTER INSERT ON raw_material_purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_on_purchase();

-- Trigger: Deduct raw material stock on consumption
CREATE OR REPLACE FUNCTION deduct_raw_material_stock()
RETURNS TRIGGER AS $$
DECLARE
  available_stock NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Check available stock
    SELECT current_stock INTO available_stock
    FROM raw_material_stock
    WHERE material_id = NEW.material_id;
    
    IF available_stock IS NULL THEN
      RAISE EXCEPTION 'No stock record found for material ID %', NEW.material_id;
    END IF;
    
    IF available_stock < NEW.quantity_used THEN
      RAISE EXCEPTION 'Insufficient stock for material. Available: %, Required: %', available_stock, NEW.quantity_used;
    END IF;
    
    -- Deduct stock
    UPDATE raw_material_stock
    SET current_stock = current_stock - NEW.quantity_used,
        last_updated = NOW()
    WHERE material_id = NEW.material_id;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Restore stock on deletion
    UPDATE raw_material_stock
    SET current_stock = current_stock + OLD.quantity_used,
        last_updated = NOW()
    WHERE material_id = OLD.material_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_deduct_raw_material_stock ON production_raw_materials;
CREATE TRIGGER trigger_deduct_raw_material_stock
  AFTER INSERT OR DELETE ON production_raw_materials
  FOR EACH ROW
  EXECUTE FUNCTION deduct_raw_material_stock();

-- Trigger: Create inventory from packaging
CREATE OR REPLACE FUNCTION create_inventory_from_packaging()
RETURNS TRIGGER AS $$
DECLARE
  v_final_product RECORD;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Get final product details
    SELECT fp.product_name, fp.batch_number
    INTO v_final_product
    FROM final_products fp
    WHERE fp.id = NEW.final_product_id;
    
    -- Insert into inventory
    INSERT INTO inventory (
      packaging_id,
      batch_number,
      product_name,
      packaging_type,
      package_size,
      quantity,
      unit,
      current_stock,
      created_at
    ) VALUES (
      NEW.id,
      NEW.batch_number,
      v_final_product.product_name,
      NEW.packaging_type,
      NEW.package_size,
      NEW.number_of_packages,
      NEW.unit,
      NEW.number_of_packages,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_inventory_from_packaging ON packaging;
CREATE TRIGGER trigger_create_inventory_from_packaging
  AFTER UPDATE ON packaging
  FOR EACH ROW
  EXECUTE FUNCTION create_inventory_from_packaging();

-- ==================== HELPER FUNCTIONS ====================

-- Generate production code
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

-- Generate batch number
CREATE OR REPLACE FUNCTION generate_batch_number(product_prefix TEXT)
RETURNS TEXT AS $$
DECLARE
  batch_num TEXT;
  year_str TEXT;
  seq_num INTEGER;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(batch_number FROM LENGTH(product_prefix || '-' || year_str || '-') + 1) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM processing_batches
  WHERE batch_number ~ ('^' || product_prefix || '-' || year_str || '-[0-9]+$');
  
  batch_num := product_prefix || '-' || year_str || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN batch_num;
END;
$$ LANGUAGE plpgsql;

-- ==================== INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_production_status ON production(status);
CREATE INDEX IF NOT EXISTS idx_production_created_at ON production(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_milk_usage ON production(milk_usage_log_id);
CREATE INDEX IF NOT EXISTS idx_production_raw_materials_production ON production_raw_materials(production_id);
CREATE INDEX IF NOT EXISTS idx_production_raw_materials_material ON production_raw_materials(material_id);
CREATE INDEX IF NOT EXISTS idx_processing_batches_production ON processing_batches(production_id);
CREATE INDEX IF NOT EXISTS idx_processing_batches_batch_number ON processing_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_processing_batches_status ON processing_batches(status);
CREATE INDEX IF NOT EXISTS idx_final_products_batch ON final_products(processing_batch_id);
CREATE INDEX IF NOT EXISTS idx_final_products_qc_status ON final_products(qc_status);
CREATE INDEX IF NOT EXISTS idx_packaging_final_product ON packaging(final_product_id);
CREATE INDEX IF NOT EXISTS idx_packaging_batch_number ON packaging(batch_number);
CREATE INDEX IF NOT EXISTS idx_inventory_batch_number ON inventory(batch_number);
CREATE INDEX IF NOT EXISTS idx_inventory_product_name ON inventory(product_name);
CREATE INDEX IF NOT EXISTS idx_raw_material_purchases_material ON raw_material_purchases(material_id);

NOTIFY pgrst, 'reload schema';

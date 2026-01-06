-- ===== DAIRY MANAGEMENT SYSTEM - DATABASE SCHEMA =====
-- Run this in Supabase SQL Editor
-- Project: pyrkflpatgtaaisbkfzb

-- ===== Extensions =====
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ===== Type enums =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_type') THEN
    CREATE TYPE role_type AS ENUM ('company_admin','manufacturer','delivery_agent');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_qc') THEN
    CREATE TYPE collection_qc AS ENUM ('pending','approved','rejected');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE delivery_status AS ENUM ('pending','in_transit','delivered','partial','returned','failed');
  END IF;
END$$;

-- ===== Core tables =====

-- Users table
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid uuid UNIQUE,
  email text,
  phone text,
  name text,
  role role_type NOT NULL DEFAULT 'manufacturer',
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  last_login timestamptz
);

-- Suppliers (farmers)
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  bank_account jsonb,
  kyc_status text DEFAULT 'pending',
  auto_receipt_pref boolean DEFAULT true,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now()
);

-- Shops / Retailers
CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text,
  address text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Products / SKUs
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE,
  name text NOT NULL,
  uom text DEFAULT 'liter',
  shelf_life_days int,
  created_at timestamptz DEFAULT now()
);

-- Milk collections
CREATE TABLE IF NOT EXISTS milk_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  operator_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  qty_liters numeric(10,3) NOT NULL CHECK (qty_liters >= 0),
  fat numeric(5,2),
  snf numeric(5,2),
  gps geometry(Point,4326),
  photo_url text,
  qc_status collection_qc DEFAULT 'pending',
  status text DEFAULT 'new',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Batches (production)
CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text UNIQUE,
  production_date timestamptz DEFAULT now(),
  input_collection_ids uuid[] DEFAULT ARRAY[]::uuid[],
  product_id uuid REFERENCES products(id),
  yield_qty numeric(12,3) NOT NULL CHECK (yield_qty >= 0),
  expiry_date date,
  qc_status collection_qc DEFAULT 'pending',
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now()
);

-- Inventory items
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES batches(id) ON DELETE SET NULL,
  location_id uuid,
  qty numeric(12,3) NOT NULL CHECK (qty >= 0),
  uom text DEFAULT 'liter',
  metadata jsonb DEFAULT '{}'::jsonb,
  last_updated timestamptz DEFAULT now()
);

-- Routes
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  agent_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  date date,
  stops jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES routes(id) ON DELETE CASCADE,
  shop_id uuid REFERENCES shops(id),
  items jsonb DEFAULT '[]'::jsonb,
  status delivery_status DEFAULT 'pending',
  expected_qty numeric(12,3),
  delivered_qty numeric(12,3),
  proof_url text,
  signature_url text,
  collected_amount numeric(14,2) DEFAULT 0,
  payment_mode text,
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz
);

-- Ledger / Payments
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account text,
  to_account text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  mode text,
  reference text,
  receipt_url text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now(),
  cleared boolean DEFAULT false
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "to" text,
  channel text,
  status text DEFAULT 'pending',
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  sent_at timestamptz
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id),
  action_type text,
  entity_type text,
  entity_id uuid,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_milk_collections_supplier_ts ON milk_collections (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_milk_collections_qc_status ON milk_collections (qc_status);
CREATE INDEX IF NOT EXISTS idx_batches_production_date ON batches (production_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_product_location ON inventory_items (product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_route_status ON deliveries (route_id, status);
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_shops_name_trgm ON shops USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_milk_collections_gps ON milk_collections USING GIST (gps);

-- ===== Row Level Security =====
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY app_users_select_company_admin ON app_users
  FOR SELECT USING ( 
    (auth.jwt()->>'role')::text = 'company_admin' OR 
    auth.uid()::text = auth_uid::text 
  );

CREATE POLICY app_users_update_self ON app_users
  FOR UPDATE USING ( auth.uid()::text = auth_uid::text );

CREATE POLICY milk_collections_insert ON milk_collections
  FOR INSERT WITH CHECK ( 
    (auth.jwt()->>'role')::text IN ('company_admin','manufacturer') 
  );

CREATE POLICY milk_collections_select ON milk_collections
  FOR SELECT USING (
    (auth.jwt()->>'role')::text = 'company_admin'
    OR ((auth.jwt()->>'role')::text = 'manufacturer' AND operator_user_id::text = auth.uid()::text)
  );

CREATE POLICY milk_collections_update_for_admin ON milk_collections
  FOR UPDATE USING ( (auth.jwt()->>'role')::text = 'company_admin' );

CREATE POLICY batches_insert ON batches
  FOR INSERT WITH CHECK ( 
    (auth.jwt()->>'role')::text IN ('company_admin','manufacturer') 
  );

CREATE POLICY batches_select ON batches
  FOR SELECT USING (
    (auth.jwt()->>'role')::text = 'company_admin'
    OR ((auth.jwt()->>'role')::text = 'manufacturer' AND created_by::text = auth.uid()::text)
  );

CREATE POLICY routes_select_agent ON routes
  FOR SELECT USING (
    (auth.jwt()->>'role')::text = 'company_admin'
    OR ((auth.jwt()->>'role')::text = 'delivery_agent' AND agent_id::text = auth.uid()::text)
  );

CREATE POLICY routes_insert_admin ON routes
  FOR INSERT WITH CHECK ( (auth.jwt()->>'role')::text = 'company_admin' );

CREATE POLICY deliveries_select ON deliveries
  FOR SELECT USING (
    (auth.jwt()->>'role')::text = 'company_admin'
    OR ((auth.jwt()->>'role')::text = 'delivery_agent' AND route_id IN (SELECT id FROM routes WHERE agent_id::text = auth.uid()::text))
  );

CREATE POLICY deliveries_update_agent ON deliveries
  FOR UPDATE USING (
    (auth.jwt()->>'role')::text = 'company_admin'
    OR ((auth.jwt()->>'role')::text = 'delivery_agent' AND route_id IN (SELECT id FROM routes WHERE agent_id::text = auth.uid()::text))
  );

CREATE POLICY ledger_entries_select ON ledger_entries
  FOR SELECT USING (
    (auth.jwt()->>'role')::text = 'company_admin'
    OR (created_by::text = auth.uid()::text)
  );

CREATE POLICY ledger_entries_insert ON ledger_entries
  FOR INSERT WITH CHECK ( 
    (auth.jwt()->>'role')::text IN ('company_admin','delivery_agent') 
  );

CREATE POLICY audit_logs_select_admin ON audit_logs
  FOR SELECT USING ( (auth.jwt()->>'role')::text = 'company_admin' );

-- ===== Trigger functions =====
CREATE OR REPLACE FUNCTION fn_create_ledger_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'delivered') OR (TG_OP = 'INSERT' AND NEW.status = 'delivered') THEN
    IF COALESCE(NEW.collected_amount,0) > 0 THEN
      INSERT INTO ledger_entries (from_account, to_account, amount, mode, reference, receipt_url, created_by, created_at)
      VALUES (
        (SELECT name FROM shops WHERE id = NEW.shop_id),
        'company_cash',
        NEW.collected_amount,
        NEW.payment_mode,
        NEW.id::text,
        NEW.proof_url,
        auth.uid(),
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_create_ledger ON deliveries;
CREATE TRIGGER trg_delivery_create_ledger
AFTER INSERT OR UPDATE ON deliveries
FOR EACH ROW
EXECUTE FUNCTION fn_create_ledger_on_delivery();

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid;
BEGIN
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

DROP TRIGGER IF EXISTS trg_audit_collections ON milk_collections;
CREATE TRIGGER trg_audit_collections
AFTER INSERT OR UPDATE OR DELETE ON milk_collections
FOR EACH ROW
EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_batches ON batches;
CREATE TRIGGER trg_audit_batches
AFTER INSERT OR UPDATE OR DELETE ON batches
FOR EACH ROW
EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_deliveries ON deliveries;
CREATE TRIGGER trg_audit_deliveries
AFTER INSERT OR UPDATE OR DELETE ON deliveries
FOR EACH ROW
EXECUTE FUNCTION fn_audit_log();

-- ===== Stored procedure: atomic batch creation =====
CREATE OR REPLACE FUNCTION create_batch(
  p_created_by uuid,
  p_input_collection_ids uuid[],
  p_product_id uuid,
  p_yield_qty numeric,
  p_expiry_date date,
  p_batch_code text DEFAULT NULL
)
RETURNS TABLE(batch_id uuid) AS
$$
DECLARE
  v_batch_id uuid;
  v_conflicts int;
  v_generated_batch_code text;
BEGIN
  IF p_yield_qty < 0 THEN
    RAISE EXCEPTION 'yield must be non-negative';
  END IF;

  IF array_length(p_input_collection_ids,1) IS NULL THEN
    RAISE EXCEPTION 'input collections required';
  END IF;

  SELECT COUNT(*) INTO v_conflicts
  FROM milk_collections mc
  WHERE mc.id = ANY(p_input_collection_ids) AND mc.status <> 'new';

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'one or more collections are already used or not in new state';
  END IF;

  IF p_batch_code IS NULL THEN
    v_generated_batch_code := 'BATCH-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text,1,6);
  ELSE
    v_generated_batch_code := p_batch_code;
  END IF;

  PERFORM pg_advisory_xact_lock( (hashtext(v_generated_batch_code))::bigint );

  INSERT INTO batches (batch_code, production_date, input_collection_ids, product_id, yield_qty, expiry_date, qc_status, created_by, created_at)
  VALUES (v_generated_batch_code, now(), p_input_collection_ids, p_product_id, p_yield_qty, p_expiry_date, 'pending', p_created_by, now())
  RETURNING id INTO v_batch_id;

  UPDATE milk_collections
  SET status = 'used_in_batch'
  WHERE id = ANY(p_input_collection_ids);

  INSERT INTO inventory_items (product_id, batch_id, location_id, qty, uom, metadata, last_updated)
  VALUES (p_product_id, v_batch_id, NULL, p_yield_qty, 'liter', jsonb_build_object('created_by', p_created_by::text, 'input_collections', p_input_collection_ids), now());

  INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, meta, created_at)
  VALUES (p_created_by, 'create_batch', 'batches', v_batch_id, jsonb_build_object('input_collections', p_input_collection_ids, 'yield_qty', p_yield_qty), now());

  RETURN QUERY SELECT v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_batch(uuid, uuid[], uuid, numeric, date, text) TO authenticated;

-- ===== Materialized view =====
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_collections AS
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS total_collections,
  sum(qty_liters) AS total_liters,
  avg(fat) AS avg_fat
FROM milk_collections
GROUP BY date_trunc('day', created_at)
WITH NO DATA;

CREATE OR REPLACE FUNCTION refresh_mv_daily_collections()
RETURNS void LANGUAGE sql AS $$
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_collections;
$$;

-- ===== Enable Realtime for key tables =====
-- Run these ALTER statements to enable realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE milk_collections;
ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE batches;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;

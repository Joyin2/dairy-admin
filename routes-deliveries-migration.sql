-- Routes & Deliveries Schema Migration
-- Run this in your Supabase SQL Editor

-- ===== Ensure routes table exists with proper structure =====
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  agent_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  date date NOT NULL,
  stops jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for routes
CREATE INDEX IF NOT EXISTS idx_routes_agent_date ON routes (agent_id, date);
CREATE INDEX IF NOT EXISTS idx_routes_date ON routes (date DESC);

-- ===== Ensure deliveries table exists with proper structure =====
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES routes(id) ON DELETE CASCADE,
  shop_id uuid REFERENCES shops(id) ON DELETE SET NULL,
  items jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending',
  expected_qty numeric(12,3),
  delivered_qty numeric(12,3),
  proof_url text,
  signature_url text,
  collected_amount numeric(14,2) DEFAULT 0,
  payment_mode text DEFAULT 'cash',
  notes text,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for deliveries
CREATE INDEX IF NOT EXISTS idx_deliveries_route ON deliveries (route_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_shop ON deliveries (shop_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries (status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries (created_at DESC);

-- ===== Enable RLS on routes and deliveries =====
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- ===== RLS Policies for routes =====

-- Allow authenticated users to view routes
DROP POLICY IF EXISTS routes_select_authenticated ON routes;
CREATE POLICY routes_select_authenticated ON routes
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert routes
DROP POLICY IF EXISTS routes_insert_authenticated ON routes;
CREATE POLICY routes_insert_authenticated ON routes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update routes
DROP POLICY IF EXISTS routes_update_authenticated ON routes;
CREATE POLICY routes_update_authenticated ON routes
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete routes
DROP POLICY IF EXISTS routes_delete_authenticated ON routes;
CREATE POLICY routes_delete_authenticated ON routes
  FOR DELETE
  TO authenticated
  USING (true);

-- ===== RLS Policies for deliveries =====

-- Allow authenticated users to view deliveries
DROP POLICY IF EXISTS deliveries_select_authenticated ON deliveries;
CREATE POLICY deliveries_select_authenticated ON deliveries
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert deliveries
DROP POLICY IF EXISTS deliveries_insert_authenticated ON deliveries;
CREATE POLICY deliveries_insert_authenticated ON deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update deliveries
DROP POLICY IF EXISTS deliveries_update_authenticated ON deliveries;
CREATE POLICY deliveries_update_authenticated ON deliveries
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete deliveries
DROP POLICY IF EXISTS deliveries_delete_authenticated ON deliveries;
CREATE POLICY deliveries_delete_authenticated ON deliveries
  FOR DELETE
  TO authenticated
  USING (true);

-- ===== Update trigger for timestamps =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS routes_updated_at ON routes;
CREATE TRIGGER routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS deliveries_updated_at ON deliveries;
CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===== Enable Realtime for routes and deliveries =====
-- Note: Run these in Supabase dashboard under Database > Replication if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE routes;
-- ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;

-- ===== Verify tables =====
SELECT 'Routes table created' AS status, count(*) AS existing_rows FROM routes
UNION ALL
SELECT 'Deliveries table created' AS status, count(*) AS existing_rows FROM deliveries;

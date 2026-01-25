-- Fix RLS policies for routes and deliveries
-- Run this in Supabase SQL Editor

-- Drop existing policies
DROP POLICY IF EXISTS routes_select_authenticated ON routes;
DROP POLICY IF EXISTS routes_insert_authenticated ON routes;
DROP POLICY IF EXISTS routes_update_authenticated ON routes;
DROP POLICY IF EXISTS routes_delete_authenticated ON routes;

-- Create permissive policies for routes
CREATE POLICY "Allow all for authenticated users" ON routes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Drop existing delivery policies
DROP POLICY IF EXISTS deliveries_select_authenticated ON deliveries;
DROP POLICY IF EXISTS deliveries_insert_authenticated ON deliveries;
DROP POLICY IF EXISTS deliveries_update_authenticated ON deliveries;
DROP POLICY IF EXISTS deliveries_delete_authenticated ON deliveries;

-- Create permissive policies for deliveries
CREATE POLICY "Allow all for authenticated users" ON deliveries
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify RLS is enabled but policies allow access
SELECT tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename IN ('routes', 'deliveries');

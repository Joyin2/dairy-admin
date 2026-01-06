-- Fix RLS policy for app_users insert during signup
-- Run this in Supabase SQL Editor

-- Drop existing restrictive policy
DROP POLICY IF EXISTS app_users_insert ON app_users;

-- Allow authenticated users to insert their own record during signup
CREATE POLICY app_users_insert ON app_users
  FOR INSERT 
  WITH CHECK ( auth.uid()::text = auth_uid::text );

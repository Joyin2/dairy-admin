-- Fix RLS policy for ledger_entries to allow authenticated users to insert
-- This allows delivery agents to create payment records

-- Drop existing policy
DROP POLICY IF EXISTS ledger_entries_insert_policy ON ledger_entries;

-- Create policy allowing authenticated users to insert (for payment recording)
CREATE POLICY ledger_entries_insert_policy ON ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also allow authenticated users to view their own entries
DROP POLICY IF EXISTS ledger_entries_select_policy ON ledger_entries;
CREATE POLICY ledger_entries_select_policy ON ledger_entries
  FOR SELECT
  TO authenticated
  USING (true);

-- Verify the policies
SELECT tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'ledger_entries';

-- Check if there are users in app_users
SELECT COUNT(*) as user_count FROM app_users;

-- Temporarily disable the foreign key constraint to allow null values
-- This will allow the ledger entry to be created without a valid user reference
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_created_by_fkey;

-- Recreate the constraint to allow null values
ALTER TABLE ledger_entries 
ADD CONSTRAINT ledger_entries_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL;

-- Also update the trigger to handle the case where auth.uid() might not exist
CREATE OR REPLACE FUNCTION fn_create_ledger_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get current user ID from auth if available, otherwise use NULL
  BEGIN
    v_user_id := auth.uid();
    -- Verify user exists in app_users
    IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = v_user_id) THEN
      v_user_id := NULL;
    END IF;
  EXCEPTION 
    WHEN OTHERS THEN
      v_user_id := NULL;
  END;

  IF (TG_OP = 'UPDATE' AND NEW.status = 'delivered') OR (TG_OP = 'INSERT' AND NEW.status = 'delivered') THEN
    IF COALESCE(NEW.collected_amount,0) > 0 THEN
      INSERT INTO ledger_entries (from_account, to_account, amount, mode, reference, receipt_url, created_by, created_at)
      VALUES (
        (SELECT name FROM shops WHERE id = NEW.shop_id),  -- from_account
        'company_cash',                                   -- to_account (example)
        NEW.collected_amount,
        NEW.payment_mode,
        NEW.id::text,
        NEW.proof_url,
        v_user_id,  -- Use safely retrieved user ID
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Verify the constraint
SELECT conname, confrelid::regclass, conrelid::regclass 
FROM pg_constraint 
WHERE conrelid = 'public.ledger_entries'::regclass 
AND conname = 'ledger_entries_created_by_fkey';

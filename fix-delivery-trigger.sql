-- Fix the trigger function to handle missing user IDs gracefully
-- First, let's check the current trigger function
SELECT proname, probin, prosrc 
FROM pg_proc 
WHERE proname = 'fn_create_ledger_on_delivery';

-- Drop and recreate the trigger function to handle missing user_id gracefully
CREATE OR REPLACE FUNCTION fn_create_ledger_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get current user ID from auth if available
  BEGIN
    v_user_id := auth.uid();
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

-- Also temporarily allow null created_by for ledger_entries if needed
ALTER TABLE ledger_entries ALTER COLUMN created_by DROP NOT NULL;

-- Verify the trigger exists
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgrelid = 'public.deliveries'::regclass 
AND tgname = 'trg_delivery_create_ledger';

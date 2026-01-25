-- Add missing columns to routes table
DO $$ 
BEGIN
  -- Add status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'routes' AND column_name = 'status'
  ) THEN
    ALTER TABLE routes ADD COLUMN status text DEFAULT 'pending';
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'routes' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE routes ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS routes_updated_at ON routes;

-- Recreate trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Verify
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'routes' 
ORDER BY ordinal_position;

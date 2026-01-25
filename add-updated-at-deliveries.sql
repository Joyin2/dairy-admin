-- Add missing columns to deliveries table
DO $$ 
BEGIN
  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'deliveries' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE deliveries ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS deliveries_updated_at ON deliveries;

-- Recreate trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Verify
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'deliveries' 
ORDER BY ordinal_position;

-- Add delivery tracking columns and tables
-- This migration adds comprehensive tracking functionality

-- Add tracking columns to deliveries table
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_location JSONB,
ADD COLUMN IF NOT EXISTS agent_notes TEXT;

-- Create delivery_status_history table for timeline tracking
CREATE TABLE IF NOT EXISTS delivery_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  changed_by UUID REFERENCES app_users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  location JSONB,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_delivery_status_history_delivery 
ON delivery_status_history(delivery_id, changed_at DESC);

-- Create function to automatically log status changes
CREATE OR REPLACE FUNCTION log_delivery_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO delivery_status_history (
      delivery_id,
      status,
      previous_status,
      changed_at,
      location,
      metadata
    ) VALUES (
      NEW.id,
      NEW.status,
      OLD.status,
      NOW(),
      NEW.current_location,
      jsonb_build_object(
        'delivered_qty', NEW.delivered_qty,
        'collected_amount', NEW.collected_amount
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic status logging
DROP TRIGGER IF EXISTS delivery_status_change_trigger ON deliveries;
CREATE TRIGGER delivery_status_change_trigger
  AFTER UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION log_delivery_status_change();

-- Add RLS policies for delivery_status_history
ALTER TABLE delivery_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view delivery status history"
  ON delivery_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert delivery status history"
  ON delivery_status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create real-time publication for deliveries
DO $$
BEGIN
  -- Enable realtime for deliveries table
  ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable realtime for delivery_status_history
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE delivery_status_history;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

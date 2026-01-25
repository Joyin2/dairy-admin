-- Add route_id column to shops table to associate shops with routes
-- This allows delivery agents to add shops with route assignment

ALTER TABLE shops
ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES routes(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_shops_route ON shops (route_id);

-- Comment: route_id is nullable to allow shops without route assignment
COMMENT ON COLUMN shops.route_id IS 'Optional route assignment for the shop';

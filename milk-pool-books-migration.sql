-- Milk Pool Books System Migration
-- Complete audit trail with book-style records for each pool cycle

-- ===== Step 1: Create milk_pool_books table =====
CREATE TABLE IF NOT EXISTS milk_pool_books (
  book_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES milk_pool(id),
  book_number SERIAL,
  book_name TEXT NOT NULL,
  
  -- Opening state
  opening_total_liters NUMERIC(12,3) NOT NULL DEFAULT 0,
  opening_fat_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  opening_avg_fat NUMERIC(6,3) NOT NULL DEFAULT 0,
  
  -- Closing state
  closing_total_liters NUMERIC(12,3) NOT NULL DEFAULT 0,
  closing_fat_units NUMERIC(14,4) NOT NULL DEFAULT 0,
  closing_avg_fat NUMERIC(6,3) NOT NULL DEFAULT 0,
  
  -- Calculated totals
  total_milk_used NUMERIC(12,3) NOT NULL DEFAULT 0,
  total_fat_used NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_collections_count INTEGER DEFAULT 0,
  total_usage_count INTEGER DEFAULT 0,
  total_inventory_items_count INTEGER DEFAULT 0,
  
  -- Snapshots (full history)
  usage_history_json JSONB DEFAULT '[]'::jsonb,
  inventory_history_json JSONB DEFAULT '[]'::jsonb,
  collections_history_json JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT now(),
  closed_by UUID REFERENCES app_users(id),
  notes TEXT
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_milk_pool_books_closed_at ON milk_pool_books(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_milk_pool_books_book_number ON milk_pool_books(book_number DESC);
CREATE INDEX IF NOT EXISTS idx_milk_pool_books_pool_id ON milk_pool_books(pool_id);

-- ===== Step 2: Enable RLS =====
ALTER TABLE milk_pool_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS milk_pool_books_all_authenticated ON milk_pool_books;
CREATE POLICY milk_pool_books_all_authenticated ON milk_pool_books
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Step 3: Function to generate book name =====
CREATE OR REPLACE FUNCTION generate_book_name(
  p_book_number INTEGER,
  p_created_at TIMESTAMPTZ,
  p_closed_at TIMESTAMPTZ
)
RETURNS TEXT AS $$
DECLARE
  v_period TEXT;
BEGIN
  -- Format: "Pool Book #12 (10 Jan 2026 → 01 Feb 2026)"
  v_period := TO_CHAR(p_created_at, 'DD Mon YYYY') || ' → ' || TO_CHAR(p_closed_at, 'DD Mon YYYY');
  RETURN 'Pool Book #' || p_book_number || ' (' || v_period || ')';
END;
$$ LANGUAGE plpgsql;

-- ===== Step 4: Enhanced reset function with book creation =====
DROP FUNCTION IF EXISTS reset_milk_pool_with_book(UUID, UUID, TEXT);

CREATE FUNCTION reset_milk_pool_with_book(
  p_pool_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
AS $$
DECLARE
  v_pool RECORD;
  v_book_id UUID;
  v_book_number INTEGER;
  v_book_name TEXT;
  v_usage_history JSONB;
  v_collections_history JSONB;
  v_inventory_history JSONB;
  v_new_pool_id UUID;
  v_total_milk_used NUMERIC;
  v_total_fat_used NUMERIC;
  v_usage_count INTEGER;
  v_inventory_count INTEGER;
  v_collections_count INTEGER;
BEGIN
  -- Get current pool
  SELECT * INTO v_pool FROM milk_pool WHERE id = p_pool_id AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Active pool not found');
  END IF;

  -- Calculate totals
  v_total_milk_used := v_pool.total_milk_liters - v_pool.remaining_milk_liters;
  v_total_fat_used := v_pool.total_fat_units - v_pool.remaining_fat_units;

  -- Gather usage history for this pool
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ul.id,
        'used_liters', ul.used_liters,
        'manual_fat_percent', ul.manual_fat_percent,
        'used_fat_units', ul.used_fat_units,
        'purpose', ul.purpose,
        'used_at', ul.used_at,
        'remaining_liters_after', ul.remaining_liters_after,
        'remaining_avg_fat_after', ul.remaining_avg_fat_after,
        'user_name', u.name
      ) ORDER BY ul.used_at
    ), '[]'::jsonb),
    COUNT(*)
  INTO v_usage_history, v_usage_count
  FROM milk_usage_log ul
  LEFT JOIN app_users u ON u.id = ul.used_by
  WHERE ul.milk_pool_id = p_pool_id;

  -- Gather collections history
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'collection_id', pc.collection_id,
        'added_at', pc.added_at,
        'qty_liters', mc.qty_liters,
        'fat', mc.fat,
        'snf', mc.snf,
        'supplier_id', mc.supplier_id,
        'supplier_name', s.name
      ) ORDER BY pc.added_at
    ), '[]'::jsonb),
    COUNT(*)
  INTO v_collections_history, v_collections_count
  FROM pool_collections pc
  JOIN milk_collections mc ON mc.id = pc.collection_id
  LEFT JOIN suppliers s ON s.id = mc.supplier_id
  WHERE pc.milk_pool_id = p_pool_id;

  -- Gather inventory items created from this pool's usage
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'usage_id', uii.usage_id,
        'product_id', uii.product_id,
        'product_name', p.name,
        'quantity', uii.quantity,
        'unit', uii.unit,
        'created_at', uii.created_at
      )
    ), '[]'::jsonb),
    COUNT(*)
  INTO v_inventory_history, v_inventory_count
  FROM usage_inventory_items uii
  JOIN milk_usage_log ul ON ul.id = uii.usage_id
  LEFT JOIN products p ON p.id = uii.product_id
  WHERE ul.milk_pool_id = p_pool_id;

  -- Get next book number
  SELECT COALESCE(MAX(book_number), 0) + 1 INTO v_book_number FROM milk_pool_books;

  -- Generate book name
  v_book_name := generate_book_name(v_book_number, v_pool.created_at, now());

  -- Create book record
  INSERT INTO milk_pool_books (
    pool_id,
    book_number,
    book_name,
    opening_total_liters,
    opening_fat_units,
    opening_avg_fat,
    closing_total_liters,
    closing_fat_units,
    closing_avg_fat,
    total_milk_used,
    total_fat_used,
    total_collections_count,
    total_usage_count,
    total_inventory_items_count,
    usage_history_json,
    inventory_history_json,
    collections_history_json,
    created_at,
    closed_at,
    closed_by,
    notes
  ) VALUES (
    v_pool.id,
    v_book_number,
    v_book_name,
    v_pool.total_milk_liters,
    v_pool.total_fat_units,
    v_pool.original_avg_fat,
    v_pool.remaining_milk_liters,
    v_pool.remaining_fat_units,
    v_pool.current_avg_fat,
    v_total_milk_used,
    v_total_fat_used,
    v_collections_count,
    v_usage_count,
    v_inventory_count,
    v_usage_history,
    v_inventory_history,
    v_collections_history,
    v_pool.created_at,
    now(),
    p_user_id,
    p_notes
  )
  RETURNING book_id INTO v_book_id;

  -- Mark old pool as archived
  UPDATE milk_pool SET
    status = 'archived',
    reset_at = now(),
    updated_at = now()
  WHERE id = p_pool_id;

  -- Create new empty active pool
  INSERT INTO milk_pool (
    name,
    total_milk_liters,
    total_fat_units,
    total_snf_units,
    original_avg_fat,
    original_avg_snf,
    remaining_milk_liters,
    remaining_fat_units,
    remaining_snf_units,
    current_avg_fat,
    current_avg_snf,
    status,
    created_by
  ) VALUES (
    'Main Pool',
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    'active',
    p_user_id
  )
  RETURNING id INTO v_new_pool_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Pool reset successfully. Book #' || v_book_number || ' created.',
    'book_id', v_book_id,
    'book_number', v_book_number,
    'book_name', v_book_name,
    'new_pool_id', v_new_pool_id,
    'summary', jsonb_build_object(
      'total_milk', v_pool.total_milk_liters,
      'milk_used', v_total_milk_used,
      'remaining_milk', v_pool.remaining_milk_liters,
      'usage_count', v_usage_count,
      'collections_count', v_collections_count,
      'inventory_count', v_inventory_count
    )
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Step 5: Function to get all books with filters =====
CREATE OR REPLACE FUNCTION get_milk_pool_books(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_min_milk NUMERIC DEFAULT NULL,
  p_max_milk NUMERIC DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        b.book_id,
        b.book_number,
        b.book_name,
        b.opening_total_liters,
        b.opening_avg_fat,
        b.closing_total_liters,
        b.closing_avg_fat,
        b.total_milk_used,
        b.total_fat_used,
        b.total_collections_count,
        b.total_usage_count,
        b.total_inventory_items_count,
        b.created_at,
        b.closed_at,
        b.notes,
        u.name as closed_by_name
      FROM milk_pool_books b
      LEFT JOIN app_users u ON u.id = b.closed_by
      WHERE
        (p_start_date IS NULL OR b.closed_at >= p_start_date) AND
        (p_end_date IS NULL OR b.closed_at <= p_end_date) AND
        (p_min_milk IS NULL OR b.total_milk_used >= p_min_milk) AND
        (p_max_milk IS NULL OR b.total_milk_used <= p_max_milk)
      ORDER BY b.book_number DESC
      LIMIT p_limit
      OFFSET p_offset
    ) t
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Step 6: Function to get single book details =====
CREATE OR REPLACE FUNCTION get_book_details(p_book_id UUID)
RETURNS JSON AS $$
DECLARE
  v_book RECORD;
BEGIN
  SELECT * INTO v_book FROM milk_pool_books WHERE book_id = p_book_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Book not found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'book', row_to_json(v_book)
  );
END;
$$ LANGUAGE plpgsql;

-- ===== Verification =====
SELECT 'milk_pool_books table created' AS status;
SELECT 'Functions created: reset_milk_pool_with_book, get_milk_pool_books, get_book_details' AS status;

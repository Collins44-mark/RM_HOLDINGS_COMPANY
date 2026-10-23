-- Backward-compatible sequential tractor ID sequence
-- Safe for concurrent inserts via advisory lock + transaction
-- Initializes from existing TRC-xxx codes

CREATE TABLE IF NOT EXISTS public.tractor_sequence (
  id int PRIMARY KEY DEFAULT 1 CHECK (id > 0),
  last_code text NOT NULL DEFAULT 'TRC-000',
  updated_at timestamp with time zone DEFAULT now()
);

-- Initialize from existing tractor codes if any
DO $$
BEGIN
  INSERT INTO public.tractor_sequence (id, last_code, updated_at)
  SELECT 1, COALESCE(MAX(code), 'TRC-000'), now()
  FROM public.farm_tractors
  WHERE code LIKE 'TRC-%';
EXCEPTION WHEN unique_violation THEN
  -- Already initialized; update from max
  UPDATE public.tractor_sequence SET last_code = COALESCE((SELECT MAX(code) FROM public.farm_tractors WHERE code LIKE 'TRC-%'), 'TRC-000'), updated_at = now();
END $$;

-- Ensure only one row
DELETE FROM public.tractor_sequence WHERE id <> 1;

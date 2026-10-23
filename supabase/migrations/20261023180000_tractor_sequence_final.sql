-- Final backward-compatible sequential tractor ID
-- Step 1: Ensure sequence table exists (safe if already present)
CREATE TABLE IF NOT EXISTS public.tractor_sequence (
  id int PRIMARY KEY DEFAULT 1 CHECK (id > 0),
  last_code text NOT NULL DEFAULT 'TRC-000',
  updated_at timestamp with time zone DEFAULT now()
);

-- Step 2: Initialize from existing tractor codes (idempotent; preserves existing ids)
DO $$
BEGIN
  INSERT INTO public.tractor_sequence (id, last_code, updated_at)
  SELECT 1, COALESCE(MAX(code), 'TRC-000'), now()
  FROM public.farm_tractors
  WHERE code LIKE 'TRC-%';
EXCEPTION WHEN unique_violation THEN
  UPDATE public.tractor_sequence
  SET last_code = COALESCE((SELECT MAX(code) FROM public.farm_tractors WHERE code LIKE 'TRC-%'), 'TRC-000'),
      updated_at = now()
  WHERE id = 1;
END $$;

-- Step 3: Ensure single row
DELETE FROM public.tractor_sequence WHERE id <> 1;

-- Step 4: Update RPC to generate sequential IDs atomically
CREATE OR REPLACE FUNCTION public.farm_save_tractor(
  p_id uuid,
  p_code text,
  p_name text,
  p_registration_number text,
  p_manufacturer text,
  p_model text,
  p_acquired_on date,
  p_acquisition_cost numeric,
  p_status text,
  p_hour_meter numeric,
  p_notes text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY invoker
SET search_path = public
AS $$
declare
  v_bu uuid := public.farm_bu();
  v_id uuid := p_id;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_status text := upper(btrim(coalesce(p_status, 'AVAILABLE')));
  v_hours numeric := round(coalesce(p_hour_meter, 0), 1);
  v_current numeric;
begin
  if char_length(v_code) < 1 then raise exception 'Enter a tractor identifier.'; end if;
  if char_length(v_name) < 2 then raise exception 'Enter a tractor name.'; end if;
  if v_status not in ('AVAILABLE','IN_USE','UNDER_SERVICE','INACTIVE') then
    raise exception 'Tractor status is invalid.'; end if;
  if v_hours < 0 then raise exception 'Engine hours cannot be negative.'; end if;

  if v_id is not null then
    select hour_meter into v_current from public.farm_tractors where id = v_id and business_unit_id = v_bu for update;
    if v_current is null then raise exception 'Tractor was not found.'; end if;
    if v_hours < v_current then raise exception 'Engine hours cannot decrease.'; end if;
    update public.farm_tractors set
      code = v_code,
      name = v_name,
      registration_number = nullif(btrim(coalesce(p_registration_number, '')), ''),
      manufacturer = nullif(btrim(coalesce(p_manufacturer, '')), ''),
      model = nullif(btrim(coalesce(p_model, '')), ''),
      acquired_on = p_acquired_on,
      acquisition_cost = case when p_acquisition_cost is null then null else round(p_acquisition_cost, 2) end,
      status = v_status,
      hour_meter = v_hours,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      is_active = coalesce(p_is_active, true),
      updated_at = now()
    where id = v_id;
  else
    -- Atomic sequential code generation (only when no explicit code provided)
    IF p_code IS NULL OR trim(btrim(p_code)) = '' THEN
      SELECT last_code INTO v_code FROM public.tractor_sequence WHERE id = 1 FOR UPDATE;
      SELECT CASE WHEN v_code ~ '^TRC-([0-9]+)$' THEN 'TRC-' || LPAD(((substring(v_code from '^TRC-([0-9]+)$'))::int + 1)::text, 3, '0') ELSE 'TRC-001' END INTO v_code FROM public.tractor_sequence WHERE id = 1;
      UPDATE public.tractor_sequence SET last_code = v_code, updated_at = now() WHERE id = 1;
    ELSE
      v_code := upper(btrim(coalesce(p_code, '')));
    END IF;
    insert into public.farm_tractors (
      business_unit_id, code, name, registration_number, manufacturer, model, acquired_on,
      acquisition_cost, status, hour_meter, notes, is_active
    ) values (
      v_bu, v_code, v_name,
      nullif(btrim(coalesce(p_registration_number, '')), ''),
      nullif(btrim(coalesce(p_manufacturer, '')), ''),
      nullif(btrim(coalesce(p_model, '')), ''),
      p_acquired_on,
      case when p_acquisition_cost is null then null else round(p_acquisition_cost, 2) end,
      v_status, v_hours, nullif(btrim(coalesce(p_notes, '')), ''), coalesce(p_is_active, true)
    )
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;
grant execute on function public.farm_save_tractor(uuid, text, text, text, text, text, date, numeric, text, boolean) to authenticated, service_role;

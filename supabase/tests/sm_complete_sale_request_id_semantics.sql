-- Isolated PostgreSQL semantics for POS request-id recovery.
-- Not a full sm_complete_sale fixture. Safe to run on a throwaway database only.

create table if not exists demo_sales (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null,
  create_request_id uuid,
  stock_taken integer not null default 0
);

create unique index if not exists demo_sales_bu_request_uidx
  on demo_sales (business_unit_id, create_request_id)
  where create_request_id is not null;

create or replace function demo_complete_sale(
  p_bu uuid,
  p_request_id uuid,
  p_fail boolean default false
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
  v_existing uuid;
begin
  if p_request_id is not null then
    select id into v_existing
    from demo_sales
    where business_unit_id = p_bu
      and create_request_id = p_request_id
    for update;
    if found then
      return v_existing;
    end if;
  end if;

  insert into demo_sales (id, business_unit_id, create_request_id, stock_taken)
  values (v_id, p_bu, p_request_id, 1);

  if p_fail then
    raise exception 'Insufficient stock';
  end if;

  return v_id;
exception
  when unique_violation then
    if p_request_id is null then
      raise;
    end if;
    select id into v_existing
    from demo_sales
    where business_unit_id = p_bu
      and create_request_id = p_request_id;
    if not found then
      raise;
    end if;
    return v_existing;
end;
$$;

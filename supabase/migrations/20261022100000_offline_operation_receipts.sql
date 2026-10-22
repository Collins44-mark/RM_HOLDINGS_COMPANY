-- Shared receipts for client-queued writes. Business mutations stay on existing
-- module RPCs (request_id). This table records that a client operation id was
-- accepted so retries return the original result without a second posting.

create table if not exists public.offline_operation_receipts (
  id uuid primary key,
  user_id uuid not null,
  auth_uid uuid,
  business_unit_code text not null,
  operation_type text not null,
  status text not null,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint offline_operation_receipts_status_chk check (status in ('synced', 'failed')),
  constraint offline_operation_receipts_type_chk check (char_length(btrim(operation_type)) between 3 and 80),
  constraint offline_operation_receipts_bu_chk check (char_length(btrim(business_unit_code)) between 2 and 32)
);

create index if not exists offline_operation_receipts_auth_uid_idx
  on public.offline_operation_receipts (auth_uid, created_at desc);

alter table public.offline_operation_receipts enable row level security;

revoke all on public.offline_operation_receipts from public, anon, authenticated;
grant select on public.offline_operation_receipts to authenticated;

drop policy if exists offline_operation_receipts_select_own on public.offline_operation_receipts;
create policy offline_operation_receipts_select_own
  on public.offline_operation_receipts
  for select
  to authenticated
  using (auth_uid = auth.uid());

create or replace function public.offline_store_receipt(
  p_id uuid,
  p_operation_type text,
  p_business_unit_code text,
  p_status text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.offline_operation_receipts%rowtype;
  v_uid uuid := auth.uid();
  v_inserted uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to sync queued work.';
  end if;
  if p_id is null then
    raise exception 'Operation id is required.';
  end if;
  if p_status not in ('synced', 'failed') then
    raise exception 'Receipt status is invalid.';
  end if;

  insert into public.offline_operation_receipts (
    id, user_id, auth_uid, business_unit_code, operation_type, status, result, processed_at
  ) values (
    p_id, v_uid, v_uid, btrim(p_business_unit_code), btrim(p_operation_type), p_status, coalesce(p_result, '{}'::jsonb), now()
  )
  on conflict (id) do nothing
  returning id into v_inserted;

  select * into v_existing from public.offline_operation_receipts where id = p_id;
  if not found then
    raise exception 'Could not store the sync receipt.';
  end if;
  if v_existing.auth_uid is not null and v_existing.auth_uid <> v_uid then
    raise exception 'Queued work cannot be submitted under another account.';
  end if;

  return jsonb_build_object(
    'id', v_existing.id,
    'duplicate', v_inserted is null,
    'status', v_existing.status,
    'result', v_existing.result
  );
end;
$$;

revoke all on function public.offline_store_receipt(uuid, text, text, text, jsonb) from public;
grant execute on function public.offline_store_receipt(uuid, text, text, text, jsonb) to authenticated, service_role;

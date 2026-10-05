-- Append-only system audit trail. Service role writes; owners may read.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  actor_email text,
  action text not null,
  module text not null,
  entity_type text,
  entity_id text,
  business_unit_id uuid references public.business_units(id) on delete set null,
  description text not null,
  severity text not null default 'low'
    check (severity in ('low', 'medium', 'high')),
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_module_idx on public.audit_logs (module);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index if not exists audit_logs_severity_idx on public.audit_logs (severity);

comment on table public.audit_logs is
  'Append-only audit trail of successful (or failed-auth) application events. Not client-writable.';

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_owner_read on public.audit_logs;
create policy audit_logs_owner_read
  on public.audit_logs for select
  to authenticated
  using (public.is_owner());

revoke insert, update, delete on table public.audit_logs from authenticated, anon;
grant select on table public.audit_logs to authenticated;
grant select, insert on table public.audit_logs to service_role;

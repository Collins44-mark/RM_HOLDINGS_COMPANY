-- Singleton organisation / platform settings.
-- Additive only: no destructive changes.

create table if not exists public.organization_settings (
  id smallint primary key default 1 check (id = 1),
  organisation_name text not null default 'RM Holdings Ltd',
  timezone text not null default 'Africa/Dar_es_Salaam',
  currency text not null default 'TZS',
  language text not null default 'en',
  updated_at timestamptz not null default now(),
  constraint organization_settings_language_check check (language in ('en', 'sw')),
  constraint organization_settings_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint organization_settings_name_check check (char_length(btrim(organisation_name)) between 2 and 120)
);

comment on table public.organization_settings is
  'Single-row organisation settings: name, timezone, currency, and UI language.';

insert into public.organization_settings (id, organisation_name, timezone, currency, language)
values (1, 'RM Holdings Ltd', 'Africa/Dar_es_Salaam', 'TZS', 'en')
on conflict (id) do nothing;

alter table public.organization_settings enable row level security;

grant select on table public.organization_settings to anon, authenticated, service_role;
grant update (
  organisation_name,
  timezone,
  currency,
  language,
  updated_at
) on table public.organization_settings to authenticated, service_role;

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select
  on public.organization_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists organization_settings_owner_update on public.organization_settings;
create policy organization_settings_owner_update
  on public.organization_settings
  for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

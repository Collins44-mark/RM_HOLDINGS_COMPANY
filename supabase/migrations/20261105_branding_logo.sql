alter table public.organization_settings
  add column if not exists logo_url text not null default '';

grant update (logo_url) on table public.organization_settings to authenticated, service_role;

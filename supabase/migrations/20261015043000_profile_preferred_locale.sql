alter table public.profiles
  add column if not exists preferred_locale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_preferred_locale_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_locale_check
      check (preferred_locale is null or preferred_locale in ('en', 'sw'));
  end if;
end $$;

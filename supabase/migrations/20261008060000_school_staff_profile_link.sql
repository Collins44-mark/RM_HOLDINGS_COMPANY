-- Evolve sch_staff.user_id → nullable unique profile_id (1 staff ↔ 0..1 profile).
-- Do not drop staff rows. Auth disable/delete must not cascade-delete staff.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sch_staff'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sch_staff'
      and column_name = 'profile_id'
  ) then
    alter table public.sch_staff rename column user_id to profile_id;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sch_staff'
      and column_name = 'profile_id'
  ) then
    alter table public.sch_staff
      add column profile_id uuid references public.profiles(id) on delete set null;
  end if;
end
$$;

drop index if exists public.sch_staff_user_uidx;
drop index if exists public.sch_staff_profile_bu_uidx;

create unique index if not exists sch_staff_profile_uidx
  on public.sch_staff (profile_id)
  where profile_id is not null;

comment on column public.sch_staff.profile_id is
  'Optional 1:1 link to global profiles.id. Staff may exist without a system account.';

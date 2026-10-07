-- School streams under classes, plus academic access-scope foundation.
-- Additive. No seeds. No physical deletes. Reuses sch_class_levels and sch_classes.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sch_classes_id_bu_key'
  ) then
    alter table public.sch_classes
      add constraint sch_classes_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create table if not exists public.sch_class_streams (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  class_id uuid not null references public.sch_classes(id) on delete restrict,
  name text not null,
  code text not null,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  class_teacher_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_class_streams_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_class_streams_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_class_streams_sort check (sort_order >= 1),
  constraint sch_class_streams_class_bu_fk foreign key (class_id, business_unit_id)
    references public.sch_classes (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_class_streams_class_code_uidx
  on public.sch_class_streams (class_id, lower(btrim(code)));

drop trigger if exists sch_class_streams_touch on public.sch_class_streams;
create trigger sch_class_streams_touch before update on public.sch_class_streams
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_class_streams enable row level security;
revoke all on public.sch_class_streams from anon, public;
grant select, insert, update on public.sch_class_streams to authenticated, service_role;

drop policy if exists sch_class_streams_select on public.sch_class_streams;
create policy sch_class_streams_select on public.sch_class_streams
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_class_streams_insert on public.sch_class_streams;
create policy sch_class_streams_insert on public.sch_class_streams
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_class_streams_update on public.sch_class_streams;
create policy sch_class_streams_update on public.sch_class_streams
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_class_streams_delete on public.sch_class_streams;
create policy sch_class_streams_delete on public.sch_class_streams
  for delete to authenticated
  using (false);

-- Data-driven academic scope. Empty assignment list = school-wide. Not a second RBAC system.
create table if not exists public.sch_academic_access (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_kind text not null,
  target_id uuid,
  created_at timestamptz not null default now(),
  constraint sch_academic_access_kind check (scope_kind in ('school', 'level', 'class', 'stream')),
  constraint sch_academic_access_target check (
    (scope_kind = 'school' and target_id is null) or
    (scope_kind <> 'school' and target_id is not null)
  )
);

create unique index if not exists sch_academic_access_uidx
  on public.sch_academic_access (
    user_id,
    business_unit_id,
    scope_kind,
    coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.sch_academic_access enable row level security;
revoke all on public.sch_academic_access from anon, public;
grant select on public.sch_academic_access to authenticated;
grant select, insert, update, delete on public.sch_academic_access to service_role;

drop policy if exists sch_academic_access_select on public.sch_academic_access;
create policy sch_academic_access_select on public.sch_academic_access
  for select to authenticated
  using (user_id = auth.uid());

-- Future fee configuration attaches to Level, not Stream.
alter table public.sch_fee_categories
  add column if not exists class_level_id uuid references public.sch_class_levels(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sch_fee_categories_level_bu_fk'
  ) then
    alter table public.sch_fee_categories
      add constraint sch_fee_categories_level_bu_fk
      foreign key (class_level_id, business_unit_id)
      references public.sch_class_levels (id, business_unit_id)
      on delete restrict;
  end if;
end
$$;

create or replace function public.has_school_academic_scope(
  p_business_unit_id uuid,
  p_level_id uuid default null,
  p_class_id uuid default null,
  p_stream_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_rows boolean;
begin
  if not public.has_business_unit_access(p_business_unit_id) then
    return false;
  end if;
  if public.is_owner() then
    return true;
  end if;

  select exists (
    select 1
    from public.sch_academic_access a
    where a.user_id = auth.uid()
      and a.business_unit_id = p_business_unit_id
  ) into v_has_rows;
  if not v_has_rows then
    return true;
  end if;

  if exists (
    select 1
    from public.sch_academic_access a
    where a.user_id = auth.uid()
      and a.business_unit_id = p_business_unit_id
      and a.scope_kind = 'school'
  ) then
    return true;
  end if;

  if p_stream_id is not null then
    return exists (
      select 1
      from public.sch_class_streams s
      join public.sch_classes c on c.id = s.class_id and c.business_unit_id = s.business_unit_id
      where s.id = p_stream_id
        and s.business_unit_id = p_business_unit_id
        and (
          exists (
            select 1 from public.sch_academic_access a
            where a.user_id = auth.uid() and a.business_unit_id = p_business_unit_id
              and a.scope_kind = 'stream' and a.target_id = s.id
          )
          or exists (
            select 1 from public.sch_academic_access a
            where a.user_id = auth.uid() and a.business_unit_id = p_business_unit_id
              and a.scope_kind = 'class' and a.target_id = s.class_id
          )
          or exists (
            select 1 from public.sch_academic_access a
            where a.user_id = auth.uid() and a.business_unit_id = p_business_unit_id
              and a.scope_kind = 'level' and a.target_id = c.level_id
          )
        )
    );
  end if;

  if p_class_id is not null then
    return exists (
      select 1
      from public.sch_classes c
      where c.id = p_class_id
        and c.business_unit_id = p_business_unit_id
        and (
          exists (
            select 1 from public.sch_academic_access a
            where a.user_id = auth.uid() and a.business_unit_id = p_business_unit_id
              and a.scope_kind = 'class' and a.target_id = c.id
          )
          or exists (
            select 1 from public.sch_academic_access a
            where a.user_id = auth.uid() and a.business_unit_id = p_business_unit_id
              and a.scope_kind = 'level' and a.target_id = c.level_id
          )
          or exists (
            select 1
            from public.sch_class_streams s
            join public.sch_academic_access a
              on a.target_id = s.id and a.user_id = auth.uid()
             and a.business_unit_id = p_business_unit_id and a.scope_kind = 'stream'
            where s.class_id = c.id and s.business_unit_id = p_business_unit_id
          )
        )
    );
  end if;

  if p_level_id is not null then
    return exists (
      select 1
      from public.sch_class_levels l
      where l.id = p_level_id
        and l.business_unit_id = p_business_unit_id
        and (
          exists (
            select 1 from public.sch_academic_access a
            where a.user_id = auth.uid() and a.business_unit_id = p_business_unit_id
              and a.scope_kind = 'level' and a.target_id = l.id
          )
          or exists (
            select 1
            from public.sch_classes c
            join public.sch_academic_access a
              on a.target_id = c.id and a.user_id = auth.uid()
             and a.business_unit_id = p_business_unit_id and a.scope_kind = 'class'
            where c.level_id = l.id and c.business_unit_id = p_business_unit_id
          )
          or exists (
            select 1
            from public.sch_classes c
            join public.sch_class_streams s on s.class_id = c.id and s.business_unit_id = c.business_unit_id
            join public.sch_academic_access a
              on a.target_id = s.id and a.user_id = auth.uid()
             and a.business_unit_id = p_business_unit_id and a.scope_kind = 'stream'
            where c.level_id = l.id and c.business_unit_id = p_business_unit_id
          )
        )
    );
  end if;

  return false;
end;
$$;

revoke all on function public.has_school_academic_scope(uuid, uuid, uuid, uuid) from public;
grant execute on function public.has_school_academic_scope(uuid, uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists sch_class_levels_select on public.sch_class_levels;
create policy sch_class_levels_select on public.sch_class_levels
  for select to authenticated
  using (public.has_school_academic_scope(business_unit_id, id, null, null));

drop policy if exists sch_classes_select on public.sch_classes;
create policy sch_classes_select on public.sch_classes
  for select to authenticated
  using (public.has_school_academic_scope(business_unit_id, null, id, null));

drop policy if exists sch_class_streams_select on public.sch_class_streams;
create policy sch_class_streams_select on public.sch_class_streams
  for select to authenticated
  using (public.has_school_academic_scope(business_unit_id, null, null, id));

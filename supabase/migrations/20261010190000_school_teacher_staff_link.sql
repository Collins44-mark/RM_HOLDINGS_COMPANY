-- Link School Teacher logins to the existing sch_staff employee row.
-- Idempotent. Does not delete users, staff, or historical data.
-- Does not invent teachers from every School module user.

create or replace function public.sch_split_person_name(p_full_name text)
returns table (first_name text, middle_name text, last_name text)
language plpgsql
immutable
as $$
declare
  v_parts text[];
begin
  v_parts := regexp_split_to_array(btrim(coalesce(p_full_name, '')), '\s+');
  if coalesce(array_length(v_parts, 1), 0) = 0 or v_parts[1] = '' then
    first_name := 'Staff';
    middle_name := '';
    last_name := 'Member';
  elsif array_length(v_parts, 1) = 1 then
    first_name := left(v_parts[1], 80);
    middle_name := '';
    last_name := left(v_parts[1], 80);
  elsif array_length(v_parts, 1) = 2 then
    first_name := left(v_parts[1], 80);
    middle_name := '';
    last_name := left(v_parts[2], 80);
  else
    first_name := left(v_parts[1], 80);
    middle_name := left(array_to_string(v_parts[2:array_length(v_parts, 1) - 1], ' '), 80);
    last_name := left(v_parts[array_length(v_parts, 1)], 80);
  end if;
  return next;
end;
$$;

create or replace function public.sch_ensure_teacher_staff(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid;
  v_profile record;
  v_role_id uuid;
  v_role_code text;
  v_type_id uuid;
  v_staff_id uuid;
  v_staff_number text;
  v_names record;
  v_number text;
  v_seq integer;
  v_phone_digits text;
  v_linked uuid;
  v_created boolean := false;
begin
  if p_profile_id is null then
    raise exception 'User was not found.';
  end if;

  select id into v_bu from public.business_units where code = 'school' limit 1;
  if v_bu is null then
    raise exception 'School business unit was not found.';
  end if;

  if auth.uid() is not null and auth.uid() <> p_profile_id and not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;

  select p.id, p.full_name, p.phone, p.email, p.role_id
    into v_profile
  from public.profiles p
  where p.id = p_profile_id;
  if v_profile.id is null then
    raise exception 'User was not found.';
  end if;

  if not exists (
    select 1 from public.user_business_units
    where user_id = p_profile_id and business_unit_id = v_bu
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_school_user');
  end if;

  select umr.role_id into v_role_id
  from public.user_module_roles umr
  where umr.user_id = p_profile_id
    and umr.business_unit_id = v_bu
  limit 1;
  if v_role_id is null then
    v_role_id := v_profile.role_id;
  end if;

  select code into v_role_code from public.roles where id = v_role_id;
  if v_role_code is distinct from 'TEACHER' then
    return jsonb_build_object('ok', false, 'reason', 'not_teacher');
  end if;

  insert into public.sch_staff_types (business_unit_id, name, code, kind, is_active)
  select v_bu, 'Academic', 'ACADEMIC', 'academic', true
  where not exists (
    select 1 from public.sch_staff_types t
    where t.business_unit_id = v_bu and t.kind = 'academic' and t.is_active
  );

  select id into v_type_id
  from public.sch_staff_types
  where business_unit_id = v_bu and kind = 'academic' and is_active
  order by name
  limit 1;

  select id, staff_number into v_staff_id, v_staff_number
  from public.sch_staff
  where profile_id = p_profile_id
  limit 1;

  if v_staff_id is not null then
    update public.sch_staff
      set role_id = coalesce(role_id, v_role_id),
          staff_type_id = coalesce(staff_type_id, v_type_id),
          job_title = case when coalesce(btrim(job_title), '') = '' then 'Teacher' else job_title end,
          updated_at = now()
    where id = v_staff_id
      and business_unit_id = v_bu;
    return jsonb_build_object('ok', true, 'id', v_staff_id, 'staff_number', v_staff_number, 'created', false);
  end if;

  select n.first_name, n.middle_name, n.last_name into v_names
  from public.sch_split_person_name(v_profile.full_name) n;
  v_phone_digits := regexp_replace(coalesce(v_profile.phone, ''), '\D', '', 'g');

  if v_phone_digits <> '' then
    select s.id into v_linked
    from public.sch_staff s
    where s.business_unit_id = v_bu
      and s.profile_id is null
      and s.employment_status = 'active'
      and lower(btrim(s.first_name)) = lower(v_names.first_name)
      and lower(btrim(s.last_name)) = lower(v_names.last_name)
      and regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') = v_phone_digits
    limit 1;
    if v_linked is not null then
      update public.sch_staff
        set profile_id = p_profile_id,
            role_id = coalesce(role_id, v_role_id),
            staff_type_id = coalesce(staff_type_id, v_type_id),
            job_title = case when coalesce(btrim(job_title), '') = '' then 'Teacher' else job_title end,
            updated_at = now()
      where id = v_linked
        and business_unit_id = v_bu;
      select staff_number into v_staff_number from public.sch_staff where id = v_linked;
      return jsonb_build_object('ok', true, 'id', v_linked, 'staff_number', v_staff_number, 'created', false);
    end if;
  end if;

  -- Allocate inside this definer function. sch_next_document_number
  -- checks has_business_unit_access, which fails when auth.uid() is null
  -- (service role / migration backfill).
  insert into public.sch_document_counters (business_unit_id, doc_type, prefix, next_value)
  values (v_bu, 'staff', 'STF', 2)
  on conflict (business_unit_id, doc_type)
  do update set next_value = public.sch_document_counters.next_value + 1
  returning next_value - 1 into v_seq;
  v_number := 'STF-' || lpad(v_seq::text, 6, '0');

  begin
    insert into public.sch_staff (
      business_unit_id, staff_number, first_name, middle_name, last_name, phone, email,
      staff_type_id, role_id, job_title, employment_status, profile_id
    )
    values (
      v_bu, v_number, v_names.first_name, v_names.middle_name, v_names.last_name,
      left(coalesce(v_profile.phone, ''), 40),
      left(coalesce(v_profile.email, ''), 160),
      v_type_id, v_role_id, 'Teacher', 'active', p_profile_id
    )
    returning id, staff_number into v_staff_id, v_staff_number;
    v_created := true;
  exception
    when unique_violation then
      select id, staff_number into v_staff_id, v_staff_number
      from public.sch_staff
      where profile_id = p_profile_id
      limit 1;
      v_created := false;
  end;

  return jsonb_build_object('ok', true, 'id', v_staff_id, 'staff_number', v_staff_number, 'created', v_created);
end;
$$;

revoke all on function public.sch_split_person_name(text) from public, anon;
grant execute on function public.sch_split_person_name(text) to authenticated, service_role;

revoke all on function public.sch_ensure_teacher_staff(uuid) from public, anon;
grant execute on function public.sch_ensure_teacher_staff(uuid) to authenticated, service_role;

do $$
declare
  v_bu uuid;
  r record;
begin
  select id into v_bu from public.business_units where code = 'school' limit 1;
  if v_bu is null then
    return;
  end if;
  for r in
    select p.id
    from public.profiles p
    join public.user_business_units ubu
      on ubu.user_id = p.id
     and ubu.business_unit_id = v_bu
    join public.roles pr
      on pr.id = coalesce(
        (
          select umr.role_id
          from public.user_module_roles umr
          where umr.user_id = p.id
            and umr.business_unit_id = v_bu
          limit 1
        ),
        p.role_id
      )
    where pr.code = 'TEACHER'
  loop
    perform public.sch_ensure_teacher_staff(r.id);
  end loop;
end
$$;

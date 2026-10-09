-- Default School expense type "Other". Idempotent for existing and new school units.
-- Does not insert expense transactions.

create or replace function public.sch_ensure_other_expense_type(p_bu uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_bu is null then
    raise exception 'School business unit was not found.';
  end if;
  if not public.has_business_unit_access(p_bu) then
    raise exception 'Not authorized for this school.';
  end if;

  perform pg_advisory_xact_lock(hashtext('sch_other_expense_type:' || p_bu::text));

  select id into v_id
  from public.sch_expense_categories
  where business_unit_id = p_bu
    and upper(btrim(code)) = 'OTHER'
  order by is_active desc, created_at
  limit 1;

  if v_id is null then
    select id into v_id
    from public.sch_expense_categories
    where business_unit_id = p_bu
      and lower(btrim(name)) = 'other'
    order by is_active desc, created_at
    limit 1;
  end if;

  if v_id is not null then
    update public.sch_expense_categories
      set code = 'OTHER',
          name = 'Other',
          is_active = true,
          description = case
            when btrim(coalesce(description, '')) = '' then 'Uncategorized operating expenses.'
            else description
          end
    where id = v_id
      and business_unit_id = p_bu;
    return v_id;
  end if;

  begin
    insert into public.sch_expense_categories (
      business_unit_id, code, name, description, is_active
    )
    values (
      p_bu, 'OTHER', 'Other', 'Uncategorized operating expenses.', true
    )
    returning id into v_id;
  exception
    when unique_violation then
      select id into v_id
      from public.sch_expense_categories
      where business_unit_id = p_bu
        and (
          upper(btrim(code)) = 'OTHER'
          or lower(btrim(name)) = 'other'
        )
      order by is_active desc, created_at
      limit 1;
      if v_id is null then
        raise;
      end if;
      update public.sch_expense_categories
        set code = 'OTHER',
            name = 'Other',
            is_active = true
      where id = v_id
        and business_unit_id = p_bu;
  end;

  return v_id;
end;
$$;

revoke all on function public.sch_ensure_other_expense_type(uuid) from public, anon;
grant execute on function public.sch_ensure_other_expense_type(uuid) to authenticated, service_role;

do $$
declare
  v_bu uuid;
  v_id uuid;
begin
  for v_bu in
    select id from public.business_units where lower(btrim(code)) = 'school'
  loop
    select id into v_id
    from public.sch_expense_categories
    where business_unit_id = v_bu
      and upper(btrim(code)) = 'OTHER'
    order by is_active desc, created_at
    limit 1;

    if v_id is null then
      select id into v_id
      from public.sch_expense_categories
      where business_unit_id = v_bu
        and lower(btrim(name)) = 'other'
      order by is_active desc, created_at
      limit 1;
    end if;

    if v_id is not null then
      update public.sch_expense_categories
        set code = 'OTHER',
            name = 'Other',
            is_active = true,
            description = case
              when btrim(coalesce(description, '')) = '' then 'Uncategorized operating expenses.'
              else description
            end
      where id = v_id
        and business_unit_id = v_bu;
    else
      insert into public.sch_expense_categories (
        business_unit_id, code, name, description, is_active
      )
      values (
        v_bu, 'OTHER', 'Other', 'Uncategorized operating expenses.', true
      );
    end if;
  end loop;
end
$$;

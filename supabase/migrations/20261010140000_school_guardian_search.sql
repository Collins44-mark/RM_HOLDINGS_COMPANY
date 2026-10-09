-- Paged unique-guardian search, including linked student name/number/admission.
-- Additive only. Does not insert guardians or change existing links.

create index if not exists sch_guardians_bu_name_idx
  on public.sch_guardians (business_unit_id, full_name);

create index if not exists sch_students_bu_student_number_idx
  on public.sch_students (business_unit_id, student_number);

create index if not exists sch_students_bu_admission_number_idx
  on public.sch_students (business_unit_id, admission_number);

create or replace function public.sch_page_guardian_ids(
  p_bu uuid,
  p_q text,
  p_student_ids uuid[],
  p_offset integer,
  p_limit integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_like text;
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_q text := btrim(coalesce(p_q, ''));
  v_total integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if p_bu is null then
    raise exception 'School business unit was not found.';
  end if;
  if not public.has_business_unit_access(p_bu) then
    raise exception 'Not authorized for this school.';
  end if;
  if p_student_ids is not null and cardinality(p_student_ids) = 0 then
    return jsonb_build_object('total', 0, 'ids', '[]'::jsonb);
  end if;

  v_like := '%' || replace(replace(v_q, '%', ''), '_', '') || '%';
  if v_like = '%%' then
    v_q := '';
  end if;

  with matched as (
    select g.id, g.full_name
    from public.sch_guardians g
    where g.business_unit_id = p_bu
      and (
        p_student_ids is null
        or exists (
          select 1
          from public.sch_student_guardians sg
          where sg.business_unit_id = p_bu
            and sg.guardian_id = g.id
            and sg.student_id = any (p_student_ids)
        )
      )
      and (
        v_q = ''
        or g.full_name ilike v_like
        or g.phone ilike v_like
        or g.email ilike v_like
        or exists (
          select 1
          from public.sch_student_guardians sg
          join public.sch_students s
            on s.id = sg.student_id
           and s.business_unit_id = sg.business_unit_id
          where sg.business_unit_id = p_bu
            and sg.guardian_id = g.id
            and (
              s.first_name ilike v_like
              or s.middle_name ilike v_like
              or s.last_name ilike v_like
              or concat_ws(' ', s.first_name, nullif(btrim(s.middle_name), ''), s.last_name) ilike v_like
              or s.student_number ilike v_like
              or s.admission_number ilike v_like
            )
        )
      )
  ),
  numbered as (
    select id, row_number() over (order by full_name, id) as rn, count(*) over () as total
    from matched
  )
  select
    coalesce((select total from numbered limit 1), 0),
    coalesce(
      (
        select jsonb_agg(id order by rn)
        from numbered
        where rn > v_offset
          and rn <= v_offset + v_limit
      ),
      '[]'::jsonb
    )
  into v_total, v_ids;

  return jsonb_build_object('total', v_total, 'ids', v_ids);
end;
$$;

revoke all on function public.sch_page_guardian_ids(uuid, text, uuid[], integer, integer) from public, anon;
grant execute on function public.sch_page_guardian_ids(uuid, text, uuid[], integer, integer) to authenticated, service_role;

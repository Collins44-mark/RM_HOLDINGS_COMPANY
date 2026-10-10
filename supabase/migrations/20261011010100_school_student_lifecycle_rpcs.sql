-- Transactional cancel / withdraw / class change / promotion. Additive. No table drops.

create or replace function public.sch_ensure_tuition_for_enrollment(
  p_bu uuid,
  p_student uuid,
  p_enrollment uuid,
  p_year uuid,
  p_class uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_charge uuid;
  v_structure uuid;
  v_level uuid;
  v_annual numeric;
begin
  select id into v_charge
  from public.sch_fee_charges
  where enrollment_id = p_enrollment
    and is_active
    and charge_kind = 'TUITION'
  limit 1;
  if v_charge is not null then
    return v_charge;
  end if;

  select c.level_id into v_level
  from public.sch_classes c
  where c.id = p_class
    and c.business_unit_id = p_bu
  limit 1;

  select fs.id, fs.annual_amount
    into v_structure, v_annual
  from public.sch_fee_structures fs
  where fs.business_unit_id = p_bu
    and fs.academic_year_id = p_year
    and fs.class_id = p_class
    and fs.is_active
  limit 1;
  if v_structure is null then
    return null;
  end if;

  insert into public.sch_fee_charges (
    business_unit_id, student_id, enrollment_id, fee_structure_id,
    academic_year_id, level_id, class_id, annual_amount, is_active, charge_kind
  )
  values (
    p_bu, p_student, p_enrollment, v_structure,
    p_year, v_level, p_class, v_annual, true, 'TUITION'
  )
  returning id into v_charge;
  return v_charge;
end;
$$;

create or replace function public.sch_cancel_admission(
  p_admission_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_adm public.sch_admissions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_admission_id is null then raise exception 'Admission was not found.'; end if;
  if char_length(v_reason) < 3 then raise exception 'Enter a cancellation reason.'; end if;

  select * into v_adm from public.sch_admissions where id = p_admission_id for update;
  if not found then raise exception 'Admission was not found.'; end if;
  if v_adm.status = 'cancelled' then
    return jsonb_build_object('id', v_adm.id, 'duplicate', true, 'status', 'cancelled');
  end if;
  if v_adm.status <> 'draft' then
    raise exception 'Only a draft admission can be cancelled.';
  end if;

  update public.sch_admissions
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = v_reason,
      cancelled_by = p_actor_id
  where id = v_adm.id;

  return jsonb_build_object('id', v_adm.id, 'duplicate', false, 'status', 'cancelled');
end;
$$;

create or replace function public.sch_withdraw_student(
  p_student_id uuid,
  p_withdrawn_on date,
  p_reason text,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stu public.sch_students%rowtype;
  v_enr public.sch_student_enrollments%rowtype;
  v_event uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_request_id is null then raise exception 'Withdrawal request is invalid.'; end if;
  if p_withdrawn_on is null then raise exception 'Enter a withdrawal date.'; end if;
  if char_length(v_reason) < 3 then raise exception 'Enter a withdrawal reason.'; end if;

  select id into v_event from public.sch_placement_events where request_id = p_request_id limit 1;
  if v_event is not null then
    return jsonb_build_object('id', p_student_id, 'duplicate', true);
  end if;

  select * into v_stu from public.sch_students where id = p_student_id for update;
  if not found then raise exception 'Student was not found.'; end if;
  if v_stu.status = 'withdrawn' then
    raise exception 'This student has already been withdrawn.';
  end if;

  select * into v_enr
  from public.sch_student_enrollments
  where student_id = p_student_id
    and status = 'active'
  order by started_on desc
  limit 1
  for update;

  update public.sch_students
  set status = 'withdrawn',
      withdrawn_on = p_withdrawn_on,
      withdrawn_reason = v_reason,
      withdrawn_by = p_actor_id
  where id = p_student_id;

  update public.sch_student_enrollments
  set status = 'withdrawn',
      ended_on = p_withdrawn_on
  where student_id = p_student_id
    and status = 'active';

  update public.sch_student_transport
  set status = 'inactive',
      ended_on = coalesce(ended_on, p_withdrawn_on)
  where student_id = p_student_id
    and status = 'active';

  insert into public.sch_placement_events (
    business_unit_id, student_id, event_kind, from_enrollment_id,
    from_year_id, from_class_id, from_stream_id, effective_on, reason, request_id, recorded_by
  )
  values (
    v_stu.business_unit_id, p_student_id, 'WITHDRAW', v_enr.id,
    v_enr.academic_year_id, v_enr.class_id, v_enr.stream_id, p_withdrawn_on, v_reason, p_request_id, p_actor_id
  );

  return jsonb_build_object('id', p_student_id, 'duplicate', false);
end;
$$;

create or replace function public.sch_change_student_class(
  p_student_id uuid,
  p_year_id uuid,
  p_level_id uuid,
  p_class_id uuid,
  p_stream_id uuid,
  p_effective_on date,
  p_reason text,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stu public.sch_students%rowtype;
  v_from public.sch_student_enrollments%rowtype;
  v_to uuid;
  v_event uuid;
  v_year public.sch_academic_years%rowtype;
  v_class public.sch_classes%rowtype;
  v_stream public.sch_class_streams%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_same_year boolean;
  v_charge uuid;
  v_from_level uuid;
begin
  if p_request_id is null then raise exception 'Class change request is invalid.'; end if;
  if p_effective_on is null then raise exception 'Enter an effective date.'; end if;
  if char_length(v_reason) < 3 then raise exception 'Enter a reason for the class change.'; end if;

  select id into v_event from public.sch_placement_events where request_id = p_request_id limit 1;
  if v_event is not null then
    return jsonb_build_object('id', p_student_id, 'duplicate', true);
  end if;

  select * into v_stu from public.sch_students where id = p_student_id for update;
  if not found then raise exception 'Student was not found.'; end if;
  if v_stu.status <> 'active' then raise exception 'Only an active student can change class.'; end if;

  select * into v_from
  from public.sch_student_enrollments
  where student_id = p_student_id
    and status = 'active'
  order by started_on desc
  limit 1
  for update;
  if not found then raise exception 'An active enrollment was not found.'; end if;
  select level_id into v_from_level from public.sch_classes where id = v_from.class_id;

  select * into v_year from public.sch_academic_years where id = p_year_id and business_unit_id = v_stu.business_unit_id;
  if not found or not v_year.is_active then raise exception 'The selected academic year is not active.'; end if;

  select * into v_class from public.sch_classes where id = p_class_id and business_unit_id = v_stu.business_unit_id;
  if not found or not v_class.is_active then raise exception 'The selected class is not active.'; end if;
  if v_class.level_id <> p_level_id then raise exception 'The selected class does not belong to that level.'; end if;

  if p_stream_id is not null then
    select * into v_stream from public.sch_class_streams where id = p_stream_id and business_unit_id = v_stu.business_unit_id;
    if not found or not v_stream.is_active then raise exception 'The selected stream is not active.'; end if;
    if v_stream.class_id <> p_class_id then raise exception 'The selected stream does not belong to that class.'; end if;
  end if;

  if v_from.academic_year_id = p_year_id and v_from.class_id = p_class_id and coalesce(v_from.stream_id, '00000000-0000-0000-0000-000000000000') = coalesce(p_stream_id, '00000000-0000-0000-0000-000000000000') then
    raise exception 'Choose a different class or stream.';
  end if;

  v_same_year := v_from.academic_year_id = p_year_id;

  if v_same_year then
    update public.sch_student_enrollments
    set status = 'transferred', ended_on = p_effective_on
    where id = v_from.id;
  else
    if exists (
      select 1 from public.sch_student_enrollments
      where student_id = p_student_id and academic_year_id = p_year_id and status = 'active'
    ) then
      raise exception 'This student already has an active enrollment in the destination year.';
    end if;
    update public.sch_student_enrollments
    set status = 'completed', ended_on = p_effective_on
    where id = v_from.id;
  end if;

  insert into public.sch_student_enrollments (
    business_unit_id, student_id, academic_year_id, term_id, class_id, stream_id, status, started_on
  )
  values (
    v_stu.business_unit_id, p_student_id, p_year_id, v_from.term_id, p_class_id, p_stream_id, 'active', p_effective_on
  )
  returning id into v_to;

  if not v_same_year then
    v_charge := public.sch_ensure_tuition_for_enrollment(v_stu.business_unit_id, p_student_id, v_to, p_year_id, p_class_id);
  end if;

  insert into public.sch_placement_events (
    business_unit_id, student_id, event_kind, from_enrollment_id, to_enrollment_id,
    from_year_id, to_year_id, from_level_id, to_level_id, from_class_id, to_class_id,
    from_stream_id, to_stream_id, effective_on, reason, request_id, recorded_by
  )
  values (
    v_stu.business_unit_id, p_student_id, 'TRANSFER', v_from.id, v_to,
    v_from.academic_year_id, p_year_id, v_from_level, p_level_id, v_from.class_id, p_class_id,
    v_from.stream_id, p_stream_id, p_effective_on, v_reason, p_request_id, p_actor_id
  );

  return jsonb_build_object('id', p_student_id, 'enrollment_id', v_to, 'duplicate', false, 'charge_id', v_charge);
end;
$$;

create or replace function public.sch_apply_promotion_run(
  p_from_year_id uuid,
  p_to_year_id uuid,
  p_students jsonb,
  p_effective_on date,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_run uuid;
  v_from public.sch_academic_years%rowtype;
  v_to public.sch_academic_years%rowtype;
  v_item jsonb;
  v_student uuid;
  v_outcome text;
  v_class uuid;
  v_level uuid;
  v_stream uuid;
  v_reason text;
  v_stu public.sch_students%rowtype;
  v_enr public.sch_student_enrollments%rowtype;
  v_new uuid;
  v_cls public.sch_classes%rowtype;
  v_promoted int := 0;
  v_retained int := 0;
  v_transferred int := 0;
  v_graduated int := 0;
  v_excluded int := 0;
  v_failed int := 0;
  v_failures jsonb := '[]'::jsonb;
  v_lock_key bigint;
begin
  if p_request_id is null then raise exception 'Promotion request is invalid.'; end if;
  if p_effective_on is null then raise exception 'Enter an effective date.'; end if;
  if p_from_year_id is null or p_to_year_id is null then raise exception 'Select current and target academic years.'; end if;
  if p_from_year_id = p_to_year_id then raise exception 'Target academic year must be different from the current year.'; end if;

  select id into v_run from public.sch_promotion_runs where request_id = p_request_id limit 1;
  if v_run is not null then
    return jsonb_build_object('id', v_run, 'duplicate', true);
  end if;

  select * into v_from from public.sch_academic_years where id = p_from_year_id;
  if not found then raise exception 'The current academic year was not found.'; end if;
  v_bu := v_from.business_unit_id;
  select * into v_to from public.sch_academic_years where id = p_to_year_id and business_unit_id = v_bu;
  if not found or not v_to.is_active then raise exception 'The target academic year is not active.'; end if;

  v_lock_key := hashtext(v_bu::text || ':promotion:' || p_from_year_id::text || ':' || p_to_year_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  if jsonb_typeof(p_students) <> 'array' then raise exception 'Promotion list is invalid.'; end if;

  for v_item in select value from jsonb_array_elements(p_students)
  loop
    begin
      v_student := nullif(v_item->>'studentId', '')::uuid;
      v_outcome := upper(btrim(coalesce(v_item->>'outcome', '')));
      v_class := nullif(v_item->>'classId', '')::uuid;
      v_level := nullif(v_item->>'levelId', '')::uuid;
      v_stream := nullif(v_item->>'streamId', '')::uuid;
      v_reason := btrim(coalesce(v_item->>'reason', ''));
      if v_student is null then raise exception 'Student was not found.'; end if;
      if v_outcome not in ('PROMOTE', 'RETAIN', 'TRANSFER', 'GRADUATE', 'EXCLUDE') then
        raise exception 'Choose a valid progression outcome.';
      end if;
      if v_outcome = 'EXCLUDE' then
        v_excluded := v_excluded + 1;
        continue;
      end if;

      select * into v_stu from public.sch_students where id = v_student and business_unit_id = v_bu for update;
      if not found then raise exception 'Student was not found.'; end if;
      if v_stu.status <> 'active' then raise exception 'Student is not currently enrolled.'; end if;

      select * into v_enr
      from public.sch_student_enrollments
      where student_id = v_student
        and academic_year_id = p_from_year_id
        and status = 'active'
      for update;
      if not found then raise exception 'No active enrollment in the current year.'; end if;

      if v_outcome = 'GRADUATE' then
        update public.sch_student_enrollments
        set status = 'completed', ended_on = p_effective_on
        where id = v_enr.id;
        update public.sch_students set status = 'inactive' where id = v_student;
        insert into public.sch_placement_events (
          business_unit_id, student_id, event_kind, from_enrollment_id, from_year_id, to_year_id,
          from_class_id, from_stream_id, effective_on, reason, request_id, recorded_by
        ) values (
          v_bu, v_student, 'GRADUATE', v_enr.id, p_from_year_id, p_to_year_id,
          v_enr.class_id, v_enr.stream_id, p_effective_on, v_reason, gen_random_uuid(), p_actor_id
        );
        v_graduated := v_graduated + 1;
        continue;
      end if;

      if v_class is null or v_level is null then raise exception 'Select a destination class.'; end if;
      select * into v_cls from public.sch_classes where id = v_class and business_unit_id = v_bu;
      if not found or not v_cls.is_active then raise exception 'Destination class is not active.'; end if;
      if v_cls.level_id <> v_level then raise exception 'Destination class does not belong to that level.'; end if;
      if v_stream is not null and not exists (
        select 1 from public.sch_class_streams s
        where s.id = v_stream and s.class_id = v_class and s.is_active and s.business_unit_id = v_bu
      ) then
        raise exception 'Destination stream is not valid.';
      end if;

      if exists (
        select 1 from public.sch_student_enrollments
        where student_id = v_student and academic_year_id = p_to_year_id and status = 'active'
      ) then
        raise exception 'Student already has an active enrollment in the target year.';
      end if;

      update public.sch_student_enrollments
      set status = 'completed', ended_on = p_effective_on
      where id = v_enr.id;

      insert into public.sch_student_enrollments (
        business_unit_id, student_id, academic_year_id, class_id, stream_id, status, started_on
      )
      values (v_bu, v_student, p_to_year_id, v_class, v_stream, 'active', p_effective_on)
      returning id into v_new;

      perform public.sch_ensure_tuition_for_enrollment(v_bu, v_student, v_new, p_to_year_id, v_class);

      insert into public.sch_placement_events (
        business_unit_id, student_id, event_kind, from_enrollment_id, to_enrollment_id,
        from_year_id, to_year_id, from_class_id, to_class_id, from_stream_id, to_stream_id,
        from_level_id, to_level_id, effective_on, reason, request_id, recorded_by
      ) values (
        v_bu, v_student,
        case v_outcome when 'RETAIN' then 'RETAIN' when 'TRANSFER' then 'TRANSFER' else 'PROMOTE' end,
        v_enr.id, v_new, p_from_year_id, p_to_year_id, v_enr.class_id, v_class, v_enr.stream_id, v_stream,
        v_cls.level_id, v_level, p_effective_on, v_reason, gen_random_uuid(), p_actor_id
      );

      if v_outcome = 'RETAIN' then v_retained := v_retained + 1;
      elsif v_outcome = 'TRANSFER' then v_transferred := v_transferred + 1;
      else v_promoted := v_promoted + 1;
      end if;
    exception
      when others then
        v_failed := v_failed + 1;
        v_failures := v_failures || jsonb_build_object(
          'studentId', coalesce(v_item->>'studentId', ''),
          'error', SQLERRM
        );
    end;
  end loop;

  insert into public.sch_promotion_runs (
    business_unit_id, from_year_id, to_year_id, status,
    promoted_count, retained_count, transferred_count, graduated_count, excluded_count, failed_count,
    request_id, recorded_by
  )
  values (
    v_bu, p_from_year_id, p_to_year_id, 'confirmed',
    v_promoted, v_retained, v_transferred, v_graduated, v_excluded, v_failed,
    p_request_id, p_actor_id
  )
  returning id into v_run;

  return jsonb_build_object(
    'id', v_run,
    'duplicate', false,
    'promoted', v_promoted,
    'retained', v_retained,
    'transferred', v_transferred,
    'graduated', v_graduated,
    'excluded', v_excluded,
    'failed', v_failed,
    'failures', v_failures
  );
end;
$$;

grant execute on function public.sch_ensure_tuition_for_enrollment(uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_cancel_admission(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.sch_withdraw_student(uuid, date, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_change_student_class(uuid, uuid, uuid, uuid, uuid, date, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_apply_promotion_run(uuid, uuid, jsonb, date, uuid, uuid) to authenticated, service_role;

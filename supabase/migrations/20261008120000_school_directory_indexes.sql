-- Targeted indexes for Students / Parents directory filters and dashboard fee totals.

create index if not exists sch_enrollments_bu_status_stream_idx
  on public.sch_student_enrollments (business_unit_id, status, stream_id);

create index if not exists sch_student_guardians_bu_guardian_idx
  on public.sch_student_guardians (business_unit_id, guardian_id);

create index if not exists sch_student_guardians_bu_student_idx
  on public.sch_student_guardians (business_unit_id, student_id);

do $$
begin
  if to_regclass('public.sch_fee_payments') is not null then
    execute 'create index if not exists sch_fee_payments_bu_status_idx on public.sch_fee_payments (business_unit_id, status)';
  end if;
end
$$;

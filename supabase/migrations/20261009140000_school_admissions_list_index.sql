-- Speeds Admissions list ordering without changing data.

create index if not exists sch_admissions_bu_created_idx
  on public.sch_admissions (business_unit_id, created_at desc);

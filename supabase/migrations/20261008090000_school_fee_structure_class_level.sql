-- Ensure a fee structure's class belongs to the selected level in the same school.

create or replace function public.sch_fee_structures_match_class_level()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.sch_classes c
    where c.id = new.class_id
      and c.business_unit_id = new.business_unit_id
      and c.level_id = new.level_id
  ) then
    raise exception 'Fee structure class must belong to the selected level'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists sch_fee_structures_match_class_level on public.sch_fee_structures;
create trigger sch_fee_structures_match_class_level
  before insert or update of class_id, level_id, business_unit_id
  on public.sch_fee_structures
  for each row
  execute function public.sch_fee_structures_match_class_level();

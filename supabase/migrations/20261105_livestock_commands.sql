-- Livestock stock commands. Each function locks the farm, writes one source row, and one movement.

create or replace function public.ls_opening(p_bu uuid, p_user uuid, p_type uuid, p_qty integer, p_date date, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_date is null then raise exception 'Date is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  insert into ls_openings (business_unit_id, animal_type_id, opening_code, quantity, opening_date, notes, created_by)
  values (p_bu, p_type, ls_next_code(p_bu, 'OPEN'), p_qty, p_date, coalesce(p_notes, ''), p_user)
  returning id into new_id;
  perform ls_move(p_bu, p_type, p_date, 'Opening Stock', p_qty, 0, 'opening', new_id, p_notes, p_user);
  return new_id;
end;
$$;

create or replace function public.ls_purchase(
  p_bu uuid, p_user uuid, p_type uuid, p_qty integer, p_date date, p_unit numeric, p_total numeric, p_seller text, p_notes text, p_paid numeric, p_pay_date date, p_method text, p_request text
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
declare expense_id uuid;
declare cost numeric;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_date is null then raise exception 'Purchase date is required'; end if;
  cost := case when p_unit is not null and p_unit >= 0 then round(p_qty * p_unit, 2) else round(coalesce(p_total, 0), 2) end;
  if cost < 0 then raise exception 'Purchase cost must be a valid amount'; end if;
  if cost = 0 and coalesce(p_total, 0) = 0 and p_unit is null then cost := 0; end if;
  if coalesce(p_paid, 0) < 0 or coalesce(p_paid, 0) > cost then raise exception 'Payment cannot exceed the purchase cost'; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  insert into ls_purchases (business_unit_id, animal_type_id, purchase_code, quantity, purchase_date, unit_price, total_cost, seller_name, notes, created_by)
  values (p_bu, p_type, ls_next_code(p_bu, 'PUR'), p_qty, p_date, p_unit, cost, coalesce(p_seller, ''), coalesce(p_notes, ''), p_user)
  returning id into new_id;
  if cost > 0 then
    insert into ls_expenses (business_unit_id, expense_code, expense_date, category, description, amount, animal_type_id, purchase_id, vendor_name, notes, created_by)
    values (p_bu, ls_next_code(p_bu, 'EXP'), p_date, 'Livestock Purchase', 'Livestock purchase ' || (select purchase_code from ls_purchases where id = new_id), cost, p_type, new_id, coalesce(p_seller, ''), coalesce(p_notes, ''), p_user)
    returning id into expense_id;
    if coalesce(p_paid, 0) > 0 then
      if p_request is null or length(trim(p_request)) = 0 then raise exception 'Payment could not be identified'; end if;
      insert into ls_expense_payments (business_unit_id, expense_id, amount, payment_date, payment_method, request_key, created_by)
      values (p_bu, expense_id, p_paid, coalesce(p_pay_date, p_date), coalesce(p_method, 'Cash'), p_request, p_user);
      update ls_expenses set status = case when p_paid + 0.001 < cost then 'Partially Paid' else 'Paid' end where id = expense_id;
    end if;
  end if;
  perform ls_move(p_bu, p_type, p_date, 'Purchase', p_qty, 0, 'purchase', new_id, p_notes, p_user);
  return new_id;
end;
$$;

create or replace function public.ls_purchase_cancel(p_bu uuid, p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare row ls_purchases%rowtype;
declare expense ls_expenses%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  select * into row from ls_purchases where id = p_id and business_unit_id = p_bu for update;
  if row.id is null then raise exception 'Purchase not found'; end if;
  if row.status = 'Cancelled' then raise exception 'This purchase is already cancelled'; end if;
  update ls_purchases set status = 'Cancelled' where id = row.id;
  perform ls_move(p_bu, row.animal_type_id, current_date, 'Purchase', 0, row.quantity, 'purchase_reversal', row.id, 'Purchase cancelled', p_user);
  select * into expense from ls_expenses where purchase_id = row.id;
  if expense.id is not null then
    update ls_expense_payments set status = 'Reversed' where expense_id = expense.id and status = 'Completed';
    update ls_expenses set status = 'Cancelled' where id = expense.id;
  end if;
end;
$$;

create or replace function public.ls_pregnancy(p_bu uuid, p_user uuid, p_type uuid, p_qty integer, p_date date, p_expected date, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
declare stock integer;
declare pregnant integer;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Number of pregnant animals must be greater than zero'; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  stock := ls_on_hand(p_bu, p_type);
  pregnant := ls_pregnant_count(p_bu, p_type);
  if pregnant + p_qty > stock then raise exception 'Pregnant animals cannot exceed the animals in stock'; end if;
  insert into ls_pregnancies (business_unit_id, animal_type_id, pregnancy_code, quantity, pregnancy_date, expected_date, notes, created_by)
  values (p_bu, p_type, ls_next_code(p_bu, 'PRG'), p_qty, p_date, p_expected, coalesce(p_notes, ''), p_user)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.ls_pregnancy_cancel(p_bu uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare row ls_pregnancies%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  select * into row from ls_pregnancies where id = p_id and business_unit_id = p_bu for update;
  if row.id is null then raise exception 'Pregnancy record not found'; end if;
  if row.status = 'Cancelled' then raise exception 'This pregnancy record is already cancelled'; end if;
  if ls_pregnant_count(p_bu, row.animal_type_id) - row.quantity < 0 then
    raise exception 'Births already use these pregnant animals. Cancel the birth first.';
  end if;
  update ls_pregnancies set status = 'Cancelled' where id = row.id;
end;
$$;

create or replace function public.ls_birth(p_bu uuid, p_user uuid, p_type uuid, p_mothers integer, p_offspring integer, p_date date, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_mothers is null or p_mothers <= 0 then raise exception 'Number of mothers delivered must be greater than zero'; end if;
  if p_offspring is null or p_offspring <= 0 then raise exception 'Number of offspring born must be greater than zero'; end if;
  if p_date is null then raise exception 'Birth date is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  if p_mothers > ls_pregnant_count(p_bu, p_type) then raise exception 'Mothers delivered cannot exceed the animals recorded as pregnant'; end if;
  insert into ls_births (business_unit_id, animal_type_id, birth_code, mothers, offspring, birth_date, notes, created_by)
  values (p_bu, p_type, ls_next_code(p_bu, 'BIR'), p_mothers, p_offspring, p_date, coalesce(p_notes, ''), p_user)
  returning id into new_id;
  perform ls_move(p_bu, p_type, p_date, 'Birth', p_offspring, 0, 'birth', new_id, p_notes, p_user);
  return new_id;
end;
$$;

create or replace function public.ls_birth_cancel(p_bu uuid, p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare row ls_births%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  select * into row from ls_births where id = p_id and business_unit_id = p_bu for update;
  if row.id is null then raise exception 'Birth record not found'; end if;
  if row.status = 'Cancelled' then raise exception 'This birth is already cancelled'; end if;
  update ls_births set status = 'Cancelled' where id = row.id;
  perform ls_move(p_bu, row.animal_type_id, current_date, 'Birth', 0, row.offspring, 'birth_reversal', row.id, 'Birth cancelled', p_user);
end;
$$;

create or replace function public.ls_death(p_bu uuid, p_user uuid, p_type uuid, p_qty integer, p_date date, p_reason text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_date is null then raise exception 'Death date is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  if p_qty > ls_on_hand(p_bu, p_type) then raise exception 'Deaths cannot exceed the animals in stock'; end if;
  insert into ls_deaths (business_unit_id, animal_type_id, death_code, quantity, death_date, reason, notes, created_by)
  values (p_bu, p_type, ls_next_code(p_bu, 'DTH'), p_qty, p_date, coalesce(p_reason, ''), coalesce(p_notes, ''), p_user)
  returning id into new_id;
  perform ls_move(p_bu, p_type, p_date, 'Death', 0, p_qty, 'death', new_id, p_notes, p_user);
  return new_id;
end;
$$;

create or replace function public.ls_adjustment(p_bu uuid, p_user uuid, p_type uuid, p_direction text, p_qty integer, p_date date, p_reason text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_direction not in ('Increase', 'Decrease') then raise exception 'Select an adjustment direction'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_date is null then raise exception 'Date is required'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'An adjustment reason is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  if p_direction = 'Decrease' and p_qty > ls_on_hand(p_bu, p_type) then raise exception 'Adjustment cannot reduce stock below zero'; end if;
  insert into ls_adjustments (business_unit_id, animal_type_id, adjustment_code, direction, quantity, adjustment_date, reason, notes, created_by)
  values (p_bu, p_type, ls_next_code(p_bu, 'ADJ'), p_direction, p_qty, p_date, trim(p_reason), coalesce(p_notes, ''), p_user)
  returning id into new_id;
  perform ls_move(p_bu, p_type, p_date, 'Adjustment', case when p_direction = 'Increase' then p_qty else 0 end, case when p_direction = 'Decrease' then p_qty else 0 end, 'adjustment', new_id, p_reason, p_user);
  return new_id;
end;
$$;

create or replace function public.ls_sale(
  p_bu uuid, p_user uuid, p_type uuid, p_qty integer, p_date date, p_unit numeric, p_buyer text, p_notes text, p_paid numeric, p_pay_date date, p_method text, p_request text
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
declare total numeric;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity sold must be greater than zero'; end if;
  if p_date is null then raise exception 'Sale date is required'; end if;
  if p_unit is null or p_unit < 0 then raise exception 'Unit selling price must be a valid amount'; end if;
  total := round(p_qty * p_unit, 2);
  if coalesce(p_paid, 0) < 0 or coalesce(p_paid, 0) > total then raise exception 'Payment cannot exceed the sale total'; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  if p_qty > ls_on_hand(p_bu, p_type) then raise exception 'Not enough animals in stock'; end if;
  insert into ls_sales (business_unit_id, animal_type_id, sale_code, quantity, sale_date, unit_price, total_amount, buyer_name, notes, status, created_by)
  values (p_bu, p_type, ls_next_code(p_bu, 'SALE'), p_qty, p_date, p_unit, total, coalesce(p_buyer, ''), coalesce(p_notes, ''), case when coalesce(p_paid, 0) <= 0 then 'Unpaid' when p_paid + 0.001 < total then 'Partially Paid' else 'Paid' end, p_user)
  returning id into new_id;
  perform ls_move(p_bu, p_type, p_date, 'Sale', 0, p_qty, 'sale', new_id, p_notes, p_user);
  if coalesce(p_paid, 0) > 0 then
    if p_request is null or length(trim(p_request)) = 0 then raise exception 'Payment could not be identified'; end if;
    insert into ls_sale_payments (business_unit_id, sale_id, amount, payment_date, payment_method, request_key, created_by)
    values (p_bu, new_id, p_paid, coalesce(p_pay_date, p_date), coalesce(p_method, 'Cash'), p_request, p_user);
  end if;
  return new_id;
end;
$$;

create or replace function public.ls_sale_pay(p_bu uuid, p_user uuid, p_sale uuid, p_amount numeric, p_date date, p_method text, p_request text)
returns void language plpgsql security definer set search_path = public as $$
declare row ls_sales%rowtype;
declare received numeric;
begin
  if p_request is null or length(trim(p_request)) = 0 then raise exception 'Payment could not be identified'; end if;
  if exists (select 1 from ls_sale_payments where request_key = p_request) then return; end if;
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  select * into row from ls_sales where id = p_sale and business_unit_id = p_bu for update;
  if row.id is null or row.status = 'Cancelled' then raise exception 'Sale not found'; end if;
  select coalesce(sum(amount), 0) into received from ls_sale_payments where sale_id = row.id and status = 'Completed';
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if received + p_amount > row.total_amount + 0.001 then raise exception 'Payment cannot exceed the outstanding balance'; end if;
  insert into ls_sale_payments (business_unit_id, sale_id, amount, payment_date, payment_method, request_key, created_by)
  values (p_bu, row.id, p_amount, p_date, coalesce(p_method, 'Cash'), p_request, p_user);
  received := received + p_amount;
  update ls_sales set status = case when received + 0.001 < total_amount then 'Partially Paid' else 'Paid' end where id = row.id;
end;
$$;

create or replace function public.ls_sale_cancel(p_bu uuid, p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare row ls_sales%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_bu::text || ':livestock'));
  select * into row from ls_sales where id = p_id and business_unit_id = p_bu for update;
  if row.id is null then raise exception 'Sale not found'; end if;
  if row.status = 'Cancelled' then raise exception 'This sale is already cancelled'; end if;
  update ls_sales set status = 'Cancelled' where id = row.id;
  update ls_sale_payments set status = 'Reversed' where sale_id = row.id and status = 'Completed';
  perform ls_move(p_bu, row.animal_type_id, current_date, 'Sale', row.quantity, 0, 'sale_reversal', row.id, 'Sale cancelled', p_user);
end;
$$;

create or replace function public.ls_expense_pay(p_bu uuid, p_user uuid, p_expense uuid, p_amount numeric, p_date date, p_method text, p_request text)
returns void language plpgsql security definer set search_path = public as $$
declare row ls_expenses%rowtype;
declare received numeric;
begin
  if p_request is null or length(trim(p_request)) = 0 then raise exception 'Payment could not be identified'; end if;
  if exists (select 1 from ls_expense_payments where request_key = p_request) then return; end if;
  select * into row from ls_expenses where id = p_expense and business_unit_id = p_bu for update;
  if row.id is null or row.status = 'Cancelled' then raise exception 'Expense not found'; end if;
  select coalesce(sum(amount), 0) into received from ls_expense_payments where expense_id = row.id and status = 'Completed';
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if received + p_amount > row.amount + 0.001 then raise exception 'Payment cannot exceed the outstanding balance'; end if;
  insert into ls_expense_payments (business_unit_id, expense_id, amount, payment_date, payment_method, request_key, created_by)
  values (p_bu, row.id, p_amount, p_date, coalesce(p_method, 'Cash'), p_request, p_user);
  received := received + p_amount;
  update ls_expenses set status = case when received + 0.001 < amount then 'Partially Paid' else 'Paid' end where id = row.id;
end;
$$;

create or replace function public.ls_rental_pay(p_bu uuid, p_user uuid, p_rental uuid, p_amount numeric, p_date date, p_method text, p_request text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_request is null or length(trim(p_request)) = 0 then raise exception 'Payment could not be identified'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_date is null then raise exception 'Payment date is required'; end if;
  if exists (select 1 from ls_rental_payments where request_key = p_request) then return; end if;
  if not exists (select 1 from ls_rentals where id = p_rental and business_unit_id = p_bu) then raise exception 'Rental not found'; end if;
  insert into ls_rental_payments (business_unit_id, rental_id, amount, payment_date, payment_method, request_key, created_by)
  values (p_bu, p_rental, p_amount, p_date, coalesce(p_method, 'Cash'), p_request, p_user);
end;
$$;

revoke all on function public.ls_on_hand(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ls_pregnant_count(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ls_next_code(uuid, text) from public, anon, authenticated;
revoke all on function public.ls_move(uuid, uuid, date, text, integer, integer, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.ls_opening(uuid, uuid, uuid, integer, date, text) from public, anon, authenticated;
revoke all on function public.ls_purchase(uuid, uuid, uuid, integer, date, numeric, numeric, text, text, numeric, date, text, text) from public, anon, authenticated;
revoke all on function public.ls_purchase_cancel(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ls_pregnancy(uuid, uuid, uuid, integer, date, date, text) from public, anon, authenticated;
revoke all on function public.ls_pregnancy_cancel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ls_birth(uuid, uuid, uuid, integer, integer, date, text) from public, anon, authenticated;
revoke all on function public.ls_birth_cancel(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ls_death(uuid, uuid, uuid, integer, date, text, text) from public, anon, authenticated;
revoke all on function public.ls_adjustment(uuid, uuid, uuid, text, integer, date, text, text) from public, anon, authenticated;
revoke all on function public.ls_sale(uuid, uuid, uuid, integer, date, numeric, text, text, numeric, date, text, text) from public, anon, authenticated;
revoke all on function public.ls_sale_pay(uuid, uuid, uuid, numeric, date, text, text) from public, anon, authenticated;
revoke all on function public.ls_sale_cancel(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ls_expense_pay(uuid, uuid, uuid, numeric, date, text, text) from public, anon, authenticated;
revoke all on function public.ls_rental_pay(uuid, uuid, uuid, numeric, date, text, text) from public, anon, authenticated;

grant execute on function public.ls_on_hand(uuid, uuid) to service_role;
grant execute on function public.ls_pregnant_count(uuid, uuid) to service_role;
grant execute on function public.ls_next_code(uuid, text) to service_role;
grant execute on function public.ls_move(uuid, uuid, date, text, integer, integer, text, uuid, text, uuid) to service_role;
grant execute on function public.ls_opening(uuid, uuid, uuid, integer, date, text) to service_role;
grant execute on function public.ls_purchase(uuid, uuid, uuid, integer, date, numeric, numeric, text, text, numeric, date, text, text) to service_role;
grant execute on function public.ls_purchase_cancel(uuid, uuid, uuid) to service_role;
grant execute on function public.ls_pregnancy(uuid, uuid, uuid, integer, date, date, text) to service_role;
grant execute on function public.ls_pregnancy_cancel(uuid, uuid) to service_role;
grant execute on function public.ls_birth(uuid, uuid, uuid, integer, integer, date, text) to service_role;
grant execute on function public.ls_birth_cancel(uuid, uuid, uuid) to service_role;
grant execute on function public.ls_death(uuid, uuid, uuid, integer, date, text, text) to service_role;
grant execute on function public.ls_adjustment(uuid, uuid, uuid, text, integer, date, text, text) to service_role;
grant execute on function public.ls_sale(uuid, uuid, uuid, integer, date, numeric, text, text, numeric, date, text, text) to service_role;
grant execute on function public.ls_sale_pay(uuid, uuid, uuid, numeric, date, text, text) to service_role;
grant execute on function public.ls_sale_cancel(uuid, uuid, uuid) to service_role;
grant execute on function public.ls_expense_pay(uuid, uuid, uuid, numeric, date, text, text) to service_role;
grant execute on function public.ls_rental_pay(uuid, uuid, uuid, numeric, date, text, text) to service_role;

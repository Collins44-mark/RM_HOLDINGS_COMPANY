-- Name printed on the supermarket receipt. Empty until set in Supermarket Settings.

alter table public.business_units
  add column if not exists receipt_store_name text,
  add column if not exists receipt_location text,
  add column if not exists receipt_mobile text,
  add column if not exists receipt_tin text,
  add column if not exists receipt_email text,
  add column if not exists receipt_thanks text;

comment on column public.business_units.receipt_store_name is
  'Customer-facing store name printed on receipts. Empty until set in module settings.';
comment on column public.business_units.receipt_location is
  'Receipt address. Empty lines are omitted from the receipt.';
comment on column public.business_units.receipt_mobile is
  'Receipt mobile number. Empty lines are omitted from the receipt.';
comment on column public.business_units.receipt_tin is
  'Receipt TIN. Empty lines are omitted from the receipt.';
comment on column public.business_units.receipt_email is
  'Receipt email. Empty lines are omitted from the receipt.';
comment on column public.business_units.receipt_thanks is
  'Receipt closing line. Empty lines are omitted from the receipt.';

grant update (
  receipt_store_name,
  receipt_location,
  receipt_mobile,
  receipt_tin,
  receipt_email,
  receipt_thanks
) on table public.business_units to authenticated, service_role;

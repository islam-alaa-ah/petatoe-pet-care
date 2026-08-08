begin;

-- Phase M14.9.8.16.9.2 — Scheduling Audit Customer Name Hotfix
-- Root cause: the business activity trigger introduced in Phase M14.9.8.16.8
-- queried public.customers.name, while the canonical customer column is
-- public.customers.customer_name. Every successful schedule update fired that
-- trigger, so the transaction failed after the scheduling RPC reached the
-- installation_requests UPDATE.

create or replace function public.capture_business_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  b jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  uid uuid := auth.uid();
  cid uuid;
  cname text;
  display_name text;
  section text;
  req text;
  quote text;
  inv text;
  rep uuid;
begin
  if uid is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  begin
    cid := nullif(r ->> 'customer_id', '')::uuid;
  exception when others then
    cid := null;
  end;

  if tg_table_name = 'customers' then
    cid := nullif(r ->> 'id', '')::uuid;
    cname := coalesce(nullif(r ->> 'customer_name', ''), nullif(r ->> 'name', ''));
    section := 'customers';
  elsif tg_table_name = 'customer_followups' then
    section := 'followups';
    select c.customer_name into cname from public.customers c where c.id = cid;
  elsif tg_table_name = 'quotations' then
    section := 'quotations';
    select c.customer_name into cname from public.customers c where c.id = cid;
    quote := coalesce(r ->> 'quotation_number', r ->> 'number');
  elsif tg_table_name = 'installation_requests' then
    section := 'installations';
    select c.customer_name into cname from public.customers c where c.id = cid;
    req := r ->> 'request_number';
    quote := r ->> 'quotation_number';
  elsif tg_table_name = 'sales_invoices' then
    section := 'invoices';
    select c.customer_name into cname from public.customers c where c.id = cid;
    req := r ->> 'request_number';
    inv := r ->> 'invoice_number';
  else
    section := tg_table_name;
  end if;

  display_name := coalesce(
    nullif(cname, ''),
    nullif(req, ''),
    nullif(quote, ''),
    nullif(inv, ''),
    nullif(r ->> 'customer_name', ''),
    nullif(r ->> 'name', ''),
    nullif(r ->> 'title', ''),
    nullif(r ->> 'full_name', ''),
    r ->> 'id'
  );

  select nullif(to_jsonb(up) ->> 'representative_id', '')::uuid
  into rep
  from public.user_profiles up
  where up.id = uid
  limit 1;

  insert into public.business_activity_events(
    user_id,
    representative_id,
    event_type,
    section_key,
    action_key,
    entity_type,
    entity_id,
    entity_display_name,
    customer_id,
    customer_name,
    request_number,
    quotation_number,
    invoice_number,
    before_data,
    after_data
  ) values (
    uid,
    rep,
    'data_change',
    section,
    lower(tg_op),
    tg_table_name,
    coalesce(r ->> 'id', ''),
    display_name,
    cid,
    cname,
    req,
    quote,
    inv,
    b,
    case when tg_op = 'DELETE' then null else r end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

comment on function public.capture_business_activity_event() is
'Captures business audit events using the canonical customers.customer_name column. Fixed in Phase M14.9.8.16.9.2 to prevent scheduling transactions from failing with column "name" does not exist.';

commit;

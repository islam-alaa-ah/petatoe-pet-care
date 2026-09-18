-- PETATOE P5.13.8.72 R44R38R20 — Appointment Historical Data Import Foundation
-- Scope:
--   1) Register a dedicated "رفع البيانات" screen under Appointment Management.
--   2) Store historical sales rows in an append-only historical ledger, separate from operational invoices.
--   3) Provide authoritative server-side validation, duplicate prevention, batch audit, and failed-row retention.
--   4) Preserve raw legacy values while optionally linking exact current service/car matches.
-- Historical-data rules approved for this phase:
--   * Item name may be blank / "غير محدد" and is accepted as a historical unspecified item.
--   * VAT may be zero; when VAT=0, before-tax amount must equal VAT-inclusive amount (within tolerance).
--   * When VAT>0, before-tax + VAT must equal VAT-inclusive amount (within tolerance).
--   * Month is a verification field; business date remains the authoritative date.
--   * Customer name is stored as a historical snapshot only; no unsafe customer-name merge is performed.
--   * Existing operational sales_invoices / appointments are NOT backfilled or modified.
-- Safety:
--   No DELETE / DROP / TRUNCATE. No existing RLS widening. No Offline/Sync changes. No historical migration edits.

begin;

-- -----------------------------------------------------------------------------
-- Screen / permissions
-- -----------------------------------------------------------------------------
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('appointmentDataImport','رفع البيانات','إدارة المواعيد',73,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select distinct
  rsp.role,
  'appointmentDataImport',
  (rsp.role='super_admin'),
  (rsp.role='super_admin'),
  false,
  false,
  (rsp.role='super_admin')
from public.role_screen_permissions rsp
on conflict(role,screen_key) do nothing;

-- -----------------------------------------------------------------------------
-- Append-only historical import storage
-- -----------------------------------------------------------------------------
create table if not exists public.appointment_historical_sales_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text,
  status text not null default 'processing' check(status in ('processing','completed','partial','failed')),
  total_rows integer not null default 0 check(total_rows>=0),
  inserted_rows integer not null default 0 check(inserted_rows>=0),
  duplicate_rows integer not null default 0 check(duplicate_rows>=0),
  rejected_rows integer not null default 0 check(rejected_rows>=0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_appointment_hist_import_batches_created
  on public.appointment_historical_sales_import_batches(created_at desc);

create table if not exists public.appointment_historical_sales_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.appointment_historical_sales_import_batches(id) on delete restrict,
  source_row_no integer not null check(source_row_no>0),
  source_fingerprint text not null,
  item_name_raw text,
  item_name_display text not null,
  item_is_unspecified boolean not null default false,
  service_type_id uuid references public.installation_service_types(id) on delete set null,
  vehicle_raw text,
  appointment_car_id uuid references public.appointment_cars(id) on delete set null,
  sales_date date not null,
  source_month text,
  invoice_number text not null,
  customer_name text not null,
  unit_price numeric(14,2) not null check(unit_price>=0),
  quantity numeric(14,3) not null check(quantity>0),
  discount_amount numeric(14,2) not null default 0 check(discount_amount>=0),
  tax_amount numeric(14,2) not null default 0 check(tax_amount>=0),
  sales_inclusive numeric(14,2) not null check(sales_inclusive>=0),
  sales_before_tax numeric(14,2) not null check(sales_before_tax>=0),
  payment_method text not null,
  validation_warnings jsonb not null default '[]'::jsonb check(jsonb_typeof(validation_warnings)='array'),
  original_row jsonb not null default '{}'::jsonb check(jsonb_typeof(original_row)='object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique(source_fingerprint)
);

create index if not exists idx_appointment_hist_sales_date
  on public.appointment_historical_sales_rows(sales_date desc);
create index if not exists idx_appointment_hist_sales_invoice
  on public.appointment_historical_sales_rows(invoice_number);
create index if not exists idx_appointment_hist_sales_car
  on public.appointment_historical_sales_rows(appointment_car_id,sales_date desc);
create index if not exists idx_appointment_hist_sales_batch
  on public.appointment_historical_sales_rows(batch_id,source_row_no);

create table if not exists public.appointment_historical_sales_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.appointment_historical_sales_import_batches(id) on delete restrict,
  source_row_no integer not null check(source_row_no>0),
  error_codes jsonb not null default '[]'::jsonb check(jsonb_typeof(error_codes)='array'),
  warning_codes jsonb not null default '[]'::jsonb check(jsonb_typeof(warning_codes)='array'),
  source_data jsonb not null default '{}'::jsonb check(jsonb_typeof(source_data)='object'),
  created_at timestamptz not null default now()
);
create index if not exists idx_appointment_hist_import_errors_batch
  on public.appointment_historical_sales_import_errors(batch_id,source_row_no);

alter table public.appointment_historical_sales_import_batches enable row level security;
alter table public.appointment_historical_sales_rows enable row level security;
alter table public.appointment_historical_sales_import_errors enable row level security;

-- Read-only direct access. All writes go through the authoritative RPC.
do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='appointment_historical_sales_import_batches' and policyname='appointment historical import batches read') then
    create policy "appointment historical import batches read"
      on public.appointment_historical_sales_import_batches
      for select to authenticated
      using(public.has_screen_permission('appointmentDataImport','view'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='appointment_historical_sales_rows' and policyname='appointment historical sales rows read') then
    create policy "appointment historical sales rows read"
      on public.appointment_historical_sales_rows
      for select to authenticated
      using(public.has_screen_permission('appointmentDataImport','view') or public.has_screen_permission('installationReports','view'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='appointment_historical_sales_import_errors' and policyname='appointment historical import errors read') then
    create policy "appointment historical import errors read"
      on public.appointment_historical_sales_import_errors
      for select to authenticated
      using(public.has_screen_permission('appointmentDataImport','view'));
  end if;
end $$;

revoke all on public.appointment_historical_sales_import_batches,public.appointment_historical_sales_rows,public.appointment_historical_sales_import_errors from public,anon;
grant select on public.appointment_historical_sales_import_batches,public.appointment_historical_sales_rows,public.appointment_historical_sales_import_errors to authenticated;

-- -----------------------------------------------------------------------------
-- Normalization helpers
-- -----------------------------------------------------------------------------
create or replace function public.appointment_historical_import_numeric_r44r38r20(p_value text)
returns numeric
language plpgsql
immutable
set search_path=public
as $$
declare v text;
begin
  v:=translate(coalesce(p_value,''),'٠١٢٣٤٥٦٧٨٩','0123456789');
  v:=replace(v,',','');
  v:=regexp_replace(v,'[^0-9.\-]','','g');
  if v is null or btrim(v)='' or v='-' then return null; end if;
  return v::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.appointment_historical_import_month_r44r38r20(p_value text)
returns integer
language plpgsql
immutable
set search_path=public
as $$
declare v text; n integer;
begin
  v:=lower(btrim(translate(coalesce(p_value,''),'٠١٢٣٤٥٦٧٨٩','0123456789')));
  if v='' then return null; end if;
  begin
    n:=v::integer;
    if n between 1 and 12 then return n; end if;
  exception when others then null;
  end;
  v:=replace(replace(v,'أ','ا'),'إ','ا');
  return case
    when v in ('يناير','january','jan') then 1
    when v in ('فبراير','february','feb') then 2
    when v in ('مارس','march','mar') then 3
    when v in ('ابريل','أبريل','april','apr') then 4
    when v in ('مايو','may') then 5
    when v in ('يونيو','june','jun') then 6
    when v in ('يوليو','july','jul') then 7
    when v in ('اغسطس','أغسطس','august','aug') then 8
    when v in ('سبتمبر','september','sep','sept') then 9
    when v in ('اكتوبر','أكتوبر','october','oct') then 10
    when v in ('نوفمبر','november','nov') then 11
    when v in ('ديسمبر','december','dec') then 12
    else null end;
end;
$$;

-- Validate one normalized JSON row. Expected canonical JSON keys are supplied by the frontend Excel parser.
create or replace function public.appointment_historical_sales_validate_row_r44r38r20(
  p_row jsonb,
  p_source_row integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_item_raw text:=nullif(btrim(coalesce(p_row->>'itemName','')),'');
  v_item_display text;
  v_item_unspecified boolean:=false;
  v_service_id uuid;
  v_vehicle text:=nullif(btrim(coalesce(p_row->>'vehicle','')),'');
  v_car_id uuid;
  v_date date;
  v_month_raw text:=nullif(btrim(coalesce(p_row->>'month','')),'');
  v_month integer;
  v_invoice text:=nullif(btrim(coalesce(p_row->>'invoiceNumber','')),'');
  v_customer text:=nullif(btrim(coalesce(p_row->>'customer','')),'');
  v_unit numeric;
  v_qty numeric;
  v_discount numeric;
  v_tax numeric;
  v_gross numeric;
  v_net numeric;
  v_payment text:=nullif(btrim(coalesce(p_row->>'paymentMethod','')),'');
  v_errors jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_expected numeric;
  v_fingerprint text;
begin
  if p_source_row is null or p_source_row<1 then p_source_row:=1; end if;

  -- Date is authoritative.
  begin
    v_date:=nullif(p_row->>'date','')::date;
  exception when others then
    v_date:=null;
  end;
  if v_date is null then v_errors:=v_errors||jsonb_build_array('DATE_REQUIRED_OR_INVALID'); end if;

  if v_invoice is null then v_errors:=v_errors||jsonb_build_array('INVOICE_NUMBER_REQUIRED'); end if;
  if v_customer is null then
    v_customer:='عميل غير محدد — بيانات تاريخية';
    v_warnings:=v_warnings||jsonb_build_array('CUSTOMER_UNSPECIFIED');
  end if;
  if v_vehicle is null then
    v_vehicle:='غير محدد';
    v_warnings:=v_warnings||jsonb_build_array('VEHICLE_UNSPECIFIED');
  end if;
  if v_payment is null then
    v_payment:='غير محدد';
    v_warnings:=v_warnings||jsonb_build_array('PAYMENT_METHOD_UNSPECIFIED');
  end if;

  if v_item_raw is null or lower(v_item_raw) in ('غير محدد','غير معروف','unknown','n/a','na','-') then
    v_item_unspecified:=true;
    v_item_display:='صنف غير محدد — بيانات تاريخية';
    v_warnings:=v_warnings||jsonb_build_array('ITEM_UNSPECIFIED');
  else
    v_item_display:=v_item_raw;
    select st.id into v_service_id
    from public.installation_service_types st
    where st.is_active=true and lower(btrim(st.name))=lower(btrim(v_item_raw))
    order by st.created_at asc
    limit 1;
    if v_service_id is null then v_warnings:=v_warnings||jsonb_build_array('ITEM_NOT_IN_CURRENT_CATALOG'); end if;
  end if;

  select c.id into v_car_id
  from public.appointment_cars c
  where lower(btrim(c.name))=lower(btrim(v_vehicle))
     or (nullif(btrim(c.plate_number),'') is not null and lower(btrim(c.plate_number))=lower(btrim(v_vehicle)))
  order by c.created_at asc
  limit 1;
  if v_car_id is null and v_vehicle<>'غير محدد' then v_warnings:=v_warnings||jsonb_build_array('VEHICLE_NOT_MATCHED'); end if;

  v_unit:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'unitPrice');
  v_qty:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'quantity');
  v_discount:=coalesce(public.appointment_historical_import_numeric_r44r38r20(p_row->>'discount'),0);
  v_tax:=coalesce(public.appointment_historical_import_numeric_r44r38r20(p_row->>'tax'),0);
  v_gross:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'salesInclusive');
  v_net:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'salesBeforeTax');

  if v_unit is null or v_unit<0 then v_errors:=v_errors||jsonb_build_array('UNIT_PRICE_INVALID'); end if;
  if v_qty is null or v_qty<=0 then v_errors:=v_errors||jsonb_build_array('QUANTITY_INVALID'); end if;
  if v_discount<0 then v_errors:=v_errors||jsonb_build_array('DISCOUNT_INVALID'); end if;
  if v_tax<0 then v_errors:=v_errors||jsonb_build_array('TAX_INVALID'); end if;
  if v_gross is null or v_gross<0 then v_errors:=v_errors||jsonb_build_array('SALES_INCLUSIVE_INVALID'); end if;
  if v_net is null or v_net<0 then v_errors:=v_errors||jsonb_build_array('SALES_BEFORE_TAX_INVALID'); end if;

  if v_gross is not null and v_net is not null then
    if v_tax=0 then
      if abs(v_gross-v_net)>0.05 then v_errors:=v_errors||jsonb_build_array('ZERO_TAX_TOTAL_MISMATCH'); end if;
    elsif abs((v_net+v_tax)-v_gross)>0.05 then
      v_errors:=v_errors||jsonb_build_array('TAX_TOTAL_MISMATCH');
    end if;
  end if;

  if v_date is not null and v_month_raw is not null then
    v_month:=public.appointment_historical_import_month_r44r38r20(v_month_raw);
    if v_month is null then
      v_warnings:=v_warnings||jsonb_build_array('MONTH_UNRECOGNIZED');
    elsif v_month<>extract(month from v_date)::integer then
      v_errors:=v_errors||jsonb_build_array('MONTH_DATE_MISMATCH');
    end if;
  end if;

  -- Unit-price math is a warning only because legacy exports may allocate discounts differently.
  if v_unit is not null and v_qty is not null and v_net is not null then
    v_expected:=round(greatest((v_unit*v_qty)-v_discount,0),2);
    if abs(v_expected-v_net)>0.10 then v_warnings:=v_warnings||jsonb_build_array('UNIT_PRICE_MATH_MISMATCH'); end if;
  end if;

  v_fingerprint:=md5(concat_ws('|',
    coalesce(v_invoice,''),coalesce(v_date::text,''),lower(coalesce(v_vehicle,'')),p_source_row::text,
    lower(coalesce(v_item_display,'')),coalesce(round(v_gross,2)::text,''),coalesce(round(v_net,2)::text,''),
    coalesce(round(v_tax,2)::text,''),lower(coalesce(v_payment,''))
  ));

  return jsonb_build_object(
    'sourceRow',p_source_row,
    'valid',jsonb_array_length(v_errors)=0,
    'errors',v_errors,
    'warnings',v_warnings,
    'fingerprint',v_fingerprint,
    'normalized',jsonb_build_object(
      'itemNameRaw',v_item_raw,
      'itemNameDisplay',v_item_display,
      'itemUnspecified',v_item_unspecified,
      'serviceTypeId',v_service_id,
      'vehicle',v_vehicle,
      'carId',v_car_id,
      'date',v_date,
      'month',v_month_raw,
      'invoiceNumber',v_invoice,
      'customer',v_customer,
      'unitPrice',v_unit,
      'quantity',v_qty,
      'discount',round(v_discount,2),
      'tax',round(v_tax,2),
      'salesInclusive',round(v_gross,2),
      'salesBeforeTax',round(v_net,2),
      'paymentMethod',v_payment
    )
  );
end;
$$;

-- Preview validation: no writes.
create or replace function public.validate_appointment_historical_sales_r44r38r20(p_rows jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_row jsonb;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_seen text[]:=array[]::text[];
  v_fp text;
  v_valid integer:=0;
  v_errors integer:=0;
  v_duplicates integer:=0;
  v_total integer:=0;
  v_source integer;
begin
  if not public.has_screen_permission('appointmentDataImport','view') then raise exception 'permission_denied'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'APPOINTMENT_HISTORY_ROWS_INVALID'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total:=v_total+1;
    v_source:=coalesce(nullif(v_row->>'sourceRow','')::integer,v_total+1);
    v_result:=public.appointment_historical_sales_validate_row_r44r38r20(v_row,v_source);
    v_fp:=v_result->>'fingerprint';
    if v_fp=any(v_seen) or exists(select 1 from public.appointment_historical_sales_rows h where h.source_fingerprint=v_fp) then
      v_result:=jsonb_set(v_result,'{duplicate}','true'::jsonb,true);
      v_duplicates:=v_duplicates+1;
    else
      v_seen:=array_append(v_seen,v_fp);
      v_result:=jsonb_set(v_result,'{duplicate}','false'::jsonb,true);
      if coalesce((v_result->>'valid')::boolean,false) then v_valid:=v_valid+1; else v_errors:=v_errors+1; end if;
    end if;
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'summary',jsonb_build_object('total',v_total,'valid',v_valid,'errors',v_errors,'duplicates',v_duplicates),
    'rows',v_results
  );
end;
$$;

-- Authoritative append-only import. Valid non-duplicate rows are inserted; invalid rows are retained in the error ledger.
create or replace function public.import_appointment_historical_sales_r44r38r20(
  p_file_name text,
  p_file_sha256 text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_batch uuid;
  v_row jsonb;
  v_result jsonb;
  v_norm jsonb;
  v_fp text;
  v_seen text[]:=array[]::text[];
  v_source integer;
  v_total integer:=0;
  v_inserted integer:=0;
  v_duplicates integer:=0;
  v_rejected integer:=0;
  v_results jsonb:='[]'::jsonb;
begin
  if not public.has_screen_permission('appointmentDataImport','add') then raise exception 'permission_denied'; end if;
  if nullif(btrim(coalesce(p_file_name,'')),'') is null then raise exception 'APPOINTMENT_HISTORY_FILE_NAME_REQUIRED'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'APPOINTMENT_HISTORY_ROWS_REQUIRED'; end if;

  insert into public.appointment_historical_sales_import_batches(file_name,file_sha256,status,total_rows,created_by)
  values(btrim(p_file_name),nullif(btrim(coalesce(p_file_sha256,'')),''),'processing',jsonb_array_length(p_rows),auth.uid())
  returning id into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total:=v_total+1;
    v_source:=coalesce(nullif(v_row->>'sourceRow','')::integer,v_total+1);
    v_result:=public.appointment_historical_sales_validate_row_r44r38r20(v_row,v_source);
    v_fp:=v_result->>'fingerprint';

    if v_fp=any(v_seen) or exists(select 1 from public.appointment_historical_sales_rows h where h.source_fingerprint=v_fp) then
      v_duplicates:=v_duplicates+1;
      v_result:=jsonb_set(v_result,'{duplicate}','true'::jsonb,true);
    elsif not coalesce((v_result->>'valid')::boolean,false) then
      v_seen:=array_append(v_seen,v_fp);
      v_rejected:=v_rejected+1;
      insert into public.appointment_historical_sales_import_errors(batch_id,source_row_no,error_codes,warning_codes,source_data)
      values(v_batch,v_source,coalesce(v_result->'errors','[]'::jsonb),coalesce(v_result->'warnings','[]'::jsonb),v_row);
      v_result:=jsonb_set(v_result,'{duplicate}','false'::jsonb,true);
    else
      v_seen:=array_append(v_seen,v_fp);
      v_norm:=v_result->'normalized';
      insert into public.appointment_historical_sales_rows(
        batch_id,source_row_no,source_fingerprint,item_name_raw,item_name_display,item_is_unspecified,
        service_type_id,vehicle_raw,appointment_car_id,sales_date,source_month,invoice_number,customer_name,
        unit_price,quantity,discount_amount,tax_amount,sales_inclusive,sales_before_tax,payment_method,
        validation_warnings,original_row,created_by
      ) values(
        v_batch,v_source,v_fp,nullif(v_norm->>'itemNameRaw',''),v_norm->>'itemNameDisplay',coalesce((v_norm->>'itemUnspecified')::boolean,false),
        nullif(v_norm->>'serviceTypeId','')::uuid,v_norm->>'vehicle',nullif(v_norm->>'carId','')::uuid,(v_norm->>'date')::date,nullif(v_norm->>'month',''),
        v_norm->>'invoiceNumber',v_norm->>'customer',(v_norm->>'unitPrice')::numeric,(v_norm->>'quantity')::numeric,
        (v_norm->>'discount')::numeric,(v_norm->>'tax')::numeric,(v_norm->>'salesInclusive')::numeric,(v_norm->>'salesBeforeTax')::numeric,
        v_norm->>'paymentMethod',coalesce(v_result->'warnings','[]'::jsonb),v_row,auth.uid()
      );
      v_inserted:=v_inserted+1;
      v_result:=jsonb_set(v_result,'{duplicate}','false'::jsonb,true);
    end if;
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  update public.appointment_historical_sales_import_batches
  set inserted_rows=v_inserted,
      duplicate_rows=v_duplicates,
      rejected_rows=v_rejected,
      status=case when v_rejected>0 then 'partial' else 'completed' end,
      completed_at=now()
  where id=v_batch;

  return jsonb_build_object(
    'batchId',v_batch,
    'summary',jsonb_build_object('total',v_total,'inserted',v_inserted,'duplicates',v_duplicates,'rejected',v_rejected),
    'rows',v_results
  );
exception when others then
  if v_batch is not null then
    update public.appointment_historical_sales_import_batches set status='failed',completed_at=now() where id=v_batch;
  end if;
  raise;
end;
$$;

revoke all on function public.appointment_historical_import_numeric_r44r38r20(text) from public,anon;
revoke all on function public.appointment_historical_import_month_r44r38r20(text) from public,anon;
revoke all on function public.appointment_historical_sales_validate_row_r44r38r20(jsonb,integer) from public,anon;
revoke all on function public.validate_appointment_historical_sales_r44r38r20(jsonb) from public,anon;
revoke all on function public.import_appointment_historical_sales_r44r38r20(text,text,jsonb) from public,anon;
grant execute on function public.validate_appointment_historical_sales_r44r38r20(jsonb) to authenticated;
grant execute on function public.import_appointment_historical_sales_r44r38r20(text,text,jsonb) to authenticated;

-- Canonical read surface for reports / future integration. It does not mutate operational invoice tables.
create or replace view public.appointment_historical_sales_reporting
with (security_invoker=true)
as
select
  h.id,h.batch_id,h.source_row_no,h.item_name_display item_name,h.item_is_unspecified,h.service_type_id,
  h.vehicle_raw vehicle,h.appointment_car_id,h.sales_date,extract(year from h.sales_date)::integer sales_year,
  extract(month from h.sales_date)::integer sales_month,h.source_month,h.invoice_number,h.customer_name,
  h.unit_price,h.quantity,h.discount_amount,h.tax_amount,h.sales_inclusive,h.sales_before_tax,h.payment_method,
  h.validation_warnings,h.created_at
from public.appointment_historical_sales_rows h;
grant select on public.appointment_historical_sales_reporting to authenticated;

-- -----------------------------------------------------------------------------
-- Localization: same PetatoeLocalization architecture only.
-- -----------------------------------------------------------------------------
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  ('appointmentDataImport.nav','appointmentDataImport','appointments','nav','رفع البيانات','Data Import','رفع البيانات','Data Import',true,now()),
  ('appointmentDataImport.title','appointmentDataImport','appointments','title','رفع البيانات القديمة','Historical Data Import','رفع البيانات القديمة','Historical Data Import',true,now()),
  ('appointmentDataImport.note','appointmentDataImport','appointments','help','رفع بيانات المبيعات القديمة من Excel بعد فحصها ومنع التكرار.','Import historical sales data from Excel after validation and duplicate checks.','رفع بيانات المبيعات القديمة من Excel بعد فحصها ومنع التكرار.','Import historical sales data from Excel after validation and duplicate checks.',true,now()),
  ('appointmentDataImport.downloadTemplate','appointmentDataImport','appointments','button','تحميل نموذج Excel','Download Excel Template','تحميل نموذج Excel','Download Excel Template',true,now()),
  ('appointmentDataImport.chooseFile','appointmentDataImport','appointments','button','اختيار ملف Excel','Choose Excel File','اختيار ملف Excel','Choose Excel File',true,now()),
  ('appointmentDataImport.validate','appointmentDataImport','appointments','button','فحص الملف','Validate File','فحص الملف','Validate File',true,now()),
  ('appointmentDataImport.import','appointmentDataImport','appointments','button','بدء الاستيراد','Start Import','بدء الاستيراد','Start Import',true,now()),
  ('appointmentDataImport.failedExport','appointmentDataImport','appointments','button','تنزيل الصفوف الفاشلة','Download Failed Rows','تنزيل الصفوف الفاشلة','Download Failed Rows',true,now()),
  ('appointmentDataImport.rule.unspecifiedItem','appointmentDataImport','appointments','help','الصنف غير المحدد مقبول ويُحفظ كبيان تاريخي دون إنشاء صنف جديد.','Unspecified items are accepted as historical data without creating a new catalog item.','الصنف غير المحدد مقبول ويُحفظ كبيان تاريخي دون إنشاء صنف جديد.','Unspecified items are accepted as historical data without creating a new catalog item.',true,now()),
  ('appointmentDataImport.rule.zeroTax','appointmentDataImport','appointments','help','إذا كانت الضريبة صفرًا يجب أن يتساوى المبلغ قبل الضريبة مع المبلغ شامل الضريبة.','When tax is zero, before-tax and tax-inclusive totals must be equal.','إذا كانت الضريبة صفرًا يجب أن يتساوى المبلغ قبل الضريبة مع المبلغ شامل الضريبة.','When tax is zero, before-tax and tax-inclusive totals must be equal.',true,now()),
  ('appointmentDataImport.rule.month','appointmentDataImport','appointments','help','التاريخ هو المصدر الأساسي، وعمود الشهر يستخدم للتحقق فقط.','Date is authoritative; the month column is validation-only.','التاريخ هو المصدر الأساسي، وعمود الشهر يستخدم للتحقق فقط.','Date is authoritative; the month column is validation-only.',true,now()),
  ('appointmentDataImport.col.item','appointmentDataImport','appointments','table','اسم الصنف','Item Name','اسم الصنف','Item Name',true,now()),
  ('appointmentDataImport.col.vehicle','appointmentDataImport','appointments','table','السيارة','Vehicle','السيارة','Vehicle',true,now()),
  ('appointmentDataImport.col.date','appointmentDataImport','appointments','table','التاريخ','Date','التاريخ','Date',true,now()),
  ('appointmentDataImport.col.month','appointmentDataImport','appointments','table','الشهر','Month','الشهر','Month',true,now()),
  ('appointmentDataImport.col.invoice','appointmentDataImport','appointments','table','رقم الفاتورة','Invoice Number','رقم الفاتورة','Invoice Number',true,now()),
  ('appointmentDataImport.col.customer','appointmentDataImport','appointments','table','العميل','Customer','العميل','Customer',true,now()),
  ('appointmentDataImport.col.unitPrice','appointmentDataImport','appointments','table','سعر الوحدة','Unit Price','سعر الوحدة','Unit Price',true,now()),
  ('appointmentDataImport.col.quantity','appointmentDataImport','appointments','table','الكمية','Quantity','الكمية','Quantity',true,now()),
  ('appointmentDataImport.col.discount','appointmentDataImport','appointments','table','الخصم','Discount','الخصم','Discount',true,now()),
  ('appointmentDataImport.col.tax','appointmentDataImport','appointments','table','الضريبة','Tax','الضريبة','Tax',true,now()),
  ('appointmentDataImport.col.salesInclusive','appointmentDataImport','appointments','table','المبيعات شامل الضريبة','Sales incl. Tax','المبيعات شامل الضريبة','Sales incl. Tax',true,now()),
  ('appointmentDataImport.col.salesBeforeTax','appointmentDataImport','appointments','table','المبيعات قبل الضريبة','Sales before Tax','المبيعات قبل الضريبة','Sales before Tax',true,now()),
  ('appointmentDataImport.col.paymentMethod','appointmentDataImport','appointments','table','طريقة السداد','Payment Method','طريقة السداد','Payment Method',true,now()),
  ('pwa.update.release.r44r38r20.title','systemSettings','pwa','title','إضافة رفع البيانات التاريخية للمواعيد — R44R38R20','Add Appointment Historical Data Import — R44R38R20','إضافة رفع البيانات التاريخية للمواعيد — R44R38R20','Add Appointment Historical Data Import — R44R38R20',true,now()),
  ('pwa.update.release.r44r38r20.note1','systemSettings','pwa','note','إضافة سجل تاريخي مستقل لاستيراد مبيعات Excel القديمة دون تعديل فواتير التشغيل الحالية.','Adds an isolated historical ledger for importing legacy Excel sales without modifying current operational invoices.','إضافة سجل تاريخي مستقل لاستيراد مبيعات Excel القديمة دون تعديل فواتير التشغيل الحالية.','Adds an isolated historical ledger for importing legacy Excel sales without modifying current operational invoices.',true,now()),
  ('pwa.update.release.r44r38r20.note2','systemSettings','pwa','note','دعم الصنف غير المحدد والفواتير بدون ضريبة مع تحقق محاسبي ومنع تكرار على مستوى السطر.','Supports unspecified items and zero-tax invoices with accounting validation and line-level duplicate prevention.','دعم الصنف غير المحدد والفواتير بدون ضريبة مع تحقق محاسبي ومنع تكرار على مستوى السطر.','Supports unspecified items and zero-tax invoices with accounting validation and line-level duplicate prevention.',true,now()),
  ('pwa.update.release.r44r38r20.note3','systemSettings','pwa','note','لا تغيير على الفواتير الحالية أو Offline/Sync أو R44 Pruning؛ الاستيراد Append-only ومراجع بالكامل.','No changes to current invoices, Offline/Sync, or R44 Pruning; historical import is append-only and fully audited.','لا تغيير على الفواتير الحالية أو Offline/Sync أو R44 Pruning؛ الاستيراد Append-only ومراجع بالكامل.','No changes to current invoices, Offline/Sync, or R44 Pruning; historical import is append-only and fully audited.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,module_name=excluded.module_name,text_type=excluded.text_type,
  default_ar=excluded.default_ar,default_en=excluded.default_en,
  ar_text=case when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' then excluded.default_ar else public.app_translations.ar_text end,
  en_text=case when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' then excluded.default_en else public.app_translations.en_text end,
  is_active=true,updated_at=now();

commit;

-- -----------------------------------------------------------------------------
-- Production verification
-- -----------------------------------------------------------------------------
select
  'R44R38R20_APPOINTMENT_HISTORICAL_DATA_IMPORT_OK'::text as status,
  (select count(*)::integer from public.app_screens where screen_key='appointmentDataImport' and group_name='إدارة المواعيد' and is_active=true) as screen_registered,
  (select count(*)::integer from public.role_screen_permissions where screen_key='appointmentDataImport' and role='super_admin' and can_view=true and can_add=true) as super_admin_import,
  (select count(*)::integer from public.role_screen_permissions where screen_key='appointmentDataImport' and role<>'super_admin' and (can_add or can_edit or can_delete)) as unsafe_default_writes,
  (select count(*)::integer from information_schema.tables where table_schema='public' and table_name in ('appointment_historical_sales_import_batches','appointment_historical_sales_rows','appointment_historical_sales_import_errors')) as import_tables,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name in ('validate_appointment_historical_sales_r44r38r20','import_appointment_historical_sales_r44r38r20')) as import_rpcs,
  (select case when pg_get_functiondef(p.oid) ilike '%ZERO_TAX_TOTAL_MISMATCH%' and pg_get_functiondef(p.oid) ilike '%TAX_TOTAL_MISMATCH%' and pg_get_functiondef(p.oid) ilike '%ITEM_UNSPECIFIED%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='appointment_historical_sales_validate_row_r44r38r20' limit 1) as legacy_rules,
  (select case when pg_get_functiondef(p.oid) ilike '%source_fingerprint%' and pg_get_functiondef(p.oid) ilike '%duplicate%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='import_appointment_historical_sales_r44r38r20' limit 1) as duplicate_guard,
  (select count(*)::integer from information_schema.views where table_schema='public' and table_name='appointment_historical_sales_reporting') as reporting_view,
  (select count(*)::integer from public.app_translations where translation_key in (
    'appointmentDataImport.title','appointmentDataImport.col.item','appointmentDataImport.col.vehicle','appointmentDataImport.col.date',
    'appointmentDataImport.col.month','appointmentDataImport.col.invoice','appointmentDataImport.col.customer','appointmentDataImport.col.unitPrice',
    'appointmentDataImport.col.quantity','appointmentDataImport.col.discount','appointmentDataImport.col.tax','appointmentDataImport.col.salesInclusive',
    'appointmentDataImport.col.salesBeforeTax','appointmentDataImport.col.paymentMethod','pwa.update.release.r44r38r20.title'
  )) as translation_rows,
  (select count(*)::integer from pg_policies where schemaname='public' and tablename in ('appointment_historical_sales_import_batches','appointment_historical_sales_rows','appointment_historical_sales_import_errors')) as read_policies;

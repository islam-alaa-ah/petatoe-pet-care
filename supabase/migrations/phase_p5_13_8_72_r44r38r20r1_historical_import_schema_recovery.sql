-- PETATOE P5.13.8.72 R44R38R20R1 — Appointment Historical Data Import Schema Recovery
-- Recovery target:
--   Production already contains the ORIGINAL R44R38R20 empty import tables.
--   The revised R20 could not run because CREATE TABLE IF NOT EXISTS preserved that
--   older schema and the later customer_id index therefore failed.
--
-- Production preflight confirmed before this recovery:
--   batches_table_exists = true
--   rows_table_exists    = true
--   errors_table_exists  = true
--   batch_rows           = 0
--   imported_rows        = 0
--   error_rows           = 0
--   customer_id          = missing
--   record_type          = missing
--
-- Scope:
--   * Upgrade the EMPTY R20 tables in-place to the audited source-file schema.
--   * Preserve the existing R20 view contract and append new fields only.
--   * Replace the R20 validation/import routines with source-audited logic.
--   * Link customers by legacy code first, then unique normalized Saudi mobile.
--   * Correct the confirmed July-2026 Excel serial/day-month cases.
--   * Preserve source monetary signs/rounding; no recalculation of business values.
--
-- Safety gate:
--   This migration ABORTS before any schema change if any import batch/row/error exists.
--   It does NOT modify customers, operational invoices, appointments, Offline/Sync,
--   Permissions/RLS grants, or R44 retention/pruning.
--
-- Constraint changes are limited to the five source-incompatible numeric CHECKs
-- proven by the audited workbook:
--   quantity > 0
--   discount_amount >= 0
--   tax_amount >= 0
--   sales_inclusive >= 0
--   sales_before_tax >= 0
-- The unit_price >= 0 CHECK is intentionally retained because the audited source
-- contains zero unit prices but no negative unit prices.

begin;

-- -----------------------------------------------------------------------------
-- Recovery preconditions: fail closed.
-- -----------------------------------------------------------------------------
do $$
declare
  v_batches bigint;
  v_rows bigint;
  v_errors bigint;
begin
  if to_regclass('public.appointment_historical_sales_import_batches') is null
     or to_regclass('public.appointment_historical_sales_rows') is null
     or to_regclass('public.appointment_historical_sales_import_errors') is null then
    raise exception 'R44R38R20R1_PRECONDITION_MISSING_R20_TABLES';
  end if;

  select count(*) into v_batches from public.appointment_historical_sales_import_batches;
  select count(*) into v_rows from public.appointment_historical_sales_rows;
  select count(*) into v_errors from public.appointment_historical_sales_import_errors;

  if v_batches<>0 or v_rows<>0 or v_errors<>0 then
    raise exception 'R44R38R20R1_REQUIRES_EMPTY_IMPORT_TABLES batches=% rows=% errors=%',
      v_batches,v_rows,v_errors;
  end if;

  if to_regprocedure('public.normalize_customer_phone(text)') is null then
    raise exception 'R44R38R20R1_PRECONDITION_NORMALIZE_CUSTOMER_PHONE_MISSING';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='customers' and column_name='customer_number'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='customers' and column_name='customer_name'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='customers' and column_name='normalized_phone'
  ) then
    raise exception 'R44R38R20R1_PRECONDITION_CUSTOMER_MASTER_COLUMNS_MISSING';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Batch counters added by the audited R20 design.
-- -----------------------------------------------------------------------------
alter table public.appointment_historical_sales_import_batches
  add column if not exists matched_customer_rows integer not null default 0,
  add column if not exists unmatched_customer_rows integer not null default 0,
  add column if not exists review_customer_rows integer not null default 0,
  add column if not exists cash_aggregate_rows integer not null default 0,
  add column if not exists corrected_date_rows integer not null default 0;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_import_batches'::regclass and conname='appointment_hist_batches_matched_customer_rows_check') then
    alter table public.appointment_historical_sales_import_batches
      add constraint appointment_hist_batches_matched_customer_rows_check check(matched_customer_rows>=0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_import_batches'::regclass and conname='appointment_hist_batches_unmatched_customer_rows_check') then
    alter table public.appointment_historical_sales_import_batches
      add constraint appointment_hist_batches_unmatched_customer_rows_check check(unmatched_customer_rows>=0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_import_batches'::regclass and conname='appointment_hist_batches_review_customer_rows_check') then
    alter table public.appointment_historical_sales_import_batches
      add constraint appointment_hist_batches_review_customer_rows_check check(review_customer_rows>=0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_import_batches'::regclass and conname='appointment_hist_batches_cash_aggregate_rows_check') then
    alter table public.appointment_historical_sales_import_batches
      add constraint appointment_hist_batches_cash_aggregate_rows_check check(cash_aggregate_rows>=0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_import_batches'::regclass and conname='appointment_hist_batches_corrected_date_rows_check') then
    alter table public.appointment_historical_sales_import_batches
      add constraint appointment_hist_batches_corrected_date_rows_check check(corrected_date_rows>=0);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Historical row schema recovery.
-- Keep legacy customer_name as a compatibility mirror because the original R20
-- view already exposes it. The authoritative historical snapshots are the new
-- customer_raw / customer_name_snapshot fields.
-- -----------------------------------------------------------------------------
alter table public.appointment_historical_sales_rows
  add column if not exists record_type text not null default 'invoice_line',
  add column if not exists source_date_raw text,
  add column if not exists date_was_corrected boolean not null default false,
  add column if not exists date_correction_code text,
  add column if not exists customer_raw text not null default 'عميل غير محدد — بيانات تاريخية',
  add column if not exists customer_name_snapshot text not null default 'عميل غير محدد — بيانات تاريخية',
  add column if not exists customer_code_raw text,
  add column if not exists customer_phone_raw text,
  add column if not exists customer_phone_normalized text,
  add column if not exists customer_id uuid,
  add column if not exists customer_match_status text not null default 'unmatched',
  add column if not exists customer_match_method text not null default 'none',
  add column if not exists matched_customer_number_snapshot text,
  add column if not exists matched_customer_name_snapshot text;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_rows'::regclass and conname='appointment_historical_sales_rows_record_type_check') then
    alter table public.appointment_historical_sales_rows
      add constraint appointment_historical_sales_rows_record_type_check
      check(record_type in ('invoice_line','cash_aggregate'));
  end if;

  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_rows'::regclass and conname='appointment_historical_sales_rows_customer_match_status_check') then
    alter table public.appointment_historical_sales_rows
      add constraint appointment_historical_sales_rows_customer_match_status_check
      check(customer_match_status in ('matched','unmatched','needs_review','not_applicable'));
  end if;

  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_rows'::regclass and conname='appointment_historical_sales_rows_customer_match_method_check') then
    alter table public.appointment_historical_sales_rows
      add constraint appointment_historical_sales_rows_customer_match_method_check
      check(customer_match_method in ('legacy_code','mobile','none','cash_aggregate'));
  end if;

  if not exists(select 1 from pg_constraint where conrelid='public.appointment_historical_sales_rows'::regclass and conname='appointment_historical_sales_rows_customer_id_fkey') then
    alter table public.appointment_historical_sales_rows
      add constraint appointment_historical_sales_rows_customer_id_fkey
      foreign key(customer_id) references public.customers(id) on delete set null;
  end if;
end $$;

-- Remove ONLY the five checks that conflict with values proven in the audited file.
alter table public.appointment_historical_sales_rows
  drop constraint if exists appointment_historical_sales_rows_quantity_check,
  drop constraint if exists appointment_historical_sales_rows_discount_amount_check,
  drop constraint if exists appointment_historical_sales_rows_tax_amount_check,
  drop constraint if exists appointment_historical_sales_rows_sales_inclusive_check,
  drop constraint if exists appointment_historical_sales_rows_sales_before_tax_check;

-- The audited workbook has no negative unit prices, so retain the original unit_price >= 0 check.

create index if not exists idx_appointment_hist_sales_customer
  on public.appointment_historical_sales_rows(customer_id,sales_date desc);
create index if not exists idx_appointment_hist_sales_customer_match
  on public.appointment_historical_sales_rows(customer_match_status,customer_match_method);
create index if not exists idx_appointment_hist_sales_record_type
  on public.appointment_historical_sales_rows(record_type,sales_date desc);

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

-- Parse the actual legacy date shapes found in the audited workbook.
-- Returns: date, corrected, correctionCode, sourceKind.
create or replace function public.appointment_historical_import_date_r44r38r20(
  p_value text,
  p_month text
)
returns jsonb
language plpgsql
immutable
set search_path=public
as $$
declare
  v_raw text:=btrim(translate(coalesce(p_value,''),'٠١٢٣٤٥٦٧٨٩','0123456789'));
  v_month integer:=public.appointment_historical_import_month_r44r38r20(p_month);
  v_date date;
  v_serial integer;
  v_a integer;
  v_b integer;
  v_y integer;
  v_parts text[];
  v_corrected boolean:=false;
  v_code text;
  v_kind text;
begin
  if v_raw='' then
    return jsonb_build_object('date',null,'corrected',false,'correctionCode',null,'sourceKind','empty');
  end if;

  -- Excel serial (the workbook has 39 such rows in July 2026).
  if v_raw ~ '^[0-9]+(\.0+)?$' then
    begin
      v_serial:=floor(v_raw::numeric)::integer;
      if v_serial between 1 and 80000 then
        v_date:=date '1899-12-30'+v_serial;
        v_kind:='excel_serial';

        -- The audited July rows were interpreted by Excel as 07-Feb/Mar/Apr/May
        -- although the intended values were 02/03/04/05-Jul. Correct only the
        -- deterministic day/month swap when the month column proves it.
        if v_month is not null
           and extract(month from v_date)::integer<>v_month
           and extract(day from v_date)::integer=v_month
           and extract(month from v_date)::integer between 1 and 31 then
          begin
            v_date:=make_date(
              extract(year from v_date)::integer,
              v_month,
              extract(month from v_date)::integer
            );
            v_corrected:=true;
            v_code:='DATE_EXCEL_SERIAL_DAY_MONTH_CORRECTED';
          exception when others then
            null;
          end;
        end if;

        return jsonb_build_object('date',v_date,'corrected',v_corrected,'correctionCode',v_code,'sourceKind',v_kind);
      end if;
    exception when others then null;
    end;
  end if;

  -- ISO yyyy-mm-dd (also accepts an ISO timestamp by using its first ten chars).
  if left(v_raw,10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      v_date:=left(v_raw,10)::date;
      return jsonb_build_object('date',v_date,'corrected',false,'correctionCode',null,'sourceKind','iso');
    exception when others then null;
    end;
  end if;

  -- Slash date. Use the month column to resolve ambiguous d/m vs m/d safely.
  if v_raw ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then
    v_parts:=regexp_split_to_array(v_raw,'/');
    v_a:=v_parts[1]::integer;
    v_b:=v_parts[2]::integer;
    v_y:=v_parts[3]::integer;
    begin
      if v_month is not null and v_b=v_month then
        v_date:=make_date(v_y,v_b,v_a); -- d/m/yyyy
      elsif v_month is not null and v_a=v_month then
        v_date:=make_date(v_y,v_a,v_b); -- m/d/yyyy proved by month column
        v_corrected:=true;
        v_code:='DATE_SLASH_MONTH_ORDER_CORRECTED';
      else
        v_date:=make_date(v_y,v_b,v_a); -- workbook default: d/m/yyyy
      end if;
      return jsonb_build_object('date',v_date,'corrected',v_corrected,'correctionCode',v_code,'sourceKind','slash');
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('date',null,'corrected',false,'correctionCode',null,'sourceKind','invalid');
end;
$$;

-- Parse and safely match a legacy customer descriptor to the canonical customer master.
-- No name-only matching is ever performed.
create or replace function public.appointment_historical_customer_match_r44r38r20(p_customer text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_raw text:=btrim(coalesce(p_customer,''));
  v_name text;
  v_code_raw text;
  v_code_digits text;
  v_phone_raw text;
  v_phone_norm text;
  v_match uuid;
  v_code_match uuid;
  v_phone_match uuid;
  v_count integer:=0;
  v_status text:='unmatched';
  v_method text:='none';
  v_warning text;
  v_match_number text;
  v_match_name text;
  v_arr text[];
begin
  if v_raw='' then
    return jsonb_build_object(
      'raw','عميل غير محدد — بيانات تاريخية','name','عميل غير محدد — بيانات تاريخية',
      'code',null,'phone',null,'normalizedPhone',null,'customerId',null,
      'status','unmatched','method','none','matchedCustomerNumber',null,'matchedCustomerName',null,
      'warning','CUSTOMER_UNSPECIFIED'
    );
  end if;

  -- Cash aggregate labels are not customer identities.
  if lower(v_raw) in ('كاش','نقدي','cash') then
    return jsonb_build_object(
      'raw',v_raw,'name',v_raw,'code',null,'phone',null,'normalizedPhone',null,'customerId',null,
      'status','not_applicable','method','cash_aggregate','matchedCustomerNumber',null,'matchedCustomerName',null,
      'warning',null
    );
  end if;

  -- Legacy code at the end: "Name #000016".
  select regexp_match(v_raw,'#\s*([A-Za-z]?[0-9]+)\s*$','i') into v_arr;
  if v_arr is not null then
    v_code_raw:=nullif(btrim(v_arr[1]),'');
    v_name:=nullif(btrim(regexp_replace(v_raw,'\s*#\s*[A-Za-z]?[0-9]+\s*$','','i')),'');
  else
    -- Mobile-prefixed identity: "9665XXXXXXXX - Name".
    select regexp_match(v_raw,'^\s*([+0-9][0-9 +()\-]{5,})\s*-\s*(.+)$') into v_arr;
    if v_arr is not null then
      v_phone_raw:=nullif(btrim(v_arr[1]),'');
      v_name:=nullif(btrim(v_arr[2]),'');
    elsif v_raw ~ '#\s*$' then
      v_name:=nullif(btrim(regexp_replace(v_raw,'\s*#\s*$','','i')),'');
      v_warning:='CUSTOMER_CODE_INCOMPLETE';
    else
      v_name:=v_raw;
      if v_raw='#ERROR!' then v_warning:='CUSTOMER_SOURCE_ERROR'; else v_warning:='CUSTOMER_IDENTIFIER_MISSING'; end if;
    end if;
  end if;

  if v_name is null then v_name:=v_raw; end if;

  -- 1) Code is authoritative when present.
  if v_code_raw is not null then
    select count(*) into v_count
    from public.customers c
    where upper(btrim(c.customer_number))=upper(btrim(v_code_raw));

    if v_count=1 then
      select c.id into v_code_match
      from public.customers c
      where upper(btrim(c.customer_number))=upper(btrim(v_code_raw))
      order by c.created_at,c.id
      limit 1;
    elsif v_count=0 then
      v_code_digits:=regexp_replace(v_code_raw,'[^0-9]','','g');
      if nullif(v_code_digits,'') is not null then
        select count(*) into v_count
        from public.customers c
        where regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g')=v_code_digits;
        if v_count=1 then
          select c.id into v_code_match
          from public.customers c
          where regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g')=v_code_digits
          order by c.created_at,c.id
          limit 1;
        end if;
      end if;
    end if;

    if v_count=1 then
      v_match:=v_code_match;
      v_status:='matched';
      v_method:='legacy_code';
    elsif v_count>1 then
      v_status:='needs_review';
      v_warning:='CUSTOMER_CODE_AMBIGUOUS';
    else
      v_status:='unmatched';
      v_warning:='CUSTOMER_CODE_NOT_FOUND';
    end if;
  end if;

  -- 2) Phone is the fallback authority when there is no successful code match.
  -- A phone is auto-linked only when it identifies exactly ONE current customer.
  if v_phone_raw is not null then
    v_phone_norm:=public.normalize_customer_phone(v_phone_raw);
    if coalesce(v_phone_norm,'') ~ '^05[0-9]{8}$' then
      select count(*) into v_count
      from public.customers c
      where c.normalized_phone=v_phone_norm;

      if v_count=1 then
        select c.id into v_phone_match
        from public.customers c
        where c.normalized_phone=v_phone_norm
        order by c.created_at,c.id
        limit 1;
      else
        v_phone_match:=null;
      end if;

      if v_match is null then
        if v_count=1 and v_phone_match is not null then
          v_match:=v_phone_match;
          v_status:='matched';
          v_method:='mobile';
          v_warning:=null;
        elsif v_count>1 then
          v_status:='needs_review';
          v_method:='none';
          v_warning:='CUSTOMER_PHONE_AMBIGUOUS';
        elsif v_code_raw is null then
          v_status:='unmatched';
          v_warning:='CUSTOMER_PHONE_NOT_FOUND';
        end if;
      elsif v_count=1 and v_phone_match is not null and v_phone_match<>v_match then
        v_match:=null;
        v_status:='needs_review';
        v_method:='none';
        v_warning:='CUSTOMER_CODE_PHONE_CONFLICT';
      elsif v_count>1 then
        v_match:=null;
        v_status:='needs_review';
        v_method:='none';
        v_warning:='CUSTOMER_PHONE_AMBIGUOUS';
      end if;
    else
      if v_match is null then v_status:='needs_review'; end if;
      v_warning:=coalesce(v_warning,'CUSTOMER_PHONE_INVALID_OR_FOREIGN');
    end if;
  end if;

  if v_code_raw is null and v_phone_raw is null and v_warning in ('CUSTOMER_CODE_INCOMPLETE','CUSTOMER_SOURCE_ERROR','CUSTOMER_IDENTIFIER_MISSING') then
    v_status:='needs_review';
  end if;

  if v_match is not null then
    select c.customer_number,c.customer_name
      into v_match_number,v_match_name
    from public.customers c where c.id=v_match;
  end if;

  return jsonb_build_object(
    'raw',v_raw,
    'name',coalesce(v_name,v_raw),
    'code',v_code_raw,
    'phone',v_phone_raw,
    'normalizedPhone',nullif(v_phone_norm,''),
    'customerId',v_match,
    'status',v_status,
    'method',v_method,
    'matchedCustomerNumber',v_match_number,
    'matchedCustomerName',v_match_name,
    'warning',v_warning
  );
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

  v_date_info jsonb;
  v_date_raw text:=nullif(btrim(coalesce(p_row->>'dateRaw',p_row->>'date','')),'');
  v_date date;
  v_date_corrected boolean:=false;
  v_date_correction text;
  v_month_raw text:=nullif(btrim(coalesce(p_row->>'month','')),'');
  v_month integer;

  v_invoice text:=nullif(btrim(coalesce(p_row->>'invoiceNumber','')),'');
  v_customer_raw text:=nullif(btrim(coalesce(p_row->>'customer','')),'');
  v_customer_info jsonb;
  v_customer_id uuid;
  v_customer_status text;
  v_customer_method text;
  v_customer_warning text;

  v_unit numeric;
  v_qty numeric;
  v_discount numeric;
  v_tax numeric;
  v_gross numeric;
  v_net numeric;
  v_payment text:=nullif(btrim(coalesce(p_row->>'paymentMethod','')),'');

  v_record_type text:='invoice_line';
  v_errors jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_expected_a numeric;
  v_expected_b numeric;
  v_fingerprint text;
begin
  if p_source_row is null or p_source_row<1 then p_source_row:=1; end if;

  -- Date parsing + deterministic July Excel-serial correction.
  v_date_info:=public.appointment_historical_import_date_r44r38r20(v_date_raw,v_month_raw);
  begin v_date:=nullif(v_date_info->>'date','')::date; exception when others then v_date:=null; end;
  v_date_corrected:=coalesce((v_date_info->>'corrected')::boolean,false);
  v_date_correction:=nullif(v_date_info->>'correctionCode','');
  if v_date is null then
    v_errors:=v_errors||jsonb_build_array('DATE_REQUIRED_OR_INVALID');
  elsif v_date_corrected then
    v_warnings:=v_warnings||jsonb_build_array(v_date_correction);
  end if;

  if v_invoice is null then v_errors:=v_errors||jsonb_build_array('INVOICE_NUMBER_REQUIRED'); end if;
  if v_customer_raw is null then v_customer_raw:='عميل غير محدد — بيانات تاريخية'; end if;
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

  -- Detect non-customer cash aggregate rows exactly as they appear in the audited workbook.
  if lower(v_customer_raw) in ('كاش','نقدي','cash')
     and lower(v_payment) in ('نقدي','cash')
     and (
       lower(coalesce(v_invoice,'')) in ('نقدي','cash')
       or lower(coalesce(v_item_raw,'')) in ('نقدي','غير محدد','cash','')
     ) then
    v_record_type:='cash_aggregate';
  end if;

  v_customer_info:=public.appointment_historical_customer_match_r44r38r20(v_customer_raw);
  if v_record_type='cash_aggregate' then
    v_customer_info:=jsonb_build_object(
      'raw',v_customer_raw,'name',v_customer_raw,'code',null,'phone',null,'normalizedPhone',null,'customerId',null,
      'status','not_applicable','method','cash_aggregate','matchedCustomerNumber',null,'matchedCustomerName',null,'warning',null
    );
    v_warnings:=v_warnings||jsonb_build_array('CASH_AGGREGATE_ROW');
  else
    v_customer_warning:=nullif(v_customer_info->>'warning','');
    if v_customer_warning is not null then v_warnings:=v_warnings||jsonb_build_array(v_customer_warning); end if;
  end if;

  begin v_customer_id:=nullif(v_customer_info->>'customerId','')::uuid; exception when others then v_customer_id:=null; end;
  v_customer_status:=coalesce(nullif(v_customer_info->>'status',''),'unmatched');
  v_customer_method:=coalesce(nullif(v_customer_info->>'method',''),'none');

  v_unit:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'unitPrice');
  v_qty:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'quantity');
  v_discount:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'discount');
  v_tax:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'tax');
  v_gross:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'salesInclusive');
  v_net:=public.appointment_historical_import_numeric_r44r38r20(p_row->>'salesBeforeTax');

  if v_unit is null then v_errors:=v_errors||jsonb_build_array('UNIT_PRICE_INVALID'); end if;
  if v_qty is null then v_errors:=v_errors||jsonb_build_array('QUANTITY_INVALID'); end if;
  if v_discount is null then v_errors:=v_errors||jsonb_build_array('DISCOUNT_INVALID'); end if;
  if v_tax is null then v_errors:=v_errors||jsonb_build_array('TAX_INVALID'); end if;
  if v_gross is null then v_errors:=v_errors||jsonb_build_array('SALES_INCLUSIVE_INVALID'); end if;
  if v_net is null then v_errors:=v_errors||jsonb_build_array('SALES_BEFORE_TAX_INVALID'); end if;

  -- Source signs are preserved. The audited file contains zero-quantity legacy rows,
  -- negative returns, and signed discount values; these are warnings, not rejections.
  if v_qty=0 then v_warnings:=v_warnings||jsonb_build_array('QUANTITY_ZERO_LEGACY'); end if;
  if v_qty<0 or v_tax<0 or v_gross<0 or v_net<0 then
    v_warnings:=v_warnings||jsonb_build_array('NEGATIVE_LEGACY_TRANSACTION');
  end if;
  if v_discount<0 then v_warnings:=v_warnings||jsonb_build_array('NEGATIVE_DISCOUNT_LEGACY'); end if;

  -- Preserve source totals. Accounting differences are review warnings only because
  -- the workbook contains rounded tax and two legacy cash-total anomalies.
  if v_gross is not null and v_net is not null and v_tax is not null then
    if v_tax=0 then
      if abs(v_gross-v_net)>0.05 then v_warnings:=v_warnings||jsonb_build_array('ZERO_TAX_TOTAL_MISMATCH'); end if;
    elsif abs((v_net+v_tax)-v_gross)>0.05 then
      v_warnings:=v_warnings||jsonb_build_array('TAX_TOTAL_MISMATCH_LEGACY');
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

  -- Unit-price math is a warning only. Try both legacy discount sign conventions.
  if v_unit is not null and v_qty is not null and v_net is not null and v_qty<>0 then
    v_expected_a:=round((v_unit*v_qty)-coalesce(v_discount,0),2);
    v_expected_b:=round((v_unit*v_qty)+coalesce(v_discount,0),2);
    if least(abs(v_expected_a-v_net),abs(v_expected_b-v_net))>0.10 then
      v_warnings:=v_warnings||jsonb_build_array('UNIT_PRICE_MATH_MISMATCH');
    end if;
  end if;

  -- Keep source row in the fingerprint because the workbook legitimately contains
  -- repeated, byte-identical invoice lines. This prevents collapsing real duplicate lines.
  v_fingerprint:=md5(concat_ws('|',
    coalesce(v_invoice,''),coalesce(v_date::text,''),lower(coalesce(v_vehicle,'')),p_source_row::text,
    lower(coalesce(v_item_display,'')),lower(coalesce(v_customer_raw,'')),
    coalesce(round(v_unit,2)::text,''),coalesce(round(v_qty,3)::text,''),coalesce(round(v_discount,2)::text,''),
    coalesce(round(v_gross,2)::text,''),coalesce(round(v_net,2)::text,''),coalesce(round(v_tax,2)::text,''),
    lower(coalesce(v_payment,''))
  ));

  return jsonb_build_object(
    'sourceRow',p_source_row,
    'valid',jsonb_array_length(v_errors)=0,
    'errors',v_errors,
    'warnings',v_warnings,
    'fingerprint',v_fingerprint,
    'normalized',jsonb_build_object(
      'recordType',v_record_type,
      'itemNameRaw',v_item_raw,
      'itemNameDisplay',v_item_display,
      'itemUnspecified',v_item_unspecified,
      'serviceTypeId',v_service_id,
      'vehicle',v_vehicle,
      'carId',v_car_id,
      'dateRaw',v_date_raw,
      'date',v_date,
      'month',v_month_raw,
      'dateCorrected',v_date_corrected,
      'dateCorrectionCode',v_date_correction,
      'invoiceNumber',v_invoice,
      'customerRaw',v_customer_raw,
      'customerName',v_customer_info->>'name',
      'customerCode',v_customer_info->>'code',
      'customerPhone',v_customer_info->>'phone',
      'customerPhoneNormalized',v_customer_info->>'normalizedPhone',
      'customerId',v_customer_id,
      'customerMatchStatus',v_customer_status,
      'customerMatchMethod',v_customer_method,
      'matchedCustomerNumber',v_customer_info->>'matchedCustomerNumber',
      'matchedCustomerName',v_customer_info->>'matchedCustomerName',
      'unitPrice',v_unit,
      'quantity',v_qty,
      'discount',v_discount,
      'tax',v_tax,
      'salesInclusive',v_gross,
      'salesBeforeTax',v_net,
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
  v_norm jsonb;
  v_results jsonb:='[]'::jsonb;
  v_seen text[]:=array[]::text[];
  v_fp text;
  v_valid integer:=0;
  v_errors integer:=0;
  v_duplicates integer:=0;
  v_total integer:=0;
  v_source integer;
  v_matched integer:=0;
  v_unmatched integer:=0;
  v_review integer:=0;
  v_cash integer:=0;
  v_corrected integer:=0;
begin
  if not public.has_screen_permission('appointmentDataImport','view') then raise exception 'permission_denied'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'APPOINTMENT_HISTORY_ROWS_INVALID'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total:=v_total+1;
    begin v_source:=coalesce(nullif(v_row->>'sourceRow','')::integer,v_total+1); exception when others then v_source:=v_total+1; end;
    v_result:=public.appointment_historical_sales_validate_row_r44r38r20(v_row,v_source);
    v_norm:=v_result->'normalized';
    v_fp:=v_result->>'fingerprint';

    if v_fp=any(v_seen) or exists(select 1 from public.appointment_historical_sales_rows h where h.source_fingerprint=v_fp) then
      v_result:=jsonb_set(v_result,'{duplicate}','true'::jsonb,true);
      v_duplicates:=v_duplicates+1;
    else
      v_seen:=array_append(v_seen,v_fp);
      v_result:=jsonb_set(v_result,'{duplicate}','false'::jsonb,true);
      if coalesce((v_result->>'valid')::boolean,false) then v_valid:=v_valid+1; else v_errors:=v_errors+1; end if;
    end if;

    if v_norm->>'recordType'='cash_aggregate' then v_cash:=v_cash+1;
    elsif v_norm->>'customerMatchStatus'='matched' then v_matched:=v_matched+1;
    elsif v_norm->>'customerMatchStatus'='needs_review' then v_review:=v_review+1;
    else v_unmatched:=v_unmatched+1;
    end if;
    if coalesce((v_norm->>'dateCorrected')::boolean,false) then v_corrected:=v_corrected+1; end if;

    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'total',v_total,'valid',v_valid,'errors',v_errors,'duplicates',v_duplicates,
      'matchedCustomers',v_matched,'unmatchedCustomers',v_unmatched,'reviewCustomers',v_review,
      'cashAggregates',v_cash,'correctedDates',v_corrected
    ),
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
  v_matched integer:=0;
  v_unmatched integer:=0;
  v_review integer:=0;
  v_cash integer:=0;
  v_corrected integer:=0;
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
    begin v_source:=coalesce(nullif(v_row->>'sourceRow','')::integer,v_total+1); exception when others then v_source:=v_total+1; end;
    v_result:=public.appointment_historical_sales_validate_row_r44r38r20(v_row,v_source);
    v_norm:=v_result->'normalized';
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

      insert into public.appointment_historical_sales_rows(
        batch_id,source_row_no,source_fingerprint,record_type,
        item_name_raw,item_name_display,item_is_unspecified,service_type_id,
        vehicle_raw,appointment_car_id,
        source_date_raw,sales_date,source_month,date_was_corrected,date_correction_code,
        invoice_number,
        customer_raw,customer_name,customer_name_snapshot,customer_code_raw,customer_phone_raw,customer_phone_normalized,
        customer_id,customer_match_status,customer_match_method,matched_customer_number_snapshot,matched_customer_name_snapshot,
        unit_price,quantity,discount_amount,tax_amount,sales_inclusive,sales_before_tax,payment_method,
        validation_warnings,original_row,created_by
      ) values(
        v_batch,v_source,v_fp,v_norm->>'recordType',
        nullif(v_norm->>'itemNameRaw',''),v_norm->>'itemNameDisplay',coalesce((v_norm->>'itemUnspecified')::boolean,false),nullif(v_norm->>'serviceTypeId','')::uuid,
        v_norm->>'vehicle',nullif(v_norm->>'carId','')::uuid,
        nullif(v_norm->>'dateRaw',''),(v_norm->>'date')::date,nullif(v_norm->>'month',''),coalesce((v_norm->>'dateCorrected')::boolean,false),nullif(v_norm->>'dateCorrectionCode',''),
        v_norm->>'invoiceNumber',
        v_norm->>'customerRaw',v_norm->>'customerName',v_norm->>'customerName',nullif(v_norm->>'customerCode',''),nullif(v_norm->>'customerPhone',''),nullif(v_norm->>'customerPhoneNormalized',''),
        nullif(v_norm->>'customerId','')::uuid,v_norm->>'customerMatchStatus',v_norm->>'customerMatchMethod',nullif(v_norm->>'matchedCustomerNumber',''),nullif(v_norm->>'matchedCustomerName',''),
        (v_norm->>'unitPrice')::numeric,(v_norm->>'quantity')::numeric,(v_norm->>'discount')::numeric,(v_norm->>'tax')::numeric,
        (v_norm->>'salesInclusive')::numeric,(v_norm->>'salesBeforeTax')::numeric,v_norm->>'paymentMethod',
        coalesce(v_result->'warnings','[]'::jsonb),v_row,auth.uid()
      );
      v_inserted:=v_inserted+1;
      v_result:=jsonb_set(v_result,'{duplicate}','false'::jsonb,true);

      if v_norm->>'recordType'='cash_aggregate' then v_cash:=v_cash+1;
      elsif v_norm->>'customerMatchStatus'='matched' then v_matched:=v_matched+1;
      elsif v_norm->>'customerMatchStatus'='needs_review' then v_review:=v_review+1;
      else v_unmatched:=v_unmatched+1;
      end if;
      if coalesce((v_norm->>'dateCorrected')::boolean,false) then v_corrected:=v_corrected+1; end if;
    end if;

    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  update public.appointment_historical_sales_import_batches
  set inserted_rows=v_inserted,
      duplicate_rows=v_duplicates,
      rejected_rows=v_rejected,
      matched_customer_rows=v_matched,
      unmatched_customer_rows=v_unmatched,
      review_customer_rows=v_review,
      cash_aggregate_rows=v_cash,
      corrected_date_rows=v_corrected,
      status=case when v_rejected>0 then 'partial' else 'completed' end,
      completed_at=now()
  where id=v_batch;

  return jsonb_build_object(
    'batchId',v_batch,
    'summary',jsonb_build_object(
      'total',v_total,'inserted',v_inserted,'duplicates',v_duplicates,'rejected',v_rejected,
      'matchedCustomers',v_matched,'unmatchedCustomers',v_unmatched,'reviewCustomers',v_review,
      'cashAggregates',v_cash,'correctedDates',v_corrected
    ),
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
revoke all on function public.appointment_historical_import_date_r44r38r20(text,text) from public,anon;
revoke all on function public.appointment_historical_customer_match_r44r38r20(text) from public,anon;
revoke all on function public.appointment_historical_sales_validate_row_r44r38r20(jsonb,integer) from public,anon;
revoke all on function public.validate_appointment_historical_sales_r44r38r20(jsonb) from public,anon;
revoke all on function public.import_appointment_historical_sales_r44r38r20(text,text,jsonb) from public,anon;
grant execute on function public.validate_appointment_historical_sales_r44r38r20(jsonb) to authenticated;
grant execute on function public.import_appointment_historical_sales_r44r38r20(text,text,jsonb) to authenticated;

-- Canonical read surface for reports / future integration.
-- Recovery rule: preserve the original R20 view column order and append new columns only,
-- so CREATE OR REPLACE VIEW remains compatible with the already-created production view.
create or replace view public.appointment_historical_sales_reporting
with (security_invoker=true)
as
select
  -- Existing R20 columns: order and names preserved exactly.
  h.id,
  h.batch_id,
  h.source_row_no,
  h.item_name_display as item_name,
  h.item_is_unspecified,
  h.service_type_id,
  h.vehicle_raw as vehicle,
  h.appointment_car_id,
  h.sales_date,
  extract(year from h.sales_date)::integer as sales_year,
  extract(month from h.sales_date)::integer as sales_month,
  h.source_month,
  h.invoice_number,
  h.customer_name,
  h.unit_price,
  h.quantity,
  h.discount_amount,
  h.tax_amount,
  h.sales_inclusive,
  h.sales_before_tax,
  h.payment_method,
  h.validation_warnings,
  h.created_at,

  -- R20R1 appended fields.
  h.record_type,
  h.source_date_raw,
  h.date_was_corrected,
  h.date_correction_code,
  h.customer_id,
  h.customer_raw,
  h.customer_name_snapshot,
  h.customer_code_raw,
  h.customer_phone_raw,
  h.customer_phone_normalized,
  h.customer_match_status,
  h.customer_match_method,
  h.matched_customer_number_snapshot,
  h.matched_customer_name_snapshot
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
  ('appointmentDataImport.note','appointmentDataImport','appointments','help','رفع بيانات المبيعات القديمة من Excel بعد فحصها وربط العملاء الحاليين بالكود أو الجوال دون مطابقة بالاسم فقط.','Import historical Excel sales after validation and safe customer linking by code or mobile, never by name alone.','رفع بيانات المبيعات القديمة من Excel بعد فحصها وربط العملاء الحاليين بالكود أو الجوال دون مطابقة بالاسم فقط.','Import historical Excel sales after validation and safe customer linking by code or mobile, never by name alone.',true,now()),
  ('appointmentDataImport.downloadTemplate','appointmentDataImport','appointments','button','تحميل نموذج Excel','Download Excel Template','تحميل نموذج Excel','Download Excel Template',true,now()),
  ('appointmentDataImport.chooseFile','appointmentDataImport','appointments','button','اختيار ملف Excel','Choose Excel File','اختيار ملف Excel','Choose Excel File',true,now()),
  ('appointmentDataImport.validate','appointmentDataImport','appointments','button','فحص الملف','Validate File','فحص الملف','Validate File',true,now()),
  ('appointmentDataImport.import','appointmentDataImport','appointments','button','بدء الاستيراد','Start Import','بدء الاستيراد','Start Import',true,now()),
  ('appointmentDataImport.failedExport','appointmentDataImport','appointments','button','تنزيل الصفوف الفاشلة','Download Failed Rows','تنزيل الصفوف الفاشلة','Download Failed Rows',true,now()),
  ('appointmentDataImport.rule.customerMatch','appointmentDataImport','appointments','help','يتم ربط العميل بالكود أولاً ثم رقم الجوال؛ لا تتم أي مطابقة تلقائية بالاسم فقط.','Customers are linked by code first, then mobile; name-only automatic matching is never used.','يتم ربط العميل بالكود أولاً ثم رقم الجوال؛ لا تتم أي مطابقة تلقائية بالاسم فقط.','Customers are linked by code first, then mobile; name-only automatic matching is never used.',true,now()),
  ('appointmentDataImport.rule.unspecifiedItem','appointmentDataImport','appointments','help','الصنف غير المحدد مقبول ويُحفظ كبيان تاريخي دون إنشاء صنف جديد.','Unspecified items are accepted as historical data without creating a new catalog item.','الصنف غير المحدد مقبول ويُحفظ كبيان تاريخي دون إنشاء صنف جديد.','Unspecified items are accepted as historical data without creating a new catalog item.',true,now()),
  ('appointmentDataImport.rule.zeroTax','appointmentDataImport','appointments','help','الفاتورة بدون ضريبة مقبولة، ويُحفظ المبلغ قبل الضريبة وشامل الضريبة كما ورد في المصدر.','Zero-tax invoices are accepted and source before-tax/inclusive values are preserved.','الفاتورة بدون ضريبة مقبولة، ويُحفظ المبلغ قبل الضريبة وشامل الضريبة كما ورد في المصدر.','Zero-tax invoices are accepted and source before-tax/inclusive values are preserved.',true,now()),
  ('appointmentDataImport.rule.dateCorrection','appointmentDataImport','appointments','help','يتم تصحيح تواريخ Excel الرقمية المؤكدة بعمود الشهر قبل الاستيراد مع إظهار تنبيه في المعاينة.','Excel numeric dates proven by the month column are corrected before import and flagged in preview.','يتم تصحيح تواريخ Excel الرقمية المؤكدة بعمود الشهر قبل الاستيراد مع إظهار تنبيه في المعاينة.','Excel numeric dates proven by the month column are corrected before import and flagged in preview.',true,now()),
  ('appointmentDataImport.match.code','appointmentDataImport','appointments','status','مطابق بكود العميل','Matched by customer code','مطابق بكود العميل','Matched by customer code',true,now()),
  ('appointmentDataImport.match.phone','appointmentDataImport','appointments','status','مطابق برقم الجوال','Matched by mobile','مطابق برقم الجوال','Matched by mobile',true,now()),
  ('appointmentDataImport.match.unmatched','appointmentDataImport','appointments','status','لا يوجد عميل مطابق','No matching customer','لا يوجد عميل مطابق','No matching customer',true,now()),
  ('appointmentDataImport.match.review','appointmentDataImport','appointments','status','يحتاج مراجعة','Needs review','يحتاج مراجعة','Needs review',true,now()),
  ('appointmentDataImport.match.cash','appointmentDataImport','appointments','status','بيانات نقدية مجمعة','Cash aggregate','بيانات نقدية مجمعة','Cash aggregate',true,now()),
  ('appointmentDataImport.col.item','appointmentDataImport','appointments','table','اسم الصنف','Item Name','اسم الصنف','Item Name',true,now()),
  ('appointmentDataImport.col.vehicle','appointmentDataImport','appointments','table','السيارة','Vehicle','السيارة','Vehicle',true,now()),
  ('appointmentDataImport.col.date','appointmentDataImport','appointments','table','التاريخ','Date','التاريخ','Date',true,now()),
  ('appointmentDataImport.col.month','appointmentDataImport','appointments','table','الشهر','Month','الشهر','Month',true,now()),
  ('appointmentDataImport.col.invoice','appointmentDataImport','appointments','table','رقم الفاتورة','Invoice Number','رقم الفاتورة','Invoice Number',true,now()),
  ('appointmentDataImport.col.customer','appointmentDataImport','appointments','table','العميل','Customer','العميل','Customer',true,now()),
  ('appointmentDataImport.col.customerCode','appointmentDataImport','appointments','table','كود العميل المستخرج','Extracted Customer Code','كود العميل المستخرج','Extracted Customer Code',true,now()),
  ('appointmentDataImport.col.customerPhone','appointmentDataImport','appointments','table','جوال العميل المستخرج','Extracted Customer Mobile','جوال العميل المستخرج','Extracted Customer Mobile',true,now()),
  ('appointmentDataImport.col.matchedCustomer','appointmentDataImport','appointments','table','العميل المطابق بالنظام','Matched System Customer','العميل المطابق بالنظام','Matched System Customer',true,now()),
  ('appointmentDataImport.col.matchMethod','appointmentDataImport','appointments','table','طريقة المطابقة','Match Method','طريقة المطابقة','Match Method',true,now()),
  ('appointmentDataImport.col.matchStatus','appointmentDataImport','appointments','table','حالة الربط','Link Status','حالة الربط','Link Status',true,now()),
  ('appointmentDataImport.col.unitPrice','appointmentDataImport','appointments','table','سعر الوحدة','Unit Price','سعر الوحدة','Unit Price',true,now()),
  ('appointmentDataImport.col.quantity','appointmentDataImport','appointments','table','الكمية','Quantity','الكمية','Quantity',true,now()),
  ('appointmentDataImport.col.discount','appointmentDataImport','appointments','table','الخصم','Discount','الخصم','Discount',true,now()),
  ('appointmentDataImport.col.tax','appointmentDataImport','appointments','table','الضريبة','Tax','الضريبة','Tax',true,now()),
  ('appointmentDataImport.col.salesInclusive','appointmentDataImport','appointments','table','المبيعات شامل الضريبة','Sales incl. Tax','المبيعات شامل الضريبة','Sales incl. Tax',true,now()),
  ('appointmentDataImport.col.salesBeforeTax','appointmentDataImport','appointments','table','المبيعات قبل الضريبة','Sales before Tax','المبيعات قبل الضريبة','Sales before Tax',true,now()),
  ('appointmentDataImport.col.paymentMethod','appointmentDataImport','appointments','table','طريقة السداد','Payment Method','طريقة السداد','Payment Method',true,now()),
  ('pwa.update.release.r44r38r20.title','systemSettings','pwa','title','إضافة رفع البيانات التاريخية للمواعيد — R44R38R20','Add Appointment Historical Data Import — R44R38R20','إضافة رفع البيانات التاريخية للمواعيد — R44R38R20','Add Appointment Historical Data Import — R44R38R20',true,now()),
  ('pwa.update.release.r44r38r20.note1','systemSettings','pwa','note','ربط آمن للفواتير التاريخية بالعملاء الحاليين باستخدام كود العميل أولاً ثم رقم الجوال دون مطابقة بالاسم فقط.','Safely links historical invoices to current customers by customer code first, then mobile, with no name-only matching.','ربط آمن للفواتير التاريخية بالعملاء الحاليين باستخدام كود العميل أولاً ثم رقم الجوال دون مطابقة بالاسم فقط.','Safely links historical invoices to current customers by customer code first, then mobile, with no name-only matching.',true,now()),
  ('pwa.update.release.r44r38r20.note2','systemSettings','pwa','note','دعم بيانات المصدر الفعلية: الصنف غير المحدد، الصفر والسالب التاريخي، الفواتير بدون ضريبة، وفروق التقريب دون إعادة حساب قيم المصدر.','Supports actual legacy-source cases: unspecified items, zero/negative legacy values, zero-tax invoices, and rounding differences without recalculating source values.','دعم بيانات المصدر الفعلية: الصنف غير المحدد، الصفر والسالب التاريخي، الفواتير بدون ضريبة، وفروق التقريب دون إعادة حساب قيم المصدر.','Supports actual legacy-source cases: unspecified items, zero/negative legacy values, zero-tax invoices, and rounding differences without recalculating source values.',true,now()),
  ('pwa.update.release.r44r38r20.note3','systemSettings','pwa','note','تصحيح 39 تاريخ Excel رقمي مؤكدة لشهر يوليو 2026 مع الاحتفاظ بالقيمة الأصلية وسجل التصحيح.','Corrects the 39 confirmed July 2026 Excel numeric dates while preserving the original value and correction audit.','تصحيح 39 تاريخ Excel رقمي مؤكدة لشهر يوليو 2026 مع الاحتفاظ بالقيمة الأصلية وسجل التصحيح.','Corrects the 39 confirmed July 2026 Excel numeric dates while preserving the original value and correction audit.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,module_name=excluded.module_name,text_type=excluded.text_type,
  default_ar=excluded.default_ar,default_en=excluded.default_en,
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  is_active=true,updated_at=now();



notify pgrst,'reload schema';
commit;

-- -----------------------------------------------------------------------------
-- Production verification
-- -----------------------------------------------------------------------------
select
  'R44R38R20R1_HISTORICAL_IMPORT_SCHEMA_RECOVERY_OK'::text as status,

  (select count(*)::integer
   from public.app_screens
   where screen_key='appointmentDataImport'
     and group_name='إدارة المواعيد'
     and is_active=true) as screen_registered,

  (select count(*)::integer
   from public.role_screen_permissions
   where screen_key='appointmentDataImport'
     and role='super_admin'
     and can_view=true
     and can_add=true) as super_admin_import,

  (select count(*)::integer
   from public.role_screen_permissions
   where screen_key='appointmentDataImport'
     and role<>'super_admin'
     and (can_add or can_edit or can_delete)) as unsafe_default_writes,

  (select count(*)::integer
   from information_schema.columns
   where table_schema='public'
     and table_name='appointment_historical_sales_import_batches'
     and column_name in (
       'matched_customer_rows','unmatched_customer_rows','review_customer_rows',
       'cash_aggregate_rows','corrected_date_rows'
     )) as batch_recovery_columns,

  (select count(*)::integer
   from information_schema.columns
   where table_schema='public'
     and table_name='appointment_historical_sales_rows'
     and column_name in (
       'record_type','source_date_raw','date_was_corrected','date_correction_code',
       'customer_raw','customer_name_snapshot','customer_code_raw','customer_phone_raw',
       'customer_phone_normalized','customer_id','customer_match_status','customer_match_method',
       'matched_customer_number_snapshot','matched_customer_name_snapshot'
     )) as row_recovery_columns,

  (select count(*)::integer
   from pg_constraint
   where conrelid='public.appointment_historical_sales_rows'::regclass
     and conname in (
       'appointment_historical_sales_rows_quantity_check',
       'appointment_historical_sales_rows_discount_amount_check',
       'appointment_historical_sales_rows_tax_amount_check',
       'appointment_historical_sales_rows_sales_inclusive_check',
       'appointment_historical_sales_rows_sales_before_tax_check'
     )) as incompatible_numeric_checks_remaining,

  (select count(*)::integer
   from pg_constraint
   where conrelid='public.appointment_historical_sales_rows'::regclass
     and conname='appointment_historical_sales_rows_unit_price_check') as unit_price_guard_retained,

  (select count(*)::integer
   from information_schema.routines
   where routine_schema='public'
     and routine_name in (
       'appointment_historical_import_date_r44r38r20',
       'appointment_historical_customer_match_r44r38r20',
       'appointment_historical_sales_validate_row_r44r38r20',
       'validate_appointment_historical_sales_r44r38r20',
       'import_appointment_historical_sales_r44r38r20'
     )) as revised_routines,

  (select case
     when pg_get_functiondef(p.oid) ilike '%customer_number%'
      and pg_get_functiondef(p.oid) ilike '%normalized_phone%'
      and pg_get_functiondef(p.oid) ilike '%CUSTOMER_PHONE_AMBIGUOUS%'
     then 1 else 0 end::integer
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='appointment_historical_customer_match_r44r38r20'
   limit 1) as safe_customer_match_logic,

  (select case
     when (public.appointment_historical_import_date_r44r38r20('46060','july')->>'date')='2026-07-02'
      and coalesce((public.appointment_historical_import_date_r44r38r20('46060','july')->>'corrected')::boolean,false)=true
     then 1 else 0 end::integer) as july_date_probe,

  (select case
     when pg_get_functiondef(p.oid) ilike '%QUANTITY_ZERO_LEGACY%'
      and pg_get_functiondef(p.oid) ilike '%NEGATIVE_LEGACY_TRANSACTION%'
      and pg_get_functiondef(p.oid) ilike '%TAX_TOTAL_MISMATCH_LEGACY%'
      and pg_get_functiondef(p.oid) ilike '%CASH_AGGREGATE_ROW%'
     then 1 else 0 end::integer
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='appointment_historical_sales_validate_row_r44r38r20'
   limit 1) as source_file_rules,

  (select count(*)::integer
   from information_schema.views
   where table_schema='public'
     and table_name='appointment_historical_sales_reporting') as reporting_view,

  (select count(*)::integer
   from information_schema.columns
   where table_schema='public'
     and table_name='appointment_historical_sales_reporting'
     and column_name in (
       'customer_name','record_type','source_date_raw','date_was_corrected',
       'customer_id','customer_name_snapshot','customer_code_raw',
       'customer_phone_normalized','customer_match_status','customer_match_method'
     )) as reporting_view_recovery_columns,

  (select count(*)::integer
   from public.app_translations
   where translation_key in (
     'appointmentDataImport.rule.customerMatch',
     'appointmentDataImport.rule.dateCorrection',
     'appointmentDataImport.match.code',
     'appointmentDataImport.match.phone',
     'appointmentDataImport.match.unmatched',
     'appointmentDataImport.match.review',
     'appointmentDataImport.match.cash',
     'appointmentDataImport.col.customerCode',
     'appointmentDataImport.col.customerPhone',
     'appointmentDataImport.col.matchedCustomer',
     'appointmentDataImport.col.matchMethod',
     'appointmentDataImport.col.matchStatus'
   )) as new_translation_rows,

  (select count(*)::integer from public.appointment_historical_sales_import_batches) as batch_rows,
  (select count(*)::integer from public.appointment_historical_sales_rows) as imported_rows,
  (select count(*)::integer from public.appointment_historical_sales_import_errors) as error_rows;

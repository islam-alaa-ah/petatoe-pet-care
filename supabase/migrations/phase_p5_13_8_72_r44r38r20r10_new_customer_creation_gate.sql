-- PETATOE P5.13.8.72 R44R38R20R10
-- Historical Import — New Customer Creation Gate
--
-- Root Cause
-- ----------
-- Final pre-import audit proved that the historical file contains two categories:
--   A) Existing customers that can be linked safely by code/mobile/exact unique name.
--   B) Genuinely new customers that do not exist in the current customer master.
--
-- The historical importer currently stores category (B) as unlinked historical rows.
-- That would make the old invoices invisible from the real customer identity.
--
-- Approved behavior
-- -----------------
-- * Existing customers remain untouched.
-- * Safe unmatched identities are created in the canonical public.customers master.
-- * Every historical source descriptor is mapped to the created customer before
--   invoice rows are inserted.
-- * Customer creation and historical-row import are one transaction.
-- * Ambiguous/conflicting/source-error identities are NOT auto-created.
--
-- Safe-create classes:
--   1) Valid Saudi mobile + CUSTOMER_PHONE_NOT_FOUND.
--   2) Legacy customer code not found, with NO exact current-name candidate.
--   3) Invalid/foreign source phone with NO exact current-name candidate:
--      the customer is created with phone=NULL because the canonical customer
--      master intentionally allows imported customers with no phone; the raw
--      source phone stays preserved in the historical source map and invoice row.
--
-- Explicitly NOT auto-created:
--   * identifier conflicts (e.g. Lena phone/name conflict),
--   * source #ERROR!,
--   * code-not-found rows whose exact name already belongs to a current customer.
--
-- Architecture / Safety
-- ---------------------
-- * Uses canonical public.customers. No parallel customer master.
-- * Uses the existing customer_number DEFAULT generator; does not invent a
--   parallel numbering scheme.
-- * Requires BOTH appointmentDataImport.add AND customers.add.
-- * No UPDATE/DELETE on existing customers.
-- * No RLS or role-permission widening.
-- * No DELETE / TRUNCATE / DROP.
-- * R44 pruning, Offline/Sync, invoices, appointments are untouched.
-- * Migration aborts if historical import rows already exist.

begin;

-- ---------------------------------------------------------------------------
-- 0) Fail-closed preconditions
-- ---------------------------------------------------------------------------
do $$
declare
  v_batches bigint;
  v_rows bigint;
  v_errors bigint;
  v_phone_nullable text;
  v_customer_number_default text;
begin
  if to_regclass('public.appointment_historical_sales_import_batches') is null
     or to_regclass('public.appointment_historical_sales_rows') is null
     or to_regclass('public.appointment_historical_sales_import_errors') is null then
    raise exception 'R44R38R20R10_PRECONDITION_HISTORICAL_IMPORT_SCHEMA_MISSING';
  end if;

  select count(*) into v_batches from public.appointment_historical_sales_import_batches;
  select count(*) into v_rows from public.appointment_historical_sales_rows;
  select count(*) into v_errors from public.appointment_historical_sales_import_errors;

  if v_batches<>0 or v_rows<>0 or v_errors<>0 then
    raise exception 'R44R38R20R10_REQUIRES_PRE_IMPORT_EMPTY_STATE batches=% rows=% errors=%',
      v_batches,v_rows,v_errors;
  end if;

  if to_regprocedure('public.appointment_historical_customer_match_r44r38r20(text)') is null
     or to_regprocedure('public.normalize_customer_phone(text)') is null
     or to_regprocedure('public.has_screen_permission(text,text)') is null then
    raise exception 'R44R38R20R10_PRECONDITION_REQUIRED_FUNCTION_MISSING';
  end if;

  select is_nullable,column_default
    into v_phone_nullable,v_customer_number_default
  from information_schema.columns
  where table_schema='public' and table_name='customers' and column_name='phone';

  if v_phone_nullable<>'YES' then
    raise exception 'R44R38R20R10_PRECONDITION_CUSTOMER_PHONE_MUST_ALLOW_NULL';
  end if;

  select column_default into v_customer_number_default
  from information_schema.columns
  where table_schema='public' and table_name='customers' and column_name='customer_number';

  if nullif(v_customer_number_default,'') is null then
    raise exception 'R44R38R20R10_PRECONDITION_CUSTOMER_NUMBER_DEFAULT_MISSING';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Audit-only preparation ledger + source-to-customer resolution map
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_historical_customer_prepare_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text,
  total_source_rows integer not null default 0 check(total_source_rows>=0),
  created_customers integer not null default 0 check(created_customers>=0),
  mapped_source_identities integer not null default 0 check(mapped_source_identities>=0),
  review_source_rows integer not null default 0 check(review_source_rows>=0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_historical_customer_source_map (
  id uuid primary key default gen_random_uuid(),
  prepare_run_id uuid references public.appointment_historical_customer_prepare_runs(id) on delete set null,
  source_identity_key text not null unique,
  source_customer_raw text not null,
  source_name text not null,
  source_code_raw text,
  source_phone_raw text,
  source_phone_normalized text,
  customer_id uuid not null references public.customers(id) on delete restrict,
  resolution_method text not null,
  customer_created_by_import boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_appointment_hist_customer_map_customer
  on public.appointment_historical_customer_source_map(customer_id,created_at);

alter table public.appointment_historical_customer_prepare_runs enable row level security;
alter table public.appointment_historical_customer_source_map enable row level security;

-- No direct authenticated policies/grants are added. Access is through the
-- permission-checked SECURITY DEFINER RPCs below.

-- Detailed method preserves new/name/map semantics without replacing the
-- already-installed legacy constrained customer_match_method column.
alter table public.appointment_historical_sales_rows
  add column if not exists customer_match_method_detail text not null default 'none';

-- ---------------------------------------------------------------------------
-- 2) Stable source identity normalization
-- ---------------------------------------------------------------------------
create or replace function public.appointment_historical_customer_source_key_r44r38r20(p_value text)
returns text
language sql
immutable
set search_path=public
as $$
  select lower(regexp_replace(btrim(coalesce(p_value,'')),'\s+',' ','g'))
$$;

revoke all on function public.appointment_historical_customer_source_key_r44r38r20(text) from public,anon;

-- ---------------------------------------------------------------------------
-- 3) Canonical matcher: existing rules + authoritative historical source map
-- ---------------------------------------------------------------------------
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
  v_name_key text;
  v_name_match uuid;
  v_name_count integer:=0;
  v_name_match_number text;
  v_name_match_name text;
  v_source_key text;
  v_mapped_customer uuid;
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

  -- R20R10: an explicit historical source-resolution map is authoritative.
  -- It is populated only by the guarded historical-customer creation gate.
  v_source_key:=public.appointment_historical_customer_source_key_r44r38r20(v_raw);
  if v_phone_raw is not null then
    v_phone_norm:=public.normalize_customer_phone(v_phone_raw);
  end if;

  select m.customer_id into v_mapped_customer
  from public.appointment_historical_customer_source_map m
  where m.source_identity_key=v_source_key
  order by m.created_at,m.id
  limit 1;

  if v_mapped_customer is not null then
    select c.customer_number,c.customer_name
      into v_match_number,v_match_name
    from public.customers c
    where c.id=v_mapped_customer;

    if found then
      return jsonb_build_object(
        'raw',v_raw,
        'name',coalesce(v_name,v_raw),
        'code',v_code_raw,
        'phone',v_phone_raw,
        'normalizedPhone',nullif(v_phone_norm,''),
        'customerId',v_mapped_customer,
        'status','matched',
        'method','historical_customer_map',
        'matchedCustomerNumber',v_match_number,
        'matchedCustomerName',v_match_name,
        'warning',null
      );
    end if;
  end if;

  -- Exact unique-name candidate is ONLY a guarded fallback / conflict detector.
  -- It never overrides a contradictory explicit customer code or a mobile that
  -- belongs to another current customer.
  if coalesce(v_warning,'') <> 'CUSTOMER_SOURCE_ERROR' then
    v_name_key:=lower(regexp_replace(coalesce(v_name,''),'[^[:alnum:]]+','','g'));
    if nullif(v_name_key,'') is not null then
      select count(*) into v_name_count
      from public.customers c
      where lower(regexp_replace(coalesce(c.customer_name,''),'[^[:alnum:]]+','','g'))=v_name_key;

      if v_name_count=1 then
        select c.id,c.customer_number,c.customer_name
          into v_name_match,v_name_match_number,v_name_match_name
        from public.customers c
        where lower(regexp_replace(coalesce(c.customer_name,''),'[^[:alnum:]]+','','g'))=v_name_key
        order by c.created_at,c.id
        limit 1;
      end if;
    end if;
  end if;

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
        -- Legacy workbook codes are zero-padded (e.g. 000178) while the
        -- canonical customer master may store the same code as 178.
        -- Compare numeric-equivalent digit strings only as a fallback.
        select count(*) into v_count
        from public.customers c
        where nullif(regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g'),'') is not null
          and coalesce(
                nullif(ltrim(regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g'),'0'),''),
                '0'
              )
              =
              coalesce(nullif(ltrim(v_code_digits,'0'),''),'0');
        if v_count=1 then
          select c.id into v_code_match
          from public.customers c
          where nullif(regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g'),'') is not null
            and coalesce(
                  nullif(ltrim(regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g'),'0'),''),
                  '0'
                )
                =
                coalesce(nullif(ltrim(v_code_digits,'0'),''),'0')
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

  -- A successful explicit code must not silently override an exact unique name
  -- that belongs to a DIFFERENT current customer.
  if v_match is not null
     and v_method='legacy_code'
     and v_name_match is not null
     and v_name_match<>v_match then
    v_match:=null;
    v_status:='needs_review';
    v_method:='none';
    v_warning:='CUSTOMER_CODE_NAME_CONFLICT';
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
          -- Strong mobile match, but stop if the exact unique source name points
          -- at another current customer.
          if v_name_match is not null and v_name_match<>v_phone_match then
            v_status:='needs_review';
            v_method:='none';
            v_warning:='CUSTOMER_PHONE_NAME_CONFLICT';
          else
            v_match:=v_phone_match;
            v_status:='matched';
            v_method:='mobile';
            v_warning:=null;
          end if;
        elsif v_count>1 then
          v_status:='needs_review';
          v_method:='none';
          v_warning:='CUSTOMER_PHONE_AMBIGUOUS';
        elsif v_code_raw is null and v_name_match is not null then
          -- Third and weakest authority: exact UNIQUE name, only when the mobile
          -- does not identify any other current customer and there is no code.
          v_match:=v_name_match;
          v_status:='matched';
          v_method:='exact_unique_name';
          v_warning:='CUSTOMER_PHONE_NOT_FOUND_NAME_FALLBACK';
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
      if v_match is null and v_code_raw is null and v_name_match is not null then
        v_match:=v_name_match;
        v_status:='matched';
        v_method:='exact_unique_name';
        v_warning:='CUSTOMER_PHONE_INVALID_NAME_FALLBACK';
      elsif v_match is null then
        v_status:='needs_review';
        v_warning:=coalesce(v_warning,'CUSTOMER_PHONE_INVALID_OR_FOREIGN');
      end if;
    end if;
  end if;

  -- 3) Exact UNIQUE name fallback when no authoritative identifier exists.
  -- Explicit-but-unmatched customer codes remain unresolved; name never overrides them.
  if v_match is null
     and v_code_raw is null
     and v_phone_raw is null
     and v_warning <> 'CUSTOMER_SOURCE_ERROR'
     and v_name_match is not null then
    v_match:=v_name_match;
    v_status:='matched';
    v_method:='exact_unique_name';
    v_warning:=
      case
        when v_warning='CUSTOMER_CODE_INCOMPLETE' then 'CUSTOMER_CODE_INCOMPLETE_NAME_FALLBACK'
        when v_warning='CUSTOMER_IDENTIFIER_MISSING' then 'CUSTOMER_IDENTIFIER_MISSING_NAME_FALLBACK'
        else v_warning
      end;
  end if;

  if v_match is null
     and v_code_raw is null
     and v_phone_raw is null
     and v_warning in ('CUSTOMER_CODE_INCOMPLETE','CUSTOMER_SOURCE_ERROR','CUSTOMER_IDENTIFIER_MISSING') then
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

revoke all on function public.appointment_historical_customer_match_r44r38r20(text) from public,anon;

-- ---------------------------------------------------------------------------
-- 4) Read-only customer-creation plan (single canonical classification source)
-- ---------------------------------------------------------------------------
create or replace function public.appointment_historical_customer_creation_plan_rows_r44r38r20(p_rows jsonb)
returns table (
  source_customer_raw text,
  source_rows integer,
  source_name text,
  source_code text,
  source_phone text,
  normalized_phone text,
  match_status text,
  match_method text,
  warning text,
  exact_current_name_matches integer,
  identity_key text,
  create_phone text,
  creation_method text,
  action text
)
language sql
stable
security definer
set search_path=public
as $$
with source_customer as (
  select
    btrim(coalesce(x.value->>'customer','')) as raw_customer,
    count(*)::integer as source_rows
  from jsonb_array_elements(p_rows) x
  group by btrim(coalesce(x.value->>'customer',''))
),
parsed as (
  select
    s.raw_customer,
    s.source_rows,
    public.appointment_historical_customer_match_r44r38r20(s.raw_customer) as info
  from source_customer s
),
base as (
  select
    p.raw_customer,
    p.source_rows,
    p.info->>'name' as source_name,
    p.info->>'code' as source_code,
    p.info->>'phone' as source_phone,
    p.info->>'normalizedPhone' as normalized_phone,
    p.info->>'status' as match_status,
    p.info->>'method' as match_method,
    p.info->>'warning' as warning,
    lower(regexp_replace(coalesce(p.info->>'name',''),'[^[:alnum:]]+','','g')) as name_key,
    (
      select count(*)::integer
      from public.customers c
      where lower(regexp_replace(coalesce(c.customer_name,''),'[^[:alnum:]]+','','g'))
            = lower(regexp_replace(coalesce(p.info->>'name',''),'[^[:alnum:]]+','','g'))
        and lower(regexp_replace(coalesce(p.info->>'name',''),'[^[:alnum:]]+','','g')) <> ''
    ) as exact_name_count
  from parsed p
),
preclassified as (
  select
    b.*,
    case
      when b.match_status='matched' then 'existing'
      when b.match_status='not_applicable' then 'cash'
      when b.match_status='unmatched'
       and b.warning='CUSTOMER_PHONE_NOT_FOUND'
       and coalesce(b.normalized_phone,'') ~ '^05[0-9]{8}$'
        then 'candidate'
      when b.match_status='unmatched'
       and b.warning='CUSTOMER_CODE_NOT_FOUND'
       and nullif(b.source_code,'') is not null
       and b.exact_name_count=0
        then 'candidate'
      when b.match_status='needs_review'
       and b.warning='CUSTOMER_PHONE_INVALID_OR_FOREIGN'
       and b.exact_name_count=0
       and nullif(b.name_key,'') is not null
        then 'candidate'
      else 'review'
    end as preliminary_action,

    case
      when b.match_status='unmatched'
       and b.warning='CUSTOMER_PHONE_NOT_FOUND'
       and coalesce(b.normalized_phone,'') ~ '^05[0-9]{8}$'
        then 'phone:'||b.normalized_phone
      when b.match_status='unmatched'
       and b.warning='CUSTOMER_CODE_NOT_FOUND'
       and nullif(b.source_code,'') is not null
       and b.exact_name_count=0
        then 'legacy_code:'||upper(btrim(b.source_code))
      when b.match_status='needs_review'
       and b.warning='CUSTOMER_PHONE_INVALID_OR_FOREIGN'
       and b.exact_name_count=0
       and nullif(b.name_key,'') is not null
        then 'unusable_phone:'||
             regexp_replace(coalesce(b.source_phone,''),'[^0-9]','','g')||
             ':name:'||b.name_key
      else null
    end as candidate_identity_key,

    case
      when b.match_status='unmatched'
       and b.warning='CUSTOMER_PHONE_NOT_FOUND'
       and coalesce(b.normalized_phone,'') ~ '^05[0-9]{8}$'
        then b.normalized_phone
      else null
    end as candidate_phone,

    case
      when b.match_status='unmatched' and b.warning='CUSTOMER_PHONE_NOT_FOUND'
        then 'created_from_new_mobile'
      when b.match_status='unmatched' and b.warning='CUSTOMER_CODE_NOT_FOUND'
        then 'created_from_new_legacy_code'
      when b.match_status='needs_review' and b.warning='CUSTOMER_PHONE_INVALID_OR_FOREIGN'
        then 'created_without_usable_phone'
      else null
    end as candidate_method
  from base b
),
identity_stats as (
  select
    candidate_identity_key,
    count(distinct name_key)::integer as distinct_names
  from preclassified
  where preliminary_action='candidate' and candidate_identity_key is not null
  group by candidate_identity_key
),
name_stats as (
  select
    name_key,
    count(distinct candidate_identity_key)::integer as distinct_identities
  from preclassified
  where preliminary_action='candidate'
    and candidate_identity_key is not null
    and nullif(name_key,'') is not null
  group by name_key
)
select
  p.raw_customer as source_customer_raw,
  p.source_rows,
  coalesce(nullif(p.source_name,''),p.raw_customer) as source_name,
  nullif(p.source_code,'') as source_code,
  nullif(p.source_phone,'') as source_phone,
  nullif(p.normalized_phone,'') as normalized_phone,
  p.match_status,
  p.match_method,
  nullif(p.warning,'') as warning,
  p.exact_name_count as exact_current_name_matches,
  p.candidate_identity_key as identity_key,
  p.candidate_phone as create_phone,
  p.candidate_method as creation_method,
  case
    when p.preliminary_action<>'candidate' then p.preliminary_action
    when coalesce(i.distinct_names,0)<>1 then 'review'
    when coalesce(n.distinct_identities,0)<>1 then 'review'
    else 'create'
  end as action
from preclassified p
left join identity_stats i on i.candidate_identity_key=p.candidate_identity_key
left join name_stats n on n.name_key=p.name_key
$$;

revoke all on function public.appointment_historical_customer_creation_plan_rows_r44r38r20(jsonb) from public,anon,authenticated;

create or replace function public.plan_appointment_historical_customer_creation_r44r38r20(p_rows jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_summary jsonb;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not public.has_screen_permission('appointmentDataImport','view') then raise exception 'permission_denied'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'APPOINTMENT_HISTORY_ROWS_INVALID'; end if;

  select jsonb_build_object(
    'totalSourceRows',coalesce(sum(source_rows),0),
    'existingMatchedRows',coalesce(sum(source_rows) filter(where action='existing'),0),
    'cashRows',coalesce(sum(source_rows) filter(where action='cash'),0),
    'newCustomers',count(distinct identity_key) filter(where action='create'),
    'newCustomerSourceRows',coalesce(sum(source_rows) filter(where action='create'),0),
    'reviewSourceRows',coalesce(sum(source_rows) filter(where action='review'),0),
    'reviewIdentities',count(*) filter(where action='review')
  )
  into v_summary
  from public.appointment_historical_customer_creation_plan_rows_r44r38r20(p_rows);

  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.action when 'create' then 1 when 'review' then 2 when 'existing' then 3 else 4 end,
    x.source_rows desc,
    x.source_customer_raw
  ),'[]'::jsonb)
  into v_rows
  from public.appointment_historical_customer_creation_plan_rows_r44r38r20(p_rows) x;

  return jsonb_build_object('summary',coalesce(v_summary,'{}'::jsonb),'rows',v_rows);
end;
$$;

revoke all on function public.plan_appointment_historical_customer_creation_r44r38r20(jsonb) from public,anon;
grant execute on function public.plan_appointment_historical_customer_creation_r44r38r20(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Internal write gate: create canonical customers + source mappings
-- ---------------------------------------------------------------------------
create or replace function public.prepare_appointment_historical_customers_r44r38r20(
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
  v_run uuid;
  v_user uuid:=auth.uid();
  v_group record;
  v_source record;
  v_customer_id uuid;
  v_customer_number text;
  v_existing_count integer;
  v_created integer:=0;
  v_mapped integer:=0;
  v_review_rows integer:=0;
  v_total_rows integer:=0;
  v_created_this_group boolean;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not public.has_screen_permission('appointmentDataImport','add') then
    raise exception 'APPOINTMENT_HISTORY_IMPORT_PERMISSION_REQUIRED' using errcode='42501';
  end if;
  if not public.has_screen_permission('customers','add') then
    raise exception 'CUSTOMER_ADD_PERMISSION_REQUIRED_FOR_HISTORICAL_IMPORT' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'APPOINTMENT_HISTORY_ROWS_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_file_name,'')),'') is null then
    raise exception 'APPOINTMENT_HISTORY_FILE_NAME_REQUIRED';
  end if;

  select
    coalesce(sum(source_rows),0)::integer,
    coalesce(sum(source_rows) filter(where action='review'),0)::integer
  into v_total_rows,v_review_rows
  from public.appointment_historical_customer_creation_plan_rows_r44r38r20(p_rows);

  insert into public.appointment_historical_customer_prepare_runs(
    file_name,file_sha256,total_source_rows,review_source_rows,created_by
  )
  values(
    btrim(p_file_name),
    nullif(btrim(coalesce(p_file_sha256,'')),''),
    v_total_rows,
    v_review_rows,
    v_user
  )
  returning id into v_run;

  for v_group in
    select
      identity_key,
      min(source_name) as source_name,
      max(create_phone) as create_phone,
      min(creation_method) as creation_method
    from public.appointment_historical_customer_creation_plan_rows_r44r38r20(p_rows)
    where action='create'
      and identity_key is not null
    group by identity_key
    order by
      case
        when max(create_phone) is not null then 1
        when min(creation_method)='created_without_usable_phone' then 2
        else 3
      end,
      identity_key
  loop
    v_customer_id:=null;
    v_customer_number:=null;
    v_created_this_group:=false;

    -- Race-safe mobile ownership recheck.
    if v_group.create_phone is not null then
      select count(*)::integer,min(c.id::text)::uuid
      into v_existing_count,v_customer_id
      from public.customers c
      where c.normalized_phone=v_group.create_phone;

      if v_existing_count>1 then
        raise exception 'HISTORICAL_NEW_CUSTOMER_PHONE_AMBIGUOUS:%',v_group.create_phone;
      end if;
    else
      v_existing_count:=0;
    end if;

    if v_customer_id is null then
      begin
        insert into public.customers(customer_name,phone,created_by)
        values(
          v_group.source_name,
          nullif(v_group.create_phone,''),
          v_user
        )
        returning id,customer_number into v_customer_id,v_customer_number;
        v_created:=v_created+1;
        v_created_this_group:=true;
      exception
        when unique_violation then
          if v_group.create_phone is not null then
            select c.id,c.customer_number
              into v_customer_id,v_customer_number
            from public.customers c
            where c.normalized_phone=v_group.create_phone
            order by c.created_at,c.id
            limit 1;
          end if;
          if v_customer_id is null then raise; end if;
      end;
    end if;

    if v_customer_number is null then
      select c.customer_number into v_customer_number
      from public.customers c
      where c.id=v_customer_id;
    end if;

    for v_source in
      select *
      from public.appointment_historical_customer_creation_plan_rows_r44r38r20(p_rows)
      where action='create'
        and identity_key=v_group.identity_key
      order by source_customer_raw
    loop
      insert into public.appointment_historical_customer_source_map(
        prepare_run_id,source_identity_key,source_customer_raw,source_name,
        source_code_raw,source_phone_raw,source_phone_normalized,
        customer_id,resolution_method,customer_created_by_import,created_by
      )
      values(
        v_run,
        public.appointment_historical_customer_source_key_r44r38r20(v_source.source_customer_raw),
        v_source.source_customer_raw,
        v_source.source_name,
        v_source.source_code,
        v_source.source_phone,
        v_source.normalized_phone,
        v_customer_id,
        v_source.creation_method,
        v_created_this_group,
        v_user
      )
      on conflict(source_identity_key) do nothing;

      if exists(
        select 1
        from public.appointment_historical_customer_source_map m
        where m.source_identity_key=
              public.appointment_historical_customer_source_key_r44r38r20(v_source.source_customer_raw)
          and m.customer_id=v_customer_id
      ) then
        v_mapped:=v_mapped+1;
      else
        raise exception 'HISTORICAL_CUSTOMER_SOURCE_MAP_CONFLICT:%',v_source.source_customer_raw;
      end if;
    end loop;
  end loop;

  update public.appointment_historical_customer_prepare_runs
  set created_customers=v_created,
      mapped_source_identities=v_mapped
  where id=v_run;

  return jsonb_build_object(
    'runId',v_run,
    'summary',jsonb_build_object(
      'totalSourceRows',v_total_rows,
      'createdCustomers',v_created,
      'mappedSourceIdentities',v_mapped,
      'reviewSourceRows',v_review_rows
    )
  );
end;
$$;

revoke all on function public.prepare_appointment_historical_customers_r44r38r20(text,text,jsonb)
  from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 6) Import remains the single public write action.
--    It now prepares safe new customers atomically before inserting history.
-- ---------------------------------------------------------------------------
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
  v_customer_prepare jsonb;
  v_created_customers integer:=0;
  v_mapped_identities integer:=0;
begin
  if not public.has_screen_permission('appointmentDataImport','add') then raise exception 'permission_denied'; end if;
  if nullif(btrim(coalesce(p_file_name,'')),'') is null then raise exception 'APPOINTMENT_HISTORY_FILE_NAME_REQUIRED'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'APPOINTMENT_HISTORY_ROWS_REQUIRED'; end if;

  -- Prepare genuinely new customers first, inside the SAME import transaction.
  -- If the import later fails, these customer inserts roll back with it.
  v_customer_prepare:=public.prepare_appointment_historical_customers_r44r38r20(
    p_file_name,
    p_file_sha256,
    p_rows
  );
  begin
    v_created_customers:=coalesce((v_customer_prepare#>>'{summary,createdCustomers}')::integer,0);
    v_mapped_identities:=coalesce((v_customer_prepare#>>'{summary,mappedSourceIdentities}')::integer,0);
  exception when others then
    v_created_customers:=0;
    v_mapped_identities:=0;
  end;

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
        customer_id,customer_match_status,customer_match_method,customer_match_method_detail,matched_customer_number_snapshot,matched_customer_name_snapshot,
        unit_price,quantity,discount_amount,tax_amount,sales_inclusive,sales_before_tax,payment_method,
        validation_warnings,original_row,created_by
      ) values(
        v_batch,v_source,v_fp,v_norm->>'recordType',
        nullif(v_norm->>'itemNameRaw',''),v_norm->>'itemNameDisplay',coalesce((v_norm->>'itemUnspecified')::boolean,false),nullif(v_norm->>'serviceTypeId','')::uuid,
        v_norm->>'vehicle',nullif(v_norm->>'carId','')::uuid,
        nullif(v_norm->>'dateRaw',''),(v_norm->>'date')::date,nullif(v_norm->>'month',''),coalesce((v_norm->>'dateCorrected')::boolean,false),nullif(v_norm->>'dateCorrectionCode',''),
        v_norm->>'invoiceNumber',
        v_norm->>'customerRaw',v_norm->>'customerName',v_norm->>'customerName',nullif(v_norm->>'customerCode',''),nullif(v_norm->>'customerPhone',''),nullif(v_norm->>'customerPhoneNormalized',''),
        nullif(v_norm->>'customerId','')::uuid,
        v_norm->>'customerMatchStatus',
        case
          when v_norm->>'customerMatchMethod' in ('legacy_code','mobile','cash_aggregate') then v_norm->>'customerMatchMethod'
          else 'none'
        end,
        coalesce(nullif(v_norm->>'customerMatchMethod',''),'none'),
        nullif(v_norm->>'matchedCustomerNumber',''),
        nullif(v_norm->>'matchedCustomerName',''),
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
      'cashAggregates',v_cash,'correctedDates',v_corrected,
      'createdCustomers',v_created_customers,'mappedSourceIdentities',v_mapped_identities
    ),
    'customerPreparation',v_customer_prepare,
    'rows',v_results
  );
exception when others then
  if v_batch is not null then
    update public.appointment_historical_sales_import_batches set status='failed',completed_at=now() where id=v_batch;
  end if;
  raise;
end;
$$;

revoke all on function public.import_appointment_historical_sales_r44r38r20(text,text,jsonb) from public,anon;
grant execute on function public.import_appointment_historical_sales_r44r38r20(text,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Reporting view: preserve every existing column and append detail only.
-- ---------------------------------------------------------------------------
create or replace view public.appointment_historical_sales_reporting
with (security_invoker=true)
as
select
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
  h.matched_customer_name_snapshot,
  h.customer_match_method_detail
from public.appointment_historical_sales_rows h;

-- Existing SELECT grant is preserved by CREATE OR REPLACE VIEW.

-- ---------------------------------------------------------------------------
-- 8) Localization additions through the existing localization architecture
-- ---------------------------------------------------------------------------
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  (
    'appointmentDataImport.note','appointmentDataImport','appointments','help',
    'رفع بيانات المبيعات القديمة بعد فحصها وربط العملاء الحاليين بالكود ثم الجوال ثم الاسم المطابق بشكل فريد، وإنشاء العملاء غير الموجودين فعليًا قبل ربط الفواتير.',
    'Import historical sales after validation: link existing customers by code, then mobile, then an exact unique name, and create genuinely missing customers before linking invoices.',
    'رفع بيانات المبيعات القديمة بعد فحصها وربط العملاء الحاليين بالكود ثم الجوال ثم الاسم المطابق بشكل فريد، وإنشاء العملاء غير الموجودين فعليًا قبل ربط الفواتير.',
    'Import historical sales after validation: link existing customers by code, then mobile, then an exact unique name, and create genuinely missing customers before linking invoices.',
    true,now()
  ),
  (
    'appointmentDataImport.rule.customerMatch','appointmentDataImport','appointments','help',
    'يتم الربط بالكود أولًا ثم الجوال ثم الاسم المطابق بشكل فريد. العملاء غير الموجودين فعليًا يُنشؤون كعملاء جدد، بينما التعارضات تبقى للمراجعة.',
    'Matching uses code first, then mobile, then an exact unique name. Genuinely missing customers are created; conflicts remain for review.',
    'يتم الربط بالكود أولًا ثم الجوال ثم الاسم المطابق بشكل فريد. العملاء غير الموجودين فعليًا يُنشؤون كعملاء جدد، بينما التعارضات تبقى للمراجعة.',
    'Matching uses code first, then mobile, then an exact unique name. Genuinely missing customers are created; conflicts remain for review.',
    true,now()
  ),
  (
    'appointmentDataImport.rule.newCustomers','appointmentDataImport','appointments','help',
    'العملاء غير الموجودين فعليًا يتم إنشاؤهم كعملاء جدد وربط فواتيرهم التاريخية تلقائيًا، مع إبقاء حالات التعارض للمراجعة.',
    'Genuinely missing customers are created in the canonical customer master and linked to their historical invoices; conflicts remain for review.',
    'العملاء غير الموجودين فعليًا يتم إنشاؤهم كعملاء جدد وربط فواتيرهم التاريخية تلقائيًا، مع إبقاء حالات التعارض للمراجعة.',
    'Genuinely missing customers are created in the canonical customer master and linked to their historical invoices; conflicts remain for review.',
    true,now()
  ),
  (
    'appointmentDataImport.match.name','appointmentDataImport','appointments','status',
    'مطابق بالاسم المؤكد','Matched by exact unique name',
    'مطابق بالاسم المؤكد','Matched by exact unique name',true,now()
  ),
  (
    'appointmentDataImport.match.created','appointmentDataImport','appointments','status',
    'عميل جديد تم إنشاؤه','New customer created',
    'عميل جديد تم إنشاؤه','New customer created',true,now()
  ),
  (
    'appointmentDataImport.summary.newCustomers','appointmentDataImport','appointments','label',
    'عملاء جدد سيتم إنشاؤهم','New customers to create',
    'عملاء جدد سيتم إنشاؤهم','New customers to create',true,now()
  )
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Production verification — READ ONLY
-- ---------------------------------------------------------------------------
select
  case
    when to_regclass('public.appointment_historical_customer_prepare_runs') is not null
     and to_regclass('public.appointment_historical_customer_source_map') is not null
     and to_regprocedure('public.plan_appointment_historical_customer_creation_r44r38r20(jsonb)') is not null
     and to_regprocedure('public.prepare_appointment_historical_customers_r44r38r20(text,text,jsonb)') is not null
     and to_regprocedure('public.appointment_historical_customer_source_key_r44r38r20(text)') is not null
     and to_regprocedure('public.appointment_historical_customer_match_r44r38r20(text)') is not null
     and to_regprocedure('public.import_appointment_historical_sales_r44r38r20(text,text,jsonb)') is not null
     and exists(
       select 1 from information_schema.columns
       where table_schema='public'
         and table_name='appointment_historical_sales_rows'
         and column_name='customer_match_method_detail'
     )
     and (select count(*) from public.appointment_historical_sales_import_batches)=0
     and (select count(*) from public.appointment_historical_sales_rows)=0
     and (select count(*) from public.appointment_historical_sales_import_errors)=0
    then 'R44R38R20R10_NEW_CUSTOMER_CREATION_GATE_OK'
    else 'R44R38R20R10_NEW_CUSTOMER_CREATION_GATE_REVIEW'
  end as status,

  (select count(*)::integer
   from information_schema.tables
   where table_schema='public'
     and table_name in (
       'appointment_historical_customer_prepare_runs',
       'appointment_historical_customer_source_map'
     )) as customer_creation_tables,

  (select count(*)::integer
   from information_schema.routines
   where routine_schema='public'
     and routine_name in (
       'appointment_historical_customer_source_key_r44r38r20',
       'appointment_historical_customer_creation_plan_rows_r44r38r20',
       'plan_appointment_historical_customer_creation_r44r38r20',
       'prepare_appointment_historical_customers_r44r38r20',
       'appointment_historical_customer_match_r44r38r20',
       'import_appointment_historical_sales_r44r38r20'
     )) as customer_creation_routines,

  (select count(*)::integer
   from information_schema.columns
   where table_schema='public'
     and table_name='appointment_historical_sales_rows'
     and column_name='customer_match_method_detail') as method_detail_column,

  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='prepare_appointment_historical_customers_r44r38r20'
     and pg_get_functiondef(p.oid) ilike '%has_screen_permission(''appointmentDataImport'',''add'')%'
     and pg_get_functiondef(p.oid) ilike '%has_screen_permission(''customers'',''add'')%') as dual_permission_guard,

  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='import_appointment_historical_sales_r44r38r20'
     and pg_get_functiondef(p.oid) ilike '%prepare_appointment_historical_customers_r44r38r20%') as atomic_import_link,

  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='appointment_historical_customer_match_r44r38r20'
     and pg_get_functiondef(p.oid) ilike '%appointment_historical_customer_source_map%'
     and pg_get_functiondef(p.oid) ilike '%historical_customer_map%') as source_map_matcher,

  (select count(*)::integer
   from public.app_translations
   where translation_key in (
     'appointmentDataImport.note',
     'appointmentDataImport.rule.customerMatch',
     'appointmentDataImport.rule.newCustomers',
     'appointmentDataImport.match.name',
     'appointmentDataImport.match.created',
     'appointmentDataImport.summary.newCustomers'
   )) as new_translation_rows,

  (select count(*)::integer from public.appointment_historical_customer_prepare_runs) as prepare_run_rows,
  (select count(*)::integer from public.appointment_historical_customer_source_map) as source_map_rows,
  (select count(*)::integer from public.appointment_historical_sales_import_batches) as batch_rows,
  (select count(*)::integer from public.appointment_historical_sales_rows) as imported_rows,
  (select count(*)::integer from public.appointment_historical_sales_import_errors) as error_rows;

-- PETATOE R44R38R20R7
-- Null-Safe Exact Unique Name Fallback Recovery
--
-- Root Cause:
--   R20R6 used:
--       IF v_warning <> 'CUSTOMER_SOURCE_ERROR' THEN
--   When v_warning is NULL (normal mobile/code cases), PostgreSQL evaluates the
--   predicate to NULL rather than TRUE, so the exact-unique-name candidate block
--   was skipped.
--
-- Fix:
--   Use a NULL-safe predicate:
--       IF coalesce(v_warning,'') <> 'CUSTOMER_SOURCE_ERROR' THEN
--
-- Scope:
--   Modify ONLY public.appointment_historical_customer_match_r44r38r20(text)
--
-- Safety:
--   * No customer writes
--   * No invoice writes
--   * No historical import rows written
--   * No RLS / permission changes
--   * No DELETE / TRUNCATE / DROP
--   * Stops if any import rows already exist

begin;

do $$
begin
  if (select count(*) from public.appointment_historical_sales_import_batches) <> 0
     or (select count(*) from public.appointment_historical_sales_rows) <> 0
     or (select count(*) from public.appointment_historical_sales_import_errors) <> 0 then
    raise exception 'R44R38R20R7_SAFETY_STOP: historical import data already exists';
  end if;

  if to_regprocedure('public.appointment_historical_customer_match_r44r38r20(text)') is null then
    raise exception 'R44R38R20R7_SAFETY_STOP: canonical customer matcher is missing';
  end if;
end
$$;

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

commit;

-- Verification probes
with probes(raw_customer, expected_status, expected_method, expected_number, expected_warning) as (
  values
    ('Amer #000178','matched','legacy_code','178',null),
    ('966541555268 - Abdulaziz Alsemeri','matched','exact_unique_name','14','CUSTOMER_PHONE_NOT_FOUND_NAME_FALLBACK'),
    ('Abdullah Farsi #','matched','exact_unique_name','513','CUSTOMER_CODE_INCOMPLETE_NAME_FALLBACK'),
    ('Rabia Binmahfouz #000094','unmatched','none',null,'CUSTOMER_CODE_NOT_FOUND'),
    ('966554055635 - Lena','needs_review','none',null,'CUSTOMER_PHONE_NAME_CONFLICT'),
    ('#ERROR!','needs_review','none',null,'CUSTOMER_SOURCE_ERROR')
),
results as (
  select
    p.*,
    public.appointment_historical_customer_match_r44r38r20(p.raw_customer) as result
  from probes p
),
checks as (
  select *,
    (
      result->>'status'=expected_status
      and result->>'method'=expected_method
      and coalesce(result->>'matchedCustomerNumber','')=coalesce(expected_number,'')
      and coalesce(result->>'warning','')=coalesce(expected_warning,'')
    ) as passed
  from results
)
select
  case
    when (select count(*) from checks where passed)=6
     and (select count(*) from public.appointment_historical_sales_import_batches)=0
     and (select count(*) from public.appointment_historical_sales_rows)=0
     and (select count(*) from public.appointment_historical_sales_import_errors)=0
    then 'R44R38R20R7_NULL_SAFE_NAME_FALLBACK_OK'
    else 'R44R38R20R7_NULL_SAFE_NAME_FALLBACK_REVIEW'
  end as status,
  (select count(*)::integer from checks where passed) as probes_passed,
  (select coalesce(jsonb_agg(jsonb_build_object(
      'raw',raw_customer,
      'expected_status',expected_status,
      'actual_status',result->>'status',
      'expected_method',expected_method,
      'actual_method',result->>'method',
      'expected_number',expected_number,
      'actual_number',result->>'matchedCustomerNumber',
      'expected_warning',expected_warning,
      'actual_warning',result->>'warning',
      'passed',passed
    )),'[]'::jsonb) from checks) as probes,
  (select count(*)::integer from public.appointment_historical_sales_import_batches) as batch_rows,
  (select count(*)::integer from public.appointment_historical_sales_rows) as imported_rows,
  (select count(*)::integer from public.appointment_historical_sales_import_errors) as error_rows;

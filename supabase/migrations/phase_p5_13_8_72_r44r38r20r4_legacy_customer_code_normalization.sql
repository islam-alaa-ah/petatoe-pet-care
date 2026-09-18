-- PETATOE R44R38R20R4
-- Legacy Customer Code Normalization
-- Root cause:
--   Excel legacy customer codes are zero-padded (000178), while the canonical
--   customers.customer_number may store the same code without padding (178).
-- Scope:
--   Modify ONLY the canonical customer matcher. No name-only matching.
-- Safety:
--   No DELETE / TRUNCATE / DROP / RLS / permission widening / business-data writes.
--   Stops if any historical import data already exists, to avoid mixed match semantics.

begin;

do $$
begin
  if (select count(*) from public.appointment_historical_sales_import_batches) <> 0
     or (select count(*) from public.appointment_historical_sales_rows) <> 0
     or (select count(*) from public.appointment_historical_sales_import_errors) <> 0 then
    raise exception 'R44R38R20R4_SAFETY_STOP: historical import data already exists';
  end if;

  if to_regprocedure('public.appointment_historical_customer_match_r44r38r20(text)') is null then
    raise exception 'R44R38R20R4_SAFETY_STOP: canonical customer matcher is missing';
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

-- Preserve the existing execution boundary.
revoke all on function public.appointment_historical_customer_match_r44r38r20(text) from public,anon;

commit;

-- Verification
with probes(raw_customer, expected_number) as (
  values
    ('Amer #000178','178'),
    ('Rabia Binmahfouz #000026','26'),
    ('Nagham Madah #000054','54')
),
probe_results as (
  select
    p.raw_customer,
    p.expected_number,
    public.appointment_historical_customer_match_r44r38r20(p.raw_customer) as result
  from probes p
),
numeric_code_collisions as (
  select normalized_code, count(*)::integer as customer_count
  from (
    select
      coalesce(
        nullif(ltrim(regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g'),'0'),''),
        '0'
      ) as normalized_code
    from public.customers c
    where nullif(regexp_replace(coalesce(c.customer_number,''),'[^0-9]','','g'),'') is not null
  ) x
  group by normalized_code
  having count(*) > 1
)
select
  case
    when to_regprocedure('public.appointment_historical_customer_match_r44r38r20(text)') is not null
     and (select count(*) from probe_results
          where result->>'status'='matched'
            and result->>'method'='legacy_code'
            and result->>'matchedCustomerNumber'=expected_number) = 3
     and (select count(*) from public.appointment_historical_sales_import_batches)=0
     and (select count(*) from public.appointment_historical_sales_rows)=0
     and (select count(*) from public.appointment_historical_sales_import_errors)=0
    then 'R44R38R20R4_LEGACY_CUSTOMER_CODE_NORMALIZATION_OK'
    else 'R44R38R20R4_LEGACY_CUSTOMER_CODE_NORMALIZATION_REVIEW'
  end as status,
  (select count(*)::integer from probe_results
   where result->>'status'='matched'
     and result->>'method'='legacy_code'
     and result->>'matchedCustomerNumber'=expected_number) as normalized_code_probes_passed,
  (select count(*)::integer from numeric_code_collisions) as normalized_code_collision_groups,
  (select coalesce(jsonb_agg(jsonb_build_object(
      'raw',raw_customer,
      'expected',expected_number,
      'status',result->>'status',
      'method',result->>'method',
      'matchedCustomerNumber',result->>'matchedCustomerNumber',
      'matchedCustomerName',result->>'matchedCustomerName',
      'warning',result->>'warning'
    )),'[]'::jsonb) from probe_results) as probes,
  (select count(*)::integer from public.appointment_historical_sales_import_batches) as batch_rows,
  (select count(*)::integer from public.appointment_historical_sales_rows) as imported_rows,
  (select count(*)::integer from public.appointment_historical_sales_import_errors) as error_rows;

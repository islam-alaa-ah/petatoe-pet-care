-- KYUM Phase 13.1 — Generated Columns Restore Hotfix
-- Fixes: cannot insert a non-DEFAULT value into column "normalized_phone"
-- Run once in the Kyum Trading Company Supabase SQL Editor.

create or replace function public.restore_kyum_backup_transactional(
  p_backup jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.app_role;
  v_total integer := 0;
  v_counts jsonb := '{}'::jsonb;
  v_table text;
  v_rows jsonb;
  v_count integer;
  v_columns text;
begin
  if p_backup is null or jsonb_typeof(p_backup) <> 'object' then
    raise exception 'Invalid backup object';
  end if;

  if p_backup ->> 'product' <> 'KYUM CRM' then
    raise exception 'This file is not a KYUM CRM backup';
  end if;

  if jsonb_typeof(p_backup -> 'tables') <> 'object' then
    raise exception 'Backup tables object is missing';
  end if;

  select role
  into v_role
  from public.user_profiles
  where id = p_actor
    and is_active = true;

  if v_role is distinct from 'super_admin'::public.app_role then
    raise exception 'Only an active Super Admin can restore backups';
  end if;

  foreach v_table in array array[
    'interest_categories',
    'no_sale_reasons',
    'sales_representatives',
    'customers',
    'customer_interests',
    'customer_followups',
    'quotations',
    'system_settings',
    'app_screens',
    'role_screen_permissions'
  ]
  loop
    if not ((p_backup -> 'tables') ? v_table) then
      raise exception 'Missing backup table: %', v_table;
    end if;

    if jsonb_typeof(p_backup -> 'tables' -> v_table) <> 'array' then
      raise exception 'Invalid backup table payload: %', v_table;
    end if;
  end loop;

  delete from public.customer_interests where true;
  delete from public.customer_followups where true;
  delete from public.quotations where true;
  delete from public.customers where true;
  delete from public.role_screen_permissions where true;
  delete from public.sales_representatives where true;
  delete from public.interest_categories where true;
  delete from public.no_sale_reasons where true;
  delete from public.app_screens where true;
  delete from public.system_settings where true;

  foreach v_table in array array[
    'interest_categories',
    'no_sale_reasons',
    'sales_representatives',
    'customers',
    'customer_interests',
    'customer_followups',
    'quotations',
    'system_settings',
    'app_screens',
    'role_screen_permissions'
  ]
  loop
    v_rows := p_backup -> 'tables' -> v_table;

    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_columns
    from pg_attribute a
    where a.attrelid = format('public.%I', v_table)::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attgenerated = '';

    if v_columns is null or btrim(v_columns) = '' then
      raise exception 'No writable columns found for table: %', v_table;
    end if;

    if jsonb_array_length(v_rows) > 0 then
      execute format(
        'insert into public.%I (%s)
         select %s
         from jsonb_populate_recordset(null::public.%I, $1)',
        v_table,
        v_columns,
        v_columns,
        v_table
      )
      using v_rows;
    end if;

    v_count := jsonb_array_length(v_rows);
    v_total := v_total + v_count;
    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  end loop;

  return jsonb_build_object(
    'success', true,
    'total_records', v_total,
    'table_counts', v_counts
  );
exception
  when others then
    raise;
end;
$function$;

notify pgrst, 'reload schema';

-- KYUM Phase 13.1 — Restore DELETE WHERE Hotfix
-- Fixes: DELETE requires a WHERE clause
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

  -- Child tables first, then parent/configuration tables.
  -- WHERE true is required by the database safe-delete protection.
  delete from public.customer_interests
  where true;

  delete from public.customer_followups
  where true;

  delete from public.quotations
  where true;

  delete from public.customers
  where true;

  delete from public.role_screen_permissions
  where true;

  delete from public.sales_representatives
  where true;

  delete from public.interest_categories
  where true;

  delete from public.no_sale_reasons
  where true;

  delete from public.app_screens
  where true;

  delete from public.system_settings
  where true;

  -- Parent/reference tables first.
  v_rows := p_backup -> 'tables' -> 'interest_categories';
  insert into public.interest_categories
  select *
  from jsonb_populate_recordset(
    null::public.interest_categories,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'interest_categories',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'no_sale_reasons';
  insert into public.no_sale_reasons
  select *
  from jsonb_populate_recordset(
    null::public.no_sale_reasons,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'no_sale_reasons',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'sales_representatives';
  insert into public.sales_representatives
  select *
  from jsonb_populate_recordset(
    null::public.sales_representatives,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'sales_representatives',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'customers';
  insert into public.customers
  select *
  from jsonb_populate_recordset(
    null::public.customers,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'customers',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'customer_interests';
  insert into public.customer_interests
  select *
  from jsonb_populate_recordset(
    null::public.customer_interests,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'customer_interests',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'customer_followups';
  insert into public.customer_followups
  select *
  from jsonb_populate_recordset(
    null::public.customer_followups,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'customer_followups',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'quotations';
  insert into public.quotations
  select *
  from jsonb_populate_recordset(
    null::public.quotations,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'quotations',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'system_settings';
  insert into public.system_settings
  select *
  from jsonb_populate_recordset(
    null::public.system_settings,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'system_settings',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'app_screens';
  insert into public.app_screens
  select *
  from jsonb_populate_recordset(
    null::public.app_screens,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'app_screens',
    v_count
  );

  v_rows := p_backup -> 'tables' -> 'role_screen_permissions';
  insert into public.role_screen_permissions
  select *
  from jsonb_populate_recordset(
    null::public.role_screen_permissions,
    v_rows
  );
  v_count := jsonb_array_length(v_rows);
  v_total := v_total + v_count;
  v_counts := v_counts || jsonb_build_object(
    'role_screen_permissions',
    v_count
  );

  return jsonb_build_object(
    'success', true,
    'total_records', v_total,
    'table_counts', v_counts
  );
exception
  when others then
    -- Raising the error aborts the function statement and rolls back
    -- every delete and insert performed by this invocation.
    raise;
end;
$function$;

notify pgrst, 'reload schema';

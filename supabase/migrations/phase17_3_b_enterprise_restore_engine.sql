-- KYUM CRM Phase 17.3-B — Enterprise Restore Engine
-- Adds a read-only dry-run validator and a transactional restore RPC for backup format 2.0.

begin;

create or replace function public.kyum_validate_backup_restore(
  p_backup jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_role public.app_role;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_table_counts jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_item jsonb;
  v_table text;
  v_rows jsonb;
  v_required boolean;
  v_category text;
  v_expected_count integer;
  v_actual_count integer;
  v_missing_required text;
  v_profile_missing_auth integer := 0;
begin
  if p_backup is null or jsonb_typeof(p_backup) <> 'object' then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array('Invalid backup object'),
      'warnings', v_warnings,
      'table_counts', v_table_counts,
      'total_records', 0
    );
  end if;

  if p_backup ->> 'product' <> 'KYUM CRM' then
    v_errors := v_errors || jsonb_build_array('This file is not a KYUM CRM backup');
  end if;

  if p_backup ->> 'format_version' <> '2.0' then
    v_errors := v_errors || jsonb_build_array('Unsupported backup format. Expected 2.0');
  end if;

  if jsonb_typeof(p_backup -> 'manifest') <> 'array' then
    v_errors := v_errors || jsonb_build_array('Backup manifest is missing or invalid');
  end if;

  if jsonb_typeof(p_backup -> 'tables') <> 'object' then
    v_errors := v_errors || jsonb_build_array('Backup tables object is missing or invalid');
  end if;

  select role
  into v_role
  from public.user_profiles
  where id = p_actor
    and is_active = true;

  if v_role is distinct from 'super_admin'::public.app_role then
    v_errors := v_errors || jsonb_build_array('Only an active Super Admin can restore backups');
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'valid', false,
      'errors', v_errors,
      'warnings', v_warnings,
      'table_counts', v_table_counts,
      'total_records', 0
    );
  end if;

  -- Every required table in the target manifest must exist in the backup.
  select string_agg(m.table_name, ', ' order by m.restore_order)
  into v_missing_required
  from public.kyum_backup_table_manifest() m
  where m.required
    and not ((p_backup -> 'tables') ? m.table_name);

  if v_missing_required is not null then
    v_errors := v_errors || jsonb_build_array(
      format('Missing required backup tables: %s', v_missing_required)
    );
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_backup -> 'manifest')
    order by coalesce((value ->> 'restore_order')::integer, 2147483647)
  loop
    v_table := nullif(btrim(v_item ->> 'table_name'), '');
    v_required := coalesce((v_item ->> 'required')::boolean, false);
    v_category := coalesce(nullif(v_item ->> 'category', ''), 'business');

    if v_table is null then
      v_errors := v_errors || jsonb_build_array('Manifest contains an empty table name');
      continue;
    end if;

    if not exists (
      select 1
      from public.kyum_backup_table_manifest() m
      where m.table_name = v_table
    ) then
      v_warnings := v_warnings || jsonb_build_array(
        format('Table %s is not part of the target canonical manifest and will be skipped', v_table)
      );
      continue;
    end if;

    if to_regclass(format('public.%I', v_table)) is null then
      if v_required then
        v_errors := v_errors || jsonb_build_array(
          format('Required target table does not exist: %s', v_table)
        );
      else
        v_warnings := v_warnings || jsonb_build_array(
          format('Optional target table does not exist and will be skipped: %s', v_table)
        );
      end if;
      continue;
    end if;

    v_rows := p_backup -> 'tables' -> v_table;
    if jsonb_typeof(v_rows) <> 'array' then
      v_errors := v_errors || jsonb_build_array(
        format('Invalid backup table payload: %s', v_table)
      );
      continue;
    end if;

    v_actual_count := jsonb_array_length(v_rows);
    v_expected_count := coalesce((v_item ->> 'row_count')::integer, -1);

    if v_expected_count >= 0 and v_expected_count <> v_actual_count then
      v_errors := v_errors || jsonb_build_array(
        format('%s row count mismatch: payload=%s manifest=%s', v_table, v_actual_count, v_expected_count)
      );
    end if;

    v_table_counts := v_table_counts || jsonb_build_object(v_table, v_actual_count);
    v_total := v_total + v_actual_count;

    if v_category = 'audit' then
      v_warnings := v_warnings || jsonb_build_array(
        format('%s is audit history and will be preserved, not replaced', v_table)
      );
    end if;
  end loop;

  -- user_profiles can only reference Auth users that already exist in this project.
  if (p_backup -> 'tables') ? 'user_profiles'
     and jsonb_typeof(p_backup -> 'tables' -> 'user_profiles') = 'array' then
    select count(*)
    into v_profile_missing_auth
    from jsonb_array_elements(p_backup -> 'tables' -> 'user_profiles') row_data
    where nullif(row_data ->> 'id', '') is not null
      and not exists (
        select 1
        from auth.users u
        where u.id = (row_data ->> 'id')::uuid
      );

    if v_profile_missing_auth > 0 then
      v_errors := v_errors || jsonb_build_array(
        format('%s user_profiles rows reference Auth users that do not exist in this Supabase project', v_profile_missing_auth)
      );
    end if;
  end if;

  return jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings,
    'table_counts', v_table_counts,
    'total_records', v_total,
    'format_version', p_backup ->> 'format_version',
    'schema_version', p_backup ->> 'schema_version'
  );
end;
$function$;

create or replace function public.restore_kyum_backup_enterprise(
  p_backup jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_validation jsonb;
  v_item jsonb;
  v_table text;
  v_rows jsonb;
  v_columns text;
  v_count integer;
  v_total integer := 0;
  v_counts jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_sequence record;
begin
  v_validation := public.kyum_validate_backup_restore(p_backup, p_actor);

  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    raise exception 'Restore validation failed: %', v_validation -> 'errors';
  end if;

  -- Defer all constraints that were created DEFERRABLE.
  set constraints all deferred;

  -- Delete child rows before parents by reversing canonical restore order.
  for v_item in
    select value
    from jsonb_array_elements(p_backup -> 'manifest')
    where coalesce(value ->> 'category', 'business') <> 'audit'
      and exists (
        select 1
        from public.kyum_backup_table_manifest() m
        where m.table_name = value ->> 'table_name'
      )
    order by coalesce((value ->> 'restore_order')::integer, 0) desc
  loop
    v_table := v_item ->> 'table_name';

    if to_regclass(format('public.%I', v_table)) is null then
      v_skipped := v_skipped || jsonb_build_array(v_table);
      continue;
    end if;

    execute format('delete from public.%I where true', v_table);
  end loop;

  -- Insert parents before children using canonical restore order.
  for v_item in
    select value
    from jsonb_array_elements(p_backup -> 'manifest')
    where coalesce(value ->> 'category', 'business') <> 'audit'
      and exists (
        select 1
        from public.kyum_backup_table_manifest() m
        where m.table_name = value ->> 'table_name'
      )
    order by coalesce((value ->> 'restore_order')::integer, 2147483647)
  loop
    v_table := v_item ->> 'table_name';

    if to_regclass(format('public.%I', v_table)) is null then
      v_skipped := v_skipped || jsonb_build_array(v_table);
      continue;
    end if;

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

    v_count := jsonb_array_length(v_rows);

    if v_count > 0 then
      execute format(
        'insert into public.%I (%s) overriding system value
         select %s
         from jsonb_populate_recordset(null::public.%I, $1)',
        v_table,
        v_columns,
        v_columns,
        v_table
      )
      using v_rows;
    end if;

    v_total := v_total + v_count;
    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  end loop;

  -- Re-align serial/identity sequences after explicit key restoration.
  for v_sequence in
    select
      c.table_name,
      c.column_name,
      pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) as sequence_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and exists (
        select 1
        from jsonb_array_elements(p_backup -> 'manifest') item
        where item ->> 'table_name' = c.table_name
          and coalesce(item ->> 'category', 'business') <> 'audit'
      )
      and pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) is not null
  loop
    execute format(
      'select setval(%L, coalesce((select max(%I) from public.%I), 1), (select count(*) > 0 from public.%I))',
      v_sequence.sequence_name,
      v_sequence.column_name,
      v_sequence.table_name,
      v_sequence.table_name
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'transactional', true,
    'total_records', v_total,
    'table_counts', v_counts,
    'skipped_tables', v_skipped,
    'warnings', v_validation -> 'warnings'
  );
exception
  when others then
    -- PostgreSQL rolls back all changes made by this function invocation.
    raise;
end;
$function$;

revoke all on function public.kyum_validate_backup_restore(jsonb, uuid) from public;
revoke all on function public.kyum_validate_backup_restore(jsonb, uuid) from anon;
revoke all on function public.kyum_validate_backup_restore(jsonb, uuid) from authenticated;
grant execute on function public.kyum_validate_backup_restore(jsonb, uuid) to service_role;

revoke all on function public.restore_kyum_backup_enterprise(jsonb, uuid) from public;
revoke all on function public.restore_kyum_backup_enterprise(jsonb, uuid) from anon;
revoke all on function public.restore_kyum_backup_enterprise(jsonb, uuid) from authenticated;
grant execute on function public.restore_kyum_backup_enterprise(jsonb, uuid) to service_role;

comment on function public.kyum_validate_backup_restore(jsonb, uuid)
is 'Read-only enterprise restore dry-run validation for KYUM CRM backup format 2.0.';

comment on function public.restore_kyum_backup_enterprise(jsonb, uuid)
is 'Transactional enterprise restore for KYUM CRM backup format 2.0. Audit history tables are preserved.';

commit;

-- Verification
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'kyum_validate_backup_restore',
    'restore_kyum_backup_enterprise'
  )
order by p.proname;

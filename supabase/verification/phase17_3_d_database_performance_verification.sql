-- KYUM CRM Phase 17.3-D — Read-only Database Performance Verification

-- 1. Confirm Phase 17.3-D index inventory.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname like 'idx_%'
order by tablename, indexname;

-- 2. Foreign keys without a usable leading-column index.
-- Expected: zero rows, or only low-volume tables intentionally accepted.
with foreign_keys as (
  select
    c.oid as constraint_oid,
    c.conrelid,
    n.nspname as schema_name,
    t.relname as table_name,
    c.conname as constraint_name,
    c.conkey as fk_columns
  from pg_constraint c
  join pg_class t
    on t.oid = c.conrelid
  join pg_namespace n
    on n.oid = t.relnamespace
  where c.contype = 'f'
    and n.nspname = 'public'
),
indexed_foreign_keys as (
  select distinct
    fk.constraint_oid
  from foreign_keys fk
  join pg_index i
    on i.indrelid = fk.conrelid
   and i.indisvalid
   and i.indisready
  where not exists (
    select 1
    from unnest(fk.fk_columns) with ordinality as fkc(attnum, position)
    where (i.indkey::smallint[])[fkc.position] <> fkc.attnum
  )
)
select
  fk.schema_name,
  fk.table_name,
  fk.constraint_name,
  array_agg(a.attname order by k.ordinality) as fk_columns
from foreign_keys fk
cross join lateral unnest(fk.fk_columns)
  with ordinality as k(attnum, ordinality)
join pg_attribute a
  on a.attrelid = fk.conrelid
 and a.attnum = k.attnum
left join indexed_foreign_keys ifk
  on ifk.constraint_oid = fk.constraint_oid
where ifk.constraint_oid is null
group by
  fk.schema_name,
  fk.table_name,
  fk.constraint_name
order by fk.table_name, fk.constraint_name;

-- 3. Duplicate index definitions on the same table.
-- Expected: zero rows.
with normalized_indexes as (
  select
    schemaname,
    tablename,
    indexname,
    regexp_replace(
      indexdef,
      'CREATE (UNIQUE )?INDEX [^ ]+ ',
      'CREATE \1INDEX ',
      'i'
    ) as normalized_definition
  from pg_indexes
  where schemaname = 'public'
),
duplicates as (
  select
    schemaname,
    tablename,
    normalized_definition,
    count(*) as duplicate_count,
    array_agg(indexname order by indexname) as index_names
  from normalized_indexes
  group by schemaname, tablename, normalized_definition
  having count(*) > 1
)
select *
from duplicates
order by tablename, normalized_definition;

-- 4. Table and index usage snapshot.
-- Statistics accumulate after real production traffic.
select
  s.relname as table_name,
  s.seq_scan,
  s.seq_tup_read,
  s.idx_scan,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.relid)) as table_size,
  pg_size_pretty(pg_indexes_size(s.relid)) as indexes_size
from pg_stat_user_tables s
where s.schemaname = 'public'
order by s.seq_tup_read desc, s.relname;

-- 5. Index usage snapshot.
-- Newly deployed indexes may initially show idx_scan = 0.
select
  ui.relname as table_name,
  ui.indexrelname as index_name,
  ui.idx_scan,
  ui.idx_tup_read,
  ui.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(ui.indexrelid)) as index_size
from pg_stat_user_indexes ui
where ui.schemaname = 'public'
order by ui.idx_scan asc, ui.relname, ui.indexrelname;

-- 6. Planner-statistics freshness.
select
  relname as table_name,
  last_analyze,
  last_autoanalyze,
  n_live_tup,
  n_dead_tup
from pg_stat_user_tables
where schemaname = 'public'
order by relname;

-- 7. Final required-index summary.
with required(index_name) as (
  values
    ('idx_customers_created_at_desc'),
    ('idx_customers_representative_created_at'),
    ('idx_followups_customer_contact_created'),
    ('idx_followups_open_next_customer'),
    ('idx_quotations_customer_date_created'),
    ('idx_quotations_status_date'),
    ('idx_app_screens_active_display'),
    ('idx_user_profiles_active_name'),
    ('idx_backup_operations_created_at_desc'),
    ('idx_daily_task_definitions_active_order'),
    ('idx_daily_task_completions_date_user'),
    ('idx_daily_alerts_date_status'),
    ('idx_daily_alert_actions_alert_created'),
    ('idx_daily_employee_sessions_user_date_activity')
),
existing as (
  select indexname
  from pg_indexes
  where schemaname = 'public'
),
missing as (
  select r.index_name
  from required r
  left join existing e
    on e.indexname = r.index_name
  where e.indexname is null
)
select
  (select count(*) from required) as required_index_count,
  (select count(*) from missing) as missing_index_count,
  coalesce(
    (select jsonb_agg(index_name order by index_name) from missing),
    '[]'::jsonb
  ) as missing_indexes,
  case
    when (select count(*) from missing) = 0
      then 'PASS'
    else 'REVIEW_REQUIRED'
  end as overall_result;

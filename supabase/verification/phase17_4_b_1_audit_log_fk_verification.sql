-- KYUM CRM Phase 17.4-B.1 — Audit Log FK Verification
-- Read-only.

with relationships as (
  select
    c.conname as constraint_name,
    pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join unnest(c.conkey) with ordinality as k(attnum, position)
    on true
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = k.attnum
  where n.nspname = 'public'
    and t.relname = 'audit_logs'
    and c.contype = 'f'
    and a.attname = 'user_id'
)
select
  count(*) as relationship_count,
  max(constraint_name) as canonical_constraint,
  bool_and(
    definition ilike '%REFERENCES user_profiles(id)%'
    and definition ilike '%ON DELETE SET NULL%'
  ) as preserves_audit_history,
  case
    when count(*) = 1
      and max(constraint_name) = 'audit_logs_user_profile_fkey'
      and bool_and(
        definition ilike '%REFERENCES user_profiles(id)%'
        and definition ilike '%ON DELETE SET NULL%'
      )
    then 'PASS'
    else 'REVIEW_REQUIRED'
  end as overall_result
from relationships;

select
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'audit_logs'
  and c.contype = 'f'
order by c.conname;

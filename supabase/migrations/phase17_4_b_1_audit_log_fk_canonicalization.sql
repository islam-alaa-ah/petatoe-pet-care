-- KYUM CRM Phase 17.4-B.1 — Audit Log FK Canonicalization
-- Root Cause:
-- audit_logs.user_id had two foreign keys to user_profiles.id.
-- PostgREST could not choose a single relationship for embedded user_profiles.
--
-- Canonical relationship kept:
--   audit_logs_user_profile_fkey
--   ON DELETE SET NULL
--
-- Duplicate relationship removed:
--   audit_logs_user_id_user_profiles_fkey
--
-- Rationale:
-- Audit history must remain available after a user is deleted.

begin;

do $$
declare
  v_column_nullable text;
begin
  select c.is_nullable
    into v_column_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'audit_logs'
    and c.column_name = 'user_id';

  if v_column_nullable is distinct from 'YES' then
    raise exception
      'audit_logs.user_id must be nullable before keeping ON DELETE SET NULL';
  end if;
end
$$;

alter table public.audit_logs
  drop constraint if exists audit_logs_user_id_user_profiles_fkey;

-- Ensure the canonical FK exists with the intended audit-preserving behavior.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'audit_logs'
      and c.conname = 'audit_logs_user_profile_fkey'
      and c.contype = 'f'
  ) then
    alter table public.audit_logs
      add constraint audit_logs_user_profile_fkey
      foreign key (user_id)
      references public.user_profiles(id)
      on delete set null;
  end if;
end
$$;

commit;

notify pgrst, 'reload schema';

-- Immediate verification.
select
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'audit_logs'
  and c.contype = 'f'
  and c.conkey = array[
    (
      select a.attnum
      from pg_attribute a
      where a.attrelid = t.oid
        and a.attname = 'user_id'
        and not a.attisdropped
    )
  ]::smallint[]
order by c.conname;

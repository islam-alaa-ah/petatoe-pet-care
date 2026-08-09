-- PETATOE P5.1 — Daily Operations PostgREST Relationship Recovery
-- Based on the live diagnostic: 4 explicit user_profiles relationships are missing,
-- while checked orphan counts are zero.
--
-- Scope: restore relationship metadata only. No customer/business data is modified.
-- Safe to re-run.

begin;

-- ------------------------------------------------------------------
-- Guard: required tables/columns must exist.
-- ------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select *
    from (values
      ('daily_task_completions','user_id'),
      ('daily_employee_sessions','user_id'),
      ('daily_alerts','user_id'),
      ('daily_alert_actions','action_by'),
      ('user_profiles','id')
    ) v(table_name,column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema='public'
        and c.table_name=r.table_name
        and c.column_name=r.column_name
    ) then
      raise exception 'P5.1 aborted: missing %.%', r.table_name, r.column_name;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------
-- Guard: do not create FKs while orphan rows exist.
-- ------------------------------------------------------------------
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.daily_task_completions x
  left join public.user_profiles p on p.id=x.user_id
  where x.user_id is not null and p.id is null;
  if v_count > 0 then
    raise exception 'P5.1 aborted: daily_task_completions.user_id has % orphan row(s)', v_count;
  end if;

  select count(*) into v_count
  from public.daily_employee_sessions x
  left join public.user_profiles p on p.id=x.user_id
  where x.user_id is not null and p.id is null;
  if v_count > 0 then
    raise exception 'P5.1 aborted: daily_employee_sessions.user_id has % orphan row(s)', v_count;
  end if;

  select count(*) into v_count
  from public.daily_alerts x
  left join public.user_profiles p on p.id=x.user_id
  where x.user_id is not null and p.id is null;
  if v_count > 0 then
    raise exception 'P5.1 aborted: daily_alerts.user_id has % orphan row(s)', v_count;
  end if;

  select count(*) into v_count
  from public.daily_alert_actions x
  left join public.user_profiles p on p.id=x.action_by
  where x.action_by is not null and p.id is null;
  if v_count > 0 then
    raise exception 'P5.1 aborted: daily_alert_actions.action_by has % orphan row(s)', v_count;
  end if;
end $$;

-- ------------------------------------------------------------------
-- Replace only the FK on each target column, preserving the intended
-- Stage-9 delete behavior and giving PostgREST the exact relationship names
-- expected by the current frontend.
-- ------------------------------------------------------------------
do $$
declare
  c record;
begin
  -- daily_task_completions.user_id -> user_profiles.id ON DELETE CASCADE
  for c in
    select conname
    from pg_constraint
    where conrelid='public.daily_task_completions'::regclass
      and contype='f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid='public.daily_task_completions'::regclass
           and attname='user_id' and not attisdropped)
      ]::smallint[]
  loop
    execute format('alter table public.daily_task_completions drop constraint if exists %I', c.conname);
  end loop;

  alter table public.daily_task_completions
    add constraint daily_task_completions_user_profile_fkey
    foreign key(user_id) references public.user_profiles(id) on delete cascade;

  -- daily_employee_sessions.user_id -> user_profiles.id ON DELETE CASCADE
  for c in
    select conname
    from pg_constraint
    where conrelid='public.daily_employee_sessions'::regclass
      and contype='f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid='public.daily_employee_sessions'::regclass
           and attname='user_id' and not attisdropped)
      ]::smallint[]
  loop
    execute format('alter table public.daily_employee_sessions drop constraint if exists %I', c.conname);
  end loop;

  alter table public.daily_employee_sessions
    add constraint daily_employee_sessions_user_profile_fkey
    foreign key(user_id) references public.user_profiles(id) on delete cascade;

  -- daily_alerts.user_id -> user_profiles.id ON DELETE CASCADE
  for c in
    select conname
    from pg_constraint
    where conrelid='public.daily_alerts'::regclass
      and contype='f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid='public.daily_alerts'::regclass
           and attname='user_id' and not attisdropped)
      ]::smallint[]
  loop
    execute format('alter table public.daily_alerts drop constraint if exists %I', c.conname);
  end loop;

  alter table public.daily_alerts
    add constraint daily_alerts_user_profile_fkey
    foreign key(user_id) references public.user_profiles(id) on delete cascade;

  -- daily_alert_actions.action_by -> user_profiles.id ON DELETE SET NULL
  for c in
    select conname
    from pg_constraint
    where conrelid='public.daily_alert_actions'::regclass
      and contype='f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid='public.daily_alert_actions'::regclass
           and attname='action_by' and not attisdropped)
      ]::smallint[]
  loop
    execute format('alter table public.daily_alert_actions drop constraint if exists %I', c.conname);
  end loop;

  alter table public.daily_alert_actions
    add constraint daily_alert_actions_user_profile_fkey
    foreign key(action_by) references public.user_profiles(id) on delete set null;
end $$;

-- Helpful FK indexes (idempotent).
create index if not exists idx_daily_task_completions_user_id
  on public.daily_task_completions(user_id);

create index if not exists idx_daily_employee_sessions_user_id
  on public.daily_employee_sessions(user_id);

create index if not exists idx_daily_alerts_user_id
  on public.daily_alerts(user_id);

create index if not exists idx_daily_alert_actions_action_by
  on public.daily_alert_actions(action_by);

-- Ask PostgREST to refresh schema relationship metadata.
notify pgrst, 'reload schema';

commit;

-- ==================================================================
-- VERIFICATION A — all 4 exact relationships must be OK + validated
-- ==================================================================
with required(constraint_name,table_name) as (
  values
    ('daily_task_completions_user_profile_fkey','daily_task_completions'),
    ('daily_employee_sessions_user_profile_fkey','daily_employee_sessions'),
    ('daily_alerts_user_profile_fkey','daily_alerts'),
    ('daily_alert_actions_user_profile_fkey','daily_alert_actions')
)
select
  r.constraint_name,
  case when c.oid is null then 'MISSING' else 'OK' end as status,
  c.convalidated as validated,
  pg_get_constraintdef(c.oid) as definition
from required r
left join pg_constraint c
  on c.conname=r.constraint_name
 and c.conrelid=to_regclass('public.' || r.table_name)
order by r.constraint_name;

-- ==================================================================
-- VERIFICATION B — no orphan rows
-- ==================================================================
select 'daily_task_completions.user_id' relationship,count(*)::bigint orphan_rows
from public.daily_task_completions x
left join public.user_profiles p on p.id=x.user_id
where x.user_id is not null and p.id is null
union all
select 'daily_employee_sessions.user_id',count(*)::bigint
from public.daily_employee_sessions x
left join public.user_profiles p on p.id=x.user_id
where x.user_id is not null and p.id is null
union all
select 'daily_alerts.user_id',count(*)::bigint
from public.daily_alerts x
left join public.user_profiles p on p.id=x.user_id
where x.user_id is not null and p.id is null
union all
select 'daily_alert_actions.action_by',count(*)::bigint
from public.daily_alert_actions x
left join public.user_profiles p on p.id=x.action_by
where x.action_by is not null and p.id is null
order by relationship;

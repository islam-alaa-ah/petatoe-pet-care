-- KYUM CRM Enterprise v2.0 — Phase 17.0.1
-- Daily console relationships + daily task audit policy fix
-- Run once in Supabase SQL Editor after Phase 17.0.

begin;

do $$
declare
  v_orphans bigint;
begin
  select count(*) into v_orphans
  from public.daily_alerts a
  left join public.user_profiles p on p.id = a.user_id
  where a.user_id is not null and p.id is null;
  if v_orphans > 0 then
    raise exception 'Cannot add daily_alerts profile FK: % orphan row(s).', v_orphans;
  end if;

  select count(*) into v_orphans
  from public.daily_alert_actions a
  left join public.user_profiles p on p.id = a.action_by
  where a.action_by is not null and p.id is null;
  if v_orphans > 0 then
    raise exception 'Cannot add daily_alert_actions profile FK: % orphan row(s).', v_orphans;
  end if;

  select count(*) into v_orphans
  from public.daily_employee_sessions s
  left join public.user_profiles p on p.id = s.user_id
  where p.id is null;
  if v_orphans > 0 then
    raise exception 'Cannot add daily_employee_sessions profile FK: % orphan row(s).', v_orphans;
  end if;

  select count(*) into v_orphans
  from public.audit_logs l
  left join public.user_profiles p on p.id = l.user_id
  where l.user_id is not null and p.id is null;
  if v_orphans > 0 then
    raise exception 'Cannot add audit_logs profile FK: % orphan row(s).', v_orphans;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'daily_alerts_user_profile_fkey') then
    alter table public.daily_alerts
      add constraint daily_alerts_user_profile_fkey
      foreign key (user_id) references public.user_profiles(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'daily_alert_actions_user_profile_fkey') then
    alter table public.daily_alert_actions
      add constraint daily_alert_actions_user_profile_fkey
      foreign key (action_by) references public.user_profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'daily_employee_sessions_user_profile_fkey') then
    alter table public.daily_employee_sessions
      add constraint daily_employee_sessions_user_profile_fkey
      foreign key (user_id) references public.user_profiles(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'audit_logs_user_profile_fkey') then
    alter table public.audit_logs
      add constraint audit_logs_user_profile_fkey
      foreign key (user_id) references public.user_profiles(id) on delete set null;
  end if;
end
$$;

-- The previous policy rejected the daily task actions "complete" and "reopen",
-- which produced 403 responses after a task was updated successfully.
drop policy if exists "authenticated insert own audit logs" on public.audit_logs;
create policy "authenticated insert own audit logs"
on public.audit_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and action in (
    'insert','update','delete','login','logout','export','restore',
    'complete','reopen','start','escalate','close','note','end_day','heartbeat'
  )
  and entity_type in (
    'sales_representatives','interest_categories','no_sale_reasons',
    'customers','customer_followups','quotations','user_profiles',
    'role_screen_permissions','system_settings','backup_operations',
    'daily_task_completions','daily_alerts','daily_alert_actions',
    'daily_employee_sessions'
  )
);

commit;
notify pgrst, 'reload schema';

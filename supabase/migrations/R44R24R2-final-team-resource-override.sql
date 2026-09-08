-- PETATOE R44R24R2 — Super Admin Team Resource Override (FINAL ROOT-CAUSE FIX)
-- Root cause:
--   Legacy partial UNIQUE indexes on public.installation_teams still reject resource swaps
--   with SQLSTATE 23505 even after the historical-assignment trigger allows Super Admin.
--
-- Behavior after this patch:
--   * Super Admin may EDIT an EXISTING team and temporarily reuse a groomer/driver/car.
--   * Non-Super-Admin users remain collision-protected.
--   * Creating a NEW team with a resource already used by another active team remains blocked.
--   * Historical periods inside the SAME team can never overlap.
--   * No RLS/GRANT widening. No changes to commissions/treasury/appointment calculations.

begin;

-- ============================================================================
-- 1) Historical assignment guard:
--    Preserve same-team timeline integrity, but allow Super Admin existing-team
--    resource correction/transfer even while the resource is still on another team.
-- ============================================================================

create or replace function public.guard_installation_team_assignment_history_overlap()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_to date := coalesce(new.effective_to,'infinity'::date);
  v_closing_existing boolean := false;
  v_is_super_admin boolean := false;
  v_super_admin_existing_team_override boolean := false;
begin
  select exists(
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = 'super_admin'::public.app_role
  )
  into v_is_super_admin;

  if tg_op='UPDATE' then
    v_closing_existing :=
      old.installation_team_id = new.installation_team_id
      and old.groomer_employee_id is not distinct from new.groomer_employee_id
      and old.driver_employee_id is not distinct from new.driver_employee_id
      and old.appointment_car_id is not distinct from new.appointment_car_id
      and old.effective_from = new.effective_from
      and old.effective_to is null
      and new.effective_to is not null;
  end if;

  -- source='create' is NEW-team creation and never receives this override.
  v_super_admin_existing_team_override :=
    v_is_super_admin
    and coalesce(new.source,'') <> 'create';

  -- NEVER bypass overlap inside the same team's own history.
  if exists(
    select 1
    from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id = new.installation_team_id
      and daterange(
            h.effective_from,
            coalesce(h.effective_to,'infinity'::date),
            '[]'
          )
          &&
          daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'فترة ربط الفريق تتداخل مع فترة موجودة بالفعل'
      using errcode='23514';
  end if;

  if not v_closing_existing
     and not v_super_admin_existing_team_override
     and new.groomer_employee_id is not null
     and exists(
       select 1
       from public.installation_team_assignment_history h
       where h.id is distinct from new.id
         and h.installation_team_id <> new.installation_team_id
         and h.groomer_employee_id = new.groomer_employee_id
         and daterange(
               h.effective_from,
               coalesce(h.effective_to,'infinity'::date),
               '[]'
             )
             &&
             daterange(new.effective_from,v_to,'[]')
     )
  then
    raise exception 'الجرومر مرتبط بفريق آخر خلال جزء من الفترة المحددة'
      using errcode='23505';
  end if;

  if not v_closing_existing
     and not v_super_admin_existing_team_override
     and new.driver_employee_id is not null
     and exists(
       select 1
       from public.installation_team_assignment_history h
       where h.id is distinct from new.id
         and h.installation_team_id <> new.installation_team_id
         and h.driver_employee_id = new.driver_employee_id
         and daterange(
               h.effective_from,
               coalesce(h.effective_to,'infinity'::date),
               '[]'
             )
             &&
             daterange(new.effective_from,v_to,'[]')
     )
  then
    raise exception 'السائق مرتبط بفريق آخر خلال جزء من الفترة المحددة'
      using errcode='23505';
  end if;

  if not v_closing_existing
     and not v_super_admin_existing_team_override
     and new.appointment_car_id is not null
     and exists(
       select 1
       from public.installation_team_assignment_history h
       where h.id is distinct from new.id
         and h.installation_team_id <> new.installation_team_id
         and h.appointment_car_id = new.appointment_car_id
         and daterange(
               h.effective_from,
               coalesce(h.effective_to,'infinity'::date),
               '[]'
             )
             &&
             daterange(new.effective_from,v_to,'[]')
     )
  then
    raise exception 'السيارة مرتبطة بفريق آخر خلال جزء من الفترة المحددة'
      using errcode='23505';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 2) ROOT CAUSE: remove legacy static UNIQUE indexes from current team master.
--    Static unique indexes cannot express "allow Super Admin edit only".
-- ============================================================================

drop index if exists public.uq_installation_teams_active_groomer;
drop index if exists public.uq_installation_teams_active_driver;
drop index if exists public.uq_installation_teams_active_car;

-- ============================================================================
-- 3) Replace static uniqueness with a role-aware canonical guard.
-- ============================================================================

create or replace function public.guard_installation_teams_active_resource_conflict()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_is_super_admin boolean := false;
  v_super_admin_existing_team_override boolean := false;
begin
  select exists(
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = 'super_admin'::public.app_role
  )
  into v_is_super_admin;

  -- Override is ONLY for UPDATE of an existing team.
  -- INSERT/new-team creation remains protected for everyone.
  v_super_admin_existing_team_override :=
    (tg_op = 'UPDATE')
    and v_is_super_admin;

  -- Inactive teams do not reserve resources, matching the old partial indexes.
  if coalesce(new.status,'') <> 'غير نشطة'
     and not v_super_admin_existing_team_override
  then
    if new.groomer_employee_id is not null and exists(
      select 1
      from public.installation_teams t
      where t.id is distinct from new.id
        and t.status <> 'غير نشطة'
        and t.groomer_employee_id = new.groomer_employee_id
    ) then
      raise exception 'الجرومر مرتبط بالفعل بفريق موعد نشط آخر'
        using errcode='23505';
    end if;

    if new.driver_employee_id is not null and exists(
      select 1
      from public.installation_teams t
      where t.id is distinct from new.id
        and t.status <> 'غير نشطة'
        and t.driver_employee_id = new.driver_employee_id
    ) then
      raise exception 'السائق مرتبط بالفعل بفريق موعد نشط آخر'
        using errcode='23505';
    end if;

    if new.appointment_car_id is not null and exists(
      select 1
      from public.installation_teams t
      where t.id is distinct from new.id
        and t.status <> 'غير نشطة'
        and t.appointment_car_id = new.appointment_car_id
    ) then
      raise exception 'السيارة مرتبطة بالفعل بفريق موعد نشط آخر'
        using errcode='23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_installation_teams_active_resource_conflict
  on public.installation_teams;

create trigger trg_guard_installation_teams_active_resource_conflict
before insert or update on public.installation_teams
for each row
execute function public.guard_installation_teams_active_resource_conflict();

notify pgrst,'reload schema';

commit;

-- ============================================================================
-- Verification (read-only)
-- ============================================================================

select
  'R44R24R2_APPLIED' as status,
  not exists(
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='installation_teams'
      and indexname in (
        'uq_installation_teams_active_groomer',
        'uq_installation_teams_active_driver',
        'uq_installation_teams_active_car'
      )
  ) as legacy_unique_indexes_removed,
  exists(
    select 1
    from pg_trigger tg
    join pg_class c on c.oid=tg.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='installation_teams'
      and tg.tgname='trg_guard_installation_teams_active_resource_conflict'
      and not tg.tgisinternal
  ) as role_aware_team_guard_installed;

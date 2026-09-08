-- PETATOE R44R24R1 — Super Admin existing-team resource-conflict override
-- Purpose:
--   Fix the remaining 23505 conflict when a Super Admin edits an EXISTING appointment team.
--   Super Admin may override groomer/driver/car conflicts on existing-team historical edits.
--   New-team creation remains protected when source='create'.
--   Same-team historical period overlap is NEVER bypassed.
--   No RLS/GRANT widening and no changes to commissions, treasury, appointments, offline or pruning.

begin;

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
  -- Resolve the authenticated application role directly from the canonical profile table.
  -- This deliberately avoids depending only on source-specific current_user_role() behavior.
  select exists(
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.is_active = true
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

  -- Super Admin override applies to existing-team history operations only.
  -- New-team history rows are written with source='create' and remain collision-protected.
  v_super_admin_existing_team_override :=
    v_is_super_admin
    and coalesce(new.source,'') <> 'create';

  -- NEVER allow overlapping periods inside the same team timeline.
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

  -- Groomer collision: bypass only for Super Admin existing-team edit/correction.
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

  -- Driver collision: bypass only for Super Admin existing-team edit/correction.
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

  -- Vehicle collision: bypass only for Super Admin existing-team edit/correction.
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

notify pgrst,'reload schema';

commit;

-- Expected result from SQL Editor:
select
  'R44R24R1_APPLIED' as status,
  'Super Admin existing-team resource conflict override is active' as details;

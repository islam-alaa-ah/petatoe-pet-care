-- R44R24 read-only verification
-- Expected:
--   - function_definition contains v_super_admin_edit_override
--   - same-team overlap guard remains present
--   - source='create' is not included in the override source list

select
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='guard_installation_team_assignment_history_overlap';

select
  public.current_user_role()::text as current_role,
  case when public.current_user_role()='super_admin'::public.app_role
       then 'SUPER_ADMIN_OVERRIDE_ELIGIBLE'
       else 'STANDARD_COLLISION_GUARD'
  end as expected_edit_mode;

select
  installation_team_id,
  effective_from,
  effective_to,
  groomer_name_snapshot,
  driver_name_snapshot,
  car_name_snapshot,
  source,
  created_by
from public.installation_team_assignment_history
order by installation_team_id,effective_from,created_at;

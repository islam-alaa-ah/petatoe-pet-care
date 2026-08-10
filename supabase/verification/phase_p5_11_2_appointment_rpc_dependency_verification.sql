-- PETATOE P5.11.2 verification
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in(
  'can_access_installation_representative',
  'resolve_installation_request_representative',
  'refresh_installation_request_totals',
  'can_access_installation_request_scope',
  'create_installation_request_with_services',
  'update_installation_request_with_services',
  'create_petatoe_appointment',
  'update_petatoe_appointment',
  'save_petatoe_appointment_details'
)
order by p.proname,arguments;

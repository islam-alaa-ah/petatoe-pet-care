-- PETATOE P5.11.3 verification

select
  p.proname function_name,
  pg_get_function_identity_arguments(p.oid) arguments,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in(
  'can_access_unassigned_appointment',
  'resolve_installation_request_representative',
  'can_access_installation_request_scope',
  'create_installation_request_with_services',
  'update_installation_request_with_services',
  'create_petatoe_appointment',
  'update_petatoe_appointment',
  'save_petatoe_appointment_details'
)
order by p.proname,arguments;

select
  count(*) filter(where representative_id is null) appointments_without_representative,
  count(*) filter(where representative_id is null and installation_team_id is null) unassigned_without_representative,
  count(*) filter(where representative_id is null and installation_team_id is not null) team_assigned_without_representative
from public.installation_requests;

select
  count(*) filter(where c.id is null) orphan_customers,
  count(*) filter(where r.quotation_id is not null and q.id is null) orphan_contracts,
  count(*) filter(where r.neighborhood_id is not null and n.id is null) orphan_neighborhoods,
  count(*) filter(where r.installation_team_id is not null and t.id is null) orphan_teams
from public.installation_requests r
left join public.customers c on c.id=r.customer_id
left join public.quotations q on q.id=r.quotation_id
left join public.installation_neighborhoods n on n.id=r.neighborhood_id
left join public.installation_teams t on t.id=r.installation_team_id;

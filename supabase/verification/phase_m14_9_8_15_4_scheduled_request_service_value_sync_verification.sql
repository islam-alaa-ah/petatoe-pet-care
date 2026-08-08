-- Function exists with the expected signature.
select p.proname,pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='update_installation_request_with_services';

-- Scheduled visits must not contain orphaned service allocations.
select vs.id
from public.installation_execution_visit_services vs
left join public.installation_request_services rs on rs.id=vs.request_service_id
where rs.id is null;

-- Active scheduled requests with services must not render as zero when they have one visit.
select r.id,r.request_number,r.total_services_amount
from public.installation_requests r
where r.scheduled_date is not null
  and exists(select 1 from public.installation_request_services s where s.installation_request_id=r.id)
  and not exists(
    select 1 from public.installation_execution_visits v
    join public.installation_execution_visit_services vs on vs.visit_id=v.id
    where v.installation_request_id=r.id and vs.scheduled_quantity>0
  );

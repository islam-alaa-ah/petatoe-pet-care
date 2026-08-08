-- Phase M14.9.8.16 verification

select
  p.proname,
  p.prosecdef as is_security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='cancel_installation_request_schedule';

-- Expected: 0 rows. No request waiting for scheduling should retain a primary appointment.
select id,request_number,status,scheduled_date,scheduled_time,installation_team_id,assigned_technician_name
from public.installation_requests
where status='بانتظار الجدولة'
  and (scheduled_date is not null or scheduled_time is not null or installation_team_id is not null or assigned_technician_name is not null);

-- Expected: 0 rows. Waiting requests must not retain planned execution visits.
select r.id,r.request_number,v.id as visit_id,v.status
from public.installation_requests r
join public.installation_execution_visits v on v.installation_request_id=r.id
where r.status='بانتظار الجدولة'
  and v.status in ('مجدولة','بانتظار التأكيد');

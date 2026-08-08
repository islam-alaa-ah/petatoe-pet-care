
-- Phase M14.9.8.14 verification

select table_name
from information_schema.tables
where table_schema='public'
  and table_name in (
    'installation_execution_visits',
    'installation_execution_visit_services',
    'installation_execution_quantity_audit'
  )
order by table_name;

select proname
from pg_proc
where pronamespace='public'::regnamespace
  and proname in (
    'ensure_installation_execution_visit',
    'get_installation_execution_quantity_summary',
    'schedule_installation_request_visit',
    'confirm_installation_actual_quantities'
  )
order by proname;

-- Expected: 0 rows.
select
  s.installation_request_id,
  s.id as request_service_id,
  s.quantity,
  sum(coalesce(vs.executed_quantity,0)) as executed_quantity
from public.installation_request_services s
join public.installation_execution_visit_services vs on vs.request_service_id=s.id
join public.installation_execution_visits v on v.id=vs.visit_id and v.status='مؤكدة'
group by s.installation_request_id,s.id,s.quantity
having sum(coalesce(vs.executed_quantity,0)) > s.quantity;

-- Expected: 0 rows.
select distinct r.id,r.request_number,r.status,x.remaining_quantity
from public.installation_requests r
cross join lateral public.get_installation_execution_quantity_summary(r.id) x
where r.status='مكتمل'
  and x.remaining_quantity>0;

-- Expected: 0 rows.
select id,request_number,scheduled_date,scheduled_time,installation_team_id,assigned_technician_name
from public.installation_requests
where status='بانتظار الجدولة'
  and (
    scheduled_date is not null or scheduled_time is not null
    or installation_team_id is not null or assigned_technician_name is not null
  );

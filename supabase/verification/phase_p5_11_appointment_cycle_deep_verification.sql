-- PETATOE P5.11 — Appointment cycle verification

-- 1) Core RPC availability.
select p.proname as function_name,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in(
    'create_petatoe_appointment','update_petatoe_appointment',
    'get_installation_schedule_global','schedule_installation_request_visit',
    'schedule_installation_request_multi_day','select_installation_execution_visit',
    'record_installation_visit_map_opened','advance_installation_execution_visit_stage'
  )
order by p.proname;

-- 2) Appointment relational integrity.
select 'request_without_customer' issue,count(*)::bigint rows
from public.installation_requests r left join public.customers c on c.id=r.customer_id
where c.id is null
union all
select 'request_without_neighborhood',count(*)::bigint
from public.installation_requests r left join public.installation_neighborhoods n on n.id=r.neighborhood_id
where r.neighborhood_id is not null and n.id is null
union all
select 'service_without_request',count(*)::bigint
from public.installation_request_services s left join public.installation_requests r on r.id=s.installation_request_id
where r.id is null
union all
select 'visit_without_request',count(*)::bigint
from public.installation_execution_visits v left join public.installation_requests r on r.id=v.installation_request_id
where r.id is null
union all
select 'visit_service_without_visit',count(*)::bigint
from public.installation_execution_visit_services s left join public.installation_execution_visits v on v.id=s.visit_id
where v.id is null
union all
select 'visit_service_without_request_service',count(*)::bigint
from public.installation_execution_visit_services vs left join public.installation_request_services rs on rs.id=vs.request_service_id
where rs.id is null;

-- 3) Team / schedule integrity.
select 'scheduled_visit_without_team' issue,count(*)::bigint rows
from public.installation_execution_visits v
where v.scheduled_date is not null and v.installation_team_id is null
union all
select 'scheduled_visit_invalid_slot',count(*)::bigint
from public.installation_execution_visits v
where v.scheduled_time is not null
  and v.scheduled_time not in(time '12:00',time '14:00',time '16:00',time '18:00',time '20:00',time '22:00')
union all
select 'viewer_without_team_binding',count(*)::bigint
from public.user_profiles u
left join public.installation_user_technician_bindings b on b.user_id=u.id
where u.role='viewer'::public.app_role and u.is_active=true and b.user_id is null;

-- 4) Execution state sanity.
select 'active_visit_without_schedule' issue,count(*)::bigint rows
from public.installation_execution_visits v
where v.status in('مجدولة','قيد التنفيذ','بانتظار التأكيد')
  and (v.scheduled_date is null or v.scheduled_time is null or v.installation_team_id is null)
union all
select 'completed_before_started',count(*)::bigint
from public.installation_execution_visits v
where v.completed_at is not null and v.started_at is null
union all
select 'started_before_arrived',count(*)::bigint
from public.installation_execution_visits v
where v.started_at is not null and v.arrived_at is null;

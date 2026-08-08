-- Phase M15.11.2 read-only verification
select conname,pg_get_constraintdef(oid) definition
from pg_constraint
where conname in ('installation_execution_visits_status_check','installation_execution_quantity_audit_action_check');

select r.request_number,v.visit_no,v.scheduled_date,v.scheduled_time,v.status,
       v.selected_for_execution_at,v.selected_for_execution_by,
       v.on_route_at,v.map_opened_at,v.arrived_at,v.started_at,v.completed_at
from public.installation_execution_visits v
join public.installation_requests r on r.id=v.installation_request_id
where r.request_number='INS-2026-000021'
order by v.visit_no;

select r.request_number,v.visit_no,v.status,v.scheduled_date,v.scheduled_time,
       vs.request_service_id,vs.scheduled_quantity,vs.executed_quantity
from public.installation_execution_visits v
join public.installation_requests r on r.id=v.installation_request_id
left join public.installation_execution_visit_services vs on vs.visit_id=v.id
where r.request_number='INS-2026-000021'
order by v.visit_no,vs.request_service_id;

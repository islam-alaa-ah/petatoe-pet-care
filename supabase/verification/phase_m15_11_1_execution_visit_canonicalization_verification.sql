-- Phase M15.11.1 verification — read only

-- 1) Active scheduled requests without a canonical visit must be zero.
select count(*) as active_scheduled_requests_without_visit
from public.installation_requests r
where r.scheduled_date is not null
  and r.installation_team_id is not null
  and nullif(trim(coalesce(r.assigned_technician_name,'')),'') is not null
  and r.status not in ('ملغي','ملغاة')
  and not exists (
    select 1 from public.installation_execution_visits v
    where v.installation_request_id=r.id
  );

-- 2) No active visit should inherit timestamps from a different visit of the same request.
select count(*) as cross_visit_timeline_collisions
from public.installation_execution_visits a
join public.installation_execution_visits b
  on b.installation_request_id=a.installation_request_id
 and b.id<>a.id
where a.completed_at is not null
  and b.completed_at=a.completed_at;

-- 3) Current execution ownership must live on visits, not parent requests.
select count(*) as legacy_parent_current_selections
from public.installation_requests
where selected_for_execution_at is not null
   or selected_for_execution_by is not null;

-- 4) Inspect the two requests used in the incident investigation.
select
  r.request_number,
  v.visit_no,
  v.scheduled_date,
  v.scheduled_time,
  v.status,
  v.selected_for_execution_at,
  v.selected_for_execution_by,
  v.on_route_at,
  v.map_opened_at,
  v.arrived_at,
  v.started_at,
  v.completed_at
from public.installation_requests r
left join public.installation_execution_visits v on v.installation_request_id=r.id
where r.request_number in ('INS-2026-000021','INS-2026-000028')
order by r.request_number,v.visit_no;

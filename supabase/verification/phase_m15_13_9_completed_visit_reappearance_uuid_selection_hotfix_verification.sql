-- Phase M15.13.9 verification

-- 1. Function must exist and must not contain min(uuid)/min(id).
select
  p.proname,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='select_installation_execution_visit';

-- 2. Requests whose visits are all terminal must not have any active visit.
select
  r.request_number,
  count(*) filter (where v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد') and v.completed_at is null) as active_visits,
  count(*) as total_visits
from public.installation_requests r
join public.installation_execution_visits v on v.installation_request_id=r.id
group by r.id,r.request_number
having count(*)>0
   and count(*) filter (where v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد') and v.completed_at is null)=0
order by r.request_number;

-- 3. Focus check for the reported request when present.
select
  r.request_number,
  v.visit_no,
  v.status,
  v.scheduled_date,
  v.selected_for_execution_at,
  v.on_route_at,
  v.started_at,
  v.completed_at
from public.installation_requests r
join public.installation_execution_visits v on v.installation_request_id=r.id
where r.request_number='INS-2026-000028'
order by v.visit_no;

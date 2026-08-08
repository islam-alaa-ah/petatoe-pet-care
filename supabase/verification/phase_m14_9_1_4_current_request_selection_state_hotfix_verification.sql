-- Function must exist and keep the strict team gate.
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='select_installation_execution_request';

-- Review pre-execution records that are now eligible for selection after scheduling.
select status,count(*)
from public.installation_requests
where installation_team_id is not null
  and scheduled_date is not null
  and scheduled_time is not null
  and on_route_at is null
  and arrived_at is null
  and started_at is null
  and completed_at is null
group by status
order by status;

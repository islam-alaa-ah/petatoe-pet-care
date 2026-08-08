-- Phase M14.9.1.5 verification
select column_name from information_schema.columns
where table_schema='public' and table_name='installation_requests'
  and column_name in ('selected_for_execution_at','on_route_at','map_opened_at','arrived_at','started_at','completed_at')
order by column_name;

select p.proname, pg_get_functiondef(p.oid) ilike '%Legacy progressed requests are resumed%' as resume_logic_present
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='select_installation_execution_request';

select count(*) as progressed_requests_still_missing_active_marker
from public.installation_requests
where status not in ('مكتمل','ملغي') and selected_for_execution_at is null
  and (on_route_at is not null or map_opened_at is not null or arrived_at is not null or started_at is not null
       or status in ('في الطريق','وصل إلى العميل','قيد التنفيذ'));

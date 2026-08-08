-- Phase M15.13.11 verification
select
  pg_get_functiondef(p.oid) ilike '%jsonb_array_length(p_visits)<1%' as accepts_one_appended_visit,
  pg_get_functiondef(p.oid) ilike '%not v_has_confirmed and jsonb_array_length(p_visits)<2%' as initial_split_still_requires_two,
  pg_get_functiondef(p.oid) ilike '%status in (''بانتظار الجدولة'',''مجدولة'')%' as replaces_only_unstarted_visits,
  pg_get_functiondef(p.oid) ilike '%status=''مؤكدة''%' as detects_confirmed_history
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='schedule_installation_request_multi_day';

select installation_request_id, visit_no, scheduled_date, scheduled_time, status
from public.installation_execution_visits
where status='مؤكدة'
order by installation_request_id, visit_no;

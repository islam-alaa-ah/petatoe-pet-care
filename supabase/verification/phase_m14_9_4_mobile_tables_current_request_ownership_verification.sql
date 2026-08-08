-- Phase M14.9.4 verification
select proname from pg_proc where proname in (
  'get_current_installation_execution_request_id',
  'advance_installation_execution_stage'
) order by proname;

select indexname,indexdef from pg_indexes
where schemaname='public' and indexname='uq_installation_active_request_per_user';

select policyname,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename='installation_execution_files'
  and policyname='installation execution files add';

-- Must return 0 rows: no user owns more than one active request.
select selected_for_execution_by,count(*)
from public.installation_requests
where selected_for_execution_by is not null
  and selected_for_execution_at is not null
  and status not in ('مكتمل','ملغي')
group by selected_for_execution_by
having count(*)>1;

-- Phase M14.9.2 verification
select policyname, tablename, cmd
from pg_policies
where schemaname='public'
  and tablename in ('installation_completion_reports','installation_completion_files')
order by tablename, policyname;

select count(*) as completed_requests,
       count(*) filter (where cr.id is null) as pending_documentation,
       count(*) filter (where cr.id is not null) as documented
from public.installation_requests r
left join public.installation_completion_reports cr on cr.installation_request_id=r.id
where r.status='مكتمل';

-- Phase M14.9.8.8 verification
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='get_installation_schedule_global';

select has_function_privilege('authenticated','public.get_installation_schedule_global()','EXECUTE') as authenticated_can_execute;

-- Run the next statement as an authenticated user who has installationSchedule.view.
-- It should include all requests, while can_operate is true only for requests inside that user's installation representative scope.
select public.get_installation_schedule_global();

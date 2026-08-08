select screen_key,screen_name,is_active from public.app_screens where screen_key='installationExecution';
select column_name from information_schema.columns where table_schema='public' and table_name='installation_requests' and column_name in ('execution_notes','execution_failure_reason','on_route_at','started_at','completed_at','last_status_changed_at','last_status_changed_by') order by column_name;
select to_regclass('public.installation_status_history') as status_history_table;
select tgname from pg_trigger where tgrelid='public.installation_requests'::regclass and tgname='trg_track_installation_execution_status';

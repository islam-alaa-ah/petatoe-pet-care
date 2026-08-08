select column_name from information_schema.columns where table_schema='public' and table_name='installation_requests' and column_name in ('selected_for_execution_at','selected_for_execution_by','map_opened_at') order by column_name;
select to_regclass('public.installation_team_access') as installation_team_access;
select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('can_access_installation_team','select_installation_execution_request','record_installation_map_opened') order by proname;

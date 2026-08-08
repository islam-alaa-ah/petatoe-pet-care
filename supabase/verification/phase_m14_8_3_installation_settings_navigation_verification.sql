select column_name from information_schema.columns where table_schema='public' and table_name='installation_service_types' and column_name='default_cost';
select column_name from information_schema.columns where table_schema='public' and table_name='installation_neighborhoods' and column_name in ('city','region') order by column_name;
select table_name from information_schema.tables where table_schema='public' and table_name='installation_teams';
select screen_key,screen_name,group_name,display_order,is_active from public.app_screens where screen_key='installationSettings';
select role,screen_key,can_view,can_add,can_edit,can_delete from public.role_screen_permissions where screen_key='installationSettings';

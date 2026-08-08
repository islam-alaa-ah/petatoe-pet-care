select column_name,data_type from information_schema.columns where table_schema='public' and table_name='installation_settings' order by ordinal_position;
select screen_key,screen_name,group_name,display_order,is_active from public.app_screens where screen_key in ('installationsOverview','installationSettings');
select role,screen_key,can_view,can_edit from public.role_screen_permissions where screen_key='installationSettings';
select * from public.installation_settings;

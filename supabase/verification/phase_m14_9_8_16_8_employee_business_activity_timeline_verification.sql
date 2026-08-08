select to_regclass('public.business_activity_events') as business_activity_events_table;
select routine_name, security_type from information_schema.routines where routine_schema='public' and routine_name='log_business_activity_event';
select event_object_table, trigger_name from information_schema.triggers where trigger_name like 'trg_business_activity_%' order by event_object_table;
select count(*) as events_with_technical_title from public.business_activity_events where coalesce(entity_display_name,'') ~ '^[0-9a-f-]{30,}$';

select screen_key,screen_name,group_name,is_active from public.app_screens where screen_key='notificationCenter';
select event_key,event_name,is_enabled,in_app_enabled,push_enabled from public.notification_event_settings order by display_order;
select count(*) as recipient_rules from public.notification_event_recipient_rules;
select count(*) as notifications_total,count(*) filter(where not is_read) as notifications_unread from public.notifications;
select pg_get_functiondef('public.emit_notification_event(text,uuid,uuid,jsonb,text)'::regprocedure) is not null as emit_function_ready;

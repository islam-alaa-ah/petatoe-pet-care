-- KYUM CRM — M15.12.2 Web Push verification (read-only)
select
  to_regclass('public.notification_push_subscriptions') is not null as subscriptions_table_exists,
  to_regclass('public.notification_push_outbox') is not null as outbox_table_exists,
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='in_app_delivery'
  ) as in_app_delivery_exists;

select
  event_key,event_name,is_enabled,in_app_enabled,push_enabled
from public.notification_event_settings
order by display_order;

select
  count(*) as active_push_subscriptions,
  count(distinct user_id) as subscribed_users
from public.notification_push_subscriptions
where is_active=true;

select status,count(*) as rows_count
from public.notification_push_outbox
group by status
order by status;

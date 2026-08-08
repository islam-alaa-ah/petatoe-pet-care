-- Phase M14.9.8.16.8 fixed migration verification

select
  to_regclass('public.business_activity_events') is not null as table_exists,
  to_regprocedure('public.can_read_business_activity_event(uuid)') is not null as permission_helper_exists,
  to_regprocedure('public.log_business_activity_event(text,text,text,text,text,text,uuid,text,text,text,text,jsonb)') is not null as logger_rpc_exists,
  to_regprocedure('public.capture_business_activity_event()') is not null as trigger_function_exists;

select
  polname,
  polcmd,
  polroles::regrole[]
from pg_policy
where polrelid = 'public.business_activity_events'::regclass
order by polname;

select
  c.relname as table_name,
  t.tgname as trigger_name,
  not t.tgisinternal as is_user_trigger
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'customers',
    'customer_followups',
    'quotations',
    'installation_requests',
    'sales_invoices'
  )
  and t.tgname like 'trg_business_activity_%'
order by c.relname, t.tgname;

select has_table_privilege('authenticated', 'public.business_activity_events', 'INSERT') as authenticated_can_insert,
       has_table_privilege('authenticated', 'public.business_activity_events', 'UPDATE') as authenticated_can_update,
       has_table_privilege('authenticated', 'public.business_activity_events', 'DELETE') as authenticated_can_delete;

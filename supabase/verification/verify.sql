-- PETATOE P5.11.4.1 verification

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (
    p.proname='get_installation_schedule_global'
    or p.proname like 'get_installation_schedule_global_legacy_%'
  )
order by p.proname;

select
  to_regprocedure('public.get_installation_schedule_global()') is not null as schedule_global_exists,
  (
    select lower(pg_get_function_result(p.oid))='jsonb'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_installation_schedule_global'
      and pg_get_function_identity_arguments(p.oid)=''
    limit 1
  ) as schedule_global_returns_jsonb,
  to_regprocedure('public.schedule_installation_request_visit(uuid,date,time,uuid,text,text)') is not null as schedule_save_exists,
  to_regprocedure('public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb)') is not null as create_appointment_exists;

-- P5.11.1 verification
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'create_installation_request_with_services',
    'update_installation_request_with_services',
    'create_petatoe_appointment',
    'update_petatoe_appointment'
  )
order by p.proname,arguments;

select
  to_regprocedure('public.create_installation_request_with_services(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb)') is not null as create_base_ok,
  to_regprocedure('public.update_installation_request_with_services(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb)') is not null as update_base_ok,
  to_regprocedure('public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb)') is not null as create_petatoe_ok,
  to_regprocedure('public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb)') is not null as update_petatoe_ok;

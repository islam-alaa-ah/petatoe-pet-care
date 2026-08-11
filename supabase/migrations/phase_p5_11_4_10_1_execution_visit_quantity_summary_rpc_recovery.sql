-- P5.11.4.10.1 — Execution Visit Quantity Summary RPC Recovery
-- Repairs database migration drift where the completion UI expects
-- public.get_installation_execution_visit_quantity_summary(uuid, uuid)
-- but the live PostgREST schema does not expose that signature.

begin;

-- Fail early with a clear migration error if an older prerequisite schema is missing.
do $$
begin
  if to_regclass('public.installation_requests') is null
     or to_regclass('public.installation_request_services') is null
     or to_regclass('public.installation_execution_visits') is null
     or to_regclass('public.installation_execution_visit_services') is null
     or to_regclass('public.installation_service_types') is null then
    raise exception 'P5.11.4.10.1 prerequisite missing: installation execution visit schema is incomplete';
  end if;
end $$;

drop function if exists public.get_installation_execution_visit_quantity_summary(uuid,uuid);

create function public.get_installation_execution_visit_quantity_summary(
  p_request_id uuid,
  p_visit_id uuid
)
returns table(
  request_id uuid,
  request_service_id uuid,
  service_name text,
  requested_quantity numeric,
  scheduled_current_quantity numeric,
  executed_quantity numeric,
  remaining_quantity numeric,
  unit_price numeric,
  executed_value numeric,
  remaining_value numeric,
  current_visit_id uuid,
  current_visit_no integer
)
language sql
security definer
set search_path=public
as $$
  with confirmed as (
    select
      vs.request_service_id,
      sum(coalesce(vs.executed_quantity,0)) as executed_quantity
    from public.installation_execution_visit_services vs
    join public.installation_execution_visits v on v.id=vs.visit_id
    where v.installation_request_id=p_request_id
      and v.status='مؤكدة'
      and v.id<>p_visit_id
    group by vs.request_service_id
  )
  select
    s.installation_request_id,
    s.id,
    coalesce(st.name,'خدمة'),
    s.quantity,
    coalesce(vs.scheduled_quantity,0),
    coalesce(c.executed_quantity,0),
    greatest(s.quantity-coalesce(c.executed_quantity,0),0),
    s.unit_price,
    coalesce(c.executed_quantity,0)*s.unit_price,
    greatest(s.quantity-coalesce(c.executed_quantity,0),0)*s.unit_price,
    v.id,
    v.visit_no
  from public.installation_request_services s
  join public.installation_execution_visits v
    on v.id=p_visit_id
   and v.installation_request_id=s.installation_request_id
  left join public.installation_execution_visit_services vs
    on vs.visit_id=v.id
   and vs.request_service_id=s.id
  left join confirmed c on c.request_service_id=s.id
  left join public.installation_service_types st on st.id=s.service_type_id
  where s.installation_request_id=p_request_id;
$$;

revoke all on function public.get_installation_execution_visit_quantity_summary(uuid,uuid) from public;
grant execute on function public.get_installation_execution_visit_quantity_summary(uuid,uuid) to authenticated;

commit;

-- Make the repaired function visible to PostgREST immediately after migration.
notify pgrst, 'reload schema';

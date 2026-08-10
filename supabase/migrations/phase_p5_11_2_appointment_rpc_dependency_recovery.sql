-- PETATOE P5.11.2 — Appointment RPC Dependency Recovery
-- Fixes the dependency chain behind create/update appointment RPCs.
--
-- P5.11.1 restored the base create/update RPC signatures, but the live database
-- is also missing at least resolve_installation_request_representative(uuid,uuid).
-- Rather than fixing one missing helper at a time, this migration restores the
-- complete direct dependency set used by appointment create/update/details.

begin;

-- 1) Representative visibility helper.
create or replace function public.can_access_installation_representative(p_representative_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when auth.uid() is null then false
    when public.current_user_role() = 'super_admin' then true
    when p_representative_id is null then false
    else exists (
      select 1
      from public.user_profiles up
      left join public.installation_data_access_profiles ap on ap.user_id=up.id
      where up.id=auth.uid() and up.is_active=true
        and (
          coalesce(ap.access_mode,'own')='all'
          or up.representative_id=p_representative_id
          or (
            coalesce(ap.access_mode,'own')='selected'
            and exists (
              select 1 from public.installation_data_access_representatives ar
              where ar.user_id=up.id and ar.representative_id=p_representative_id
            )
          )
        )
    )
  end
$$;

-- 2) Representative resolver used by CREATE/UPDATE base RPCs.
create or replace function public.resolve_installation_request_representative(
  p_customer_id uuid,
  p_requested_representative_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_representative_id uuid;
  v_current_representative_id uuid;
  v_resolved_representative_id uuid;
begin
  select c.representative_id
    into v_customer_representative_id
  from public.customers c
  where c.id = p_customer_id;

  if not found then
    raise exception 'Selected customer does not exist' using errcode = '23503';
  end if;

  select up.representative_id
    into v_current_representative_id
  from public.user_profiles up
  where up.id = auth.uid()
    and up.is_active = true;

  -- The customer owner is authoritative. Only use the current sales representative
  -- as a safe fallback for legacy customers that have no representative assigned.
  v_resolved_representative_id := coalesce(
    v_customer_representative_id,
    p_requested_representative_id,
    v_current_representative_id
  );

  if v_resolved_representative_id is null then
    raise exception 'Customer has no sales representative and the current user is not linked to one'
      using errcode = '23514';
  end if;

  if p_requested_representative_id is not null
     and v_customer_representative_id is not null
     and p_requested_representative_id <> v_customer_representative_id then
    raise exception 'Requested representative does not own the selected customer'
      using errcode = '42501';
  end if;

  if not public.can_access_installation_representative(v_resolved_representative_id) then
    raise exception 'The selected customer is outside your installation representative scope'
      using errcode = '42501';
  end if;

  return v_resolved_representative_id;
end;
$$;

-- 3) Totals recalculation used after service writes.
create or replace function public.refresh_installation_request_totals(p_request_id uuid)
returns void language sql security definer set search_path=public
as $$
  update public.installation_requests r
  set total_services_count=coalesce(x.total_quantity,0),
      total_services_amount=coalesce(x.total_amount,0),
      updated_at=now()
  from (
    select p_request_id request_id, sum(quantity)::integer total_quantity, sum(line_total)::numeric(14,2) total_amount
    from public.installation_request_services
    where installation_request_id=p_request_id
  ) x
  where r.id=x.request_id;
$$;

-- 4) Appointment scope helper used by update/details and P5.6 team-only viewer rules.
create or replace function public.can_access_installation_request_scope(
  p_representative_id uuid,
  p_installation_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when auth.uid() is null then false
    when public.current_user_role()='super_admin' then true
    when public.current_user_role()='viewer' then
      p_installation_team_id is not null
      and public.can_access_installation_team(p_installation_team_id)
    else
      public.can_access_installation_representative(p_representative_id)
      and (
        public.can_access_installation_team(p_installation_team_id)
        or (
          p_installation_team_id is null
          and public.has_screen_permission('installationSchedule','edit')
        )
      )
  end
$$;

revoke all on function public.can_access_installation_representative(uuid) from public,anon;
grant execute on function public.can_access_installation_representative(uuid) to authenticated,service_role;

revoke all on function public.resolve_installation_request_representative(uuid,uuid) from public,anon;
grant execute on function public.resolve_installation_request_representative(uuid,uuid) to authenticated,service_role;

revoke all on function public.refresh_installation_request_totals(uuid) from public,anon;
grant execute on function public.refresh_installation_request_totals(uuid) to authenticated,service_role;

revoke all on function public.can_access_installation_request_scope(uuid,uuid) from public,anon;
grant execute on function public.can_access_installation_request_scope(uuid,uuid) to authenticated,service_role;

notify pgrst, 'reload schema';

commit;

-- Verification A: dependency functions and privileges.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in(
    'can_access_installation_representative',
    'resolve_installation_request_representative',
    'refresh_installation_request_totals',
    'can_access_installation_request_scope'
  )
order by p.proname,arguments;

-- Verification B: complete create/update dependency contract.
select
  case when to_regprocedure('public.can_access_installation_representative(uuid)') is not null then 'PASS' else 'MISSING' end as can_access_rep,
  case when to_regprocedure('public.resolve_installation_request_representative(uuid,uuid)') is not null then 'PASS' else 'MISSING' end as resolve_rep,
  case when to_regprocedure('public.refresh_installation_request_totals(uuid)') is not null then 'PASS' else 'MISSING' end as refresh_totals,
  case when to_regprocedure('public.can_access_installation_request_scope(uuid,uuid)') is not null then 'PASS' else 'MISSING' end as request_scope,
  case when to_regprocedure('public.create_installation_request_with_services(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb)') is not null then 'PASS' else 'MISSING' end as create_base,
  case when to_regprocedure('public.update_installation_request_with_services(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb)') is not null then 'PASS' else 'MISSING' end as update_base,
  case when to_regprocedure('public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb)') is not null then 'PASS' else 'MISSING' end as create_petatoe,
  case when to_regprocedure('public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb)') is not null then 'PASS' else 'MISSING' end as update_petatoe,
  case when to_regprocedure('public.save_petatoe_appointment_details(uuid,numeric,jsonb,jsonb)') is not null then 'PASS' else 'MISSING' end as save_details;

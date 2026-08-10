-- PETATOE P5.11.3 — Optional Representative Appointment Scope Recovery
--
-- Business rule:
-- A customer/appointment may legitimately have no sales representative.
-- Missing representative must NOT block appointment creation, review, scheduling,
-- team assignment or execution.
--
-- Privacy rule:
-- Sales representatives still cannot see unowned/unassigned appointments merely
-- because representative_id is NULL.
-- Groomer / Driver (viewer) remains TEAM-ONLY exactly as P5.6 requires.

begin;

-- ------------------------------------------------------------------
-- 1) Explicit rule for appointments without a sales representative.
-- ------------------------------------------------------------------
create or replace function public.can_access_unassigned_appointment()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when auth.uid() is null then false
    when public.current_user_role()='super_admin' then true
    when public.current_user_role()='viewer' then false
    when public.current_user_role()::text='sales_representative' then false
    else (
      public.has_screen_permission('installationRequestNew','add')
      or public.has_screen_permission('installationRequests','view')
      or public.has_screen_permission('installationRequests','edit')
      or public.has_screen_permission('installationSchedule','view')
      or public.has_screen_permission('installationSchedule','edit')
      or public.has_screen_permission('installationCompletion','view')
      or public.has_screen_permission('installationReports','view')
      or exists (
        select 1
        from public.installation_data_access_profiles ap
        where ap.user_id=auth.uid()
          and ap.access_mode='all'
      )
    )
  end
$$;

revoke all on function public.can_access_unassigned_appointment() from public,anon;
grant execute on function public.can_access_unassigned_appointment() to authenticated,service_role;

-- ------------------------------------------------------------------
-- 2) Representative resolver:
--    preserve owner/request/current-rep when available, but NULL is a valid
--    resolved value for authorized non-sales staff.
-- ------------------------------------------------------------------
create or replace function public.resolve_installation_request_representative(
  p_customer_id uuid,
  p_requested_representative_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_customer_representative_id uuid;
  v_current_representative_id uuid;
  v_resolved_representative_id uuid;
begin
  select c.representative_id
    into v_customer_representative_id
  from public.customers c
  where c.id=p_customer_id;

  if not found then
    raise exception 'Selected customer does not exist' using errcode='23503';
  end if;

  select up.representative_id
    into v_current_representative_id
  from public.user_profiles up
  where up.id=auth.uid()
    and up.is_active=true;

  v_resolved_representative_id := coalesce(
    v_customer_representative_id,
    p_requested_representative_id,
    v_current_representative_id
  );

  if p_requested_representative_id is not null
     and v_customer_representative_id is not null
     and p_requested_representative_id<>v_customer_representative_id then
    raise exception 'Requested representative does not own the selected customer'
      using errcode='42501';
  end if;

  if v_resolved_representative_id is not null then
    if not public.can_access_installation_representative(v_resolved_representative_id) then
      raise exception 'The selected customer is outside your appointment representative scope'
        using errcode='42501';
    end if;
    return v_resolved_representative_id;
  end if;

  if not public.can_access_unassigned_appointment() then
    raise exception 'Appointment has no sales representative and is outside your permitted scope'
      using errcode='42501';
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_installation_request_representative(uuid,uuid) from public,anon;
grant execute on function public.resolve_installation_request_representative(uuid,uuid) to authenticated,service_role;

-- ------------------------------------------------------------------
-- 3) Canonical scope used throughout request -> schedule -> execution.
-- ------------------------------------------------------------------
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

    -- Groomer / Driver remains strictly team-bound.
    when public.current_user_role()='viewer' then
      p_installation_team_id is not null
      and public.can_access_installation_team(p_installation_team_id)

    -- Normal representative-owned appointment.
    when p_representative_id is not null then
      public.can_access_installation_representative(p_representative_id)
      and (
        public.can_access_installation_team(p_installation_team_id)
        or (
          p_installation_team_id is null
          and public.has_screen_permission('installationSchedule','edit')
        )
      )

    -- Appointment legitimately has no sales representative.
    when p_installation_team_id is null then
      public.can_access_unassigned_appointment()

    -- Once assigned to a team, authorized operations staff must also be in team scope.
    else
      public.can_access_unassigned_appointment()
      and public.can_access_installation_team(p_installation_team_id)
  end
$$;

revoke all on function public.can_access_installation_request_scope(uuid,uuid) from public,anon;
grant execute on function public.can_access_installation_request_scope(uuid,uuid) to authenticated,service_role;

-- ------------------------------------------------------------------
-- 4) Canonical INSERT policy: representative_id may be NULL.
-- ------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname='public'
      and tablename='installation_requests'
      and cmd='INSERT'
  loop
    execute format('drop policy if exists %I on public.installation_requests',p.policyname);
  end loop;
end $$;

create policy "installation requests canonical scoped insert"
on public.installation_requests
for insert
to authenticated
with check(
  public.has_screen_permission('installationRequestNew','add')
  and installation_team_id is null
  and (
    (
      representative_id is not null
      and public.can_access_installation_representative(representative_id)
    )
    or (
      representative_id is null
      and public.can_access_unassigned_appointment()
    )
  )
);

-- ------------------------------------------------------------------
-- 5) UPDATE RPC recovery:
--    old code treated representative_id=NULL as "request not found".
-- ------------------------------------------------------------------
create or replace function public.update_installation_request_with_services(
  p_request_id uuid,
  p_customer_id uuid,
  p_quotation_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_priority text,
  p_installation_address text,
  p_customer_order_number text,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_request_number text;
  v_map_url text := nullif(btrim(coalesce(p_customer_map_url,'')), '');
  v_customer_order_number text := nullif(btrim(coalesce(p_customer_order_number,'')), '');
  v_existing_representative_id uuid;
  v_existing_team_id uuid;
  v_new_representative_id uuid;
begin
  if not (public.has_screen_permission('installationRequests','edit')
          or public.has_screen_permission('installationSchedule','edit')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select r.representative_id,r.installation_team_id
  into v_existing_representative_id,v_existing_team_id
  from public.installation_requests r
  where r.id=p_request_id;

  if not found then
    raise exception 'Installation request not found' using errcode='P0002';
  end if;

  if not public.can_access_installation_request_scope(
    v_existing_representative_id,
    v_existing_team_id
  ) then
    raise exception 'Installation request is outside your permitted scope' using errcode='42501';
  end if;

  v_new_representative_id := public.resolve_installation_request_representative(
    p_customer_id,
    p_representative_id
  );

  if p_services is null or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 then
    raise exception 'At least one service is required' using errcode='23514';
  end if;

  create temporary table if not exists tmp_installation_old_alloc(
    visit_id uuid, visit_no integer, service_type_id uuid,
    scheduled_quantity numeric, executed_quantity numeric
  ) on commit drop;
  truncate tmp_installation_old_alloc;

  insert into tmp_installation_old_alloc
  select ev.id,ev.visit_no,irs.service_type_id,vs.scheduled_quantity,coalesce(vs.executed_quantity,0)
  from public.installation_execution_visits ev
  join public.installation_execution_visit_services vs on vs.visit_id=ev.id
  join public.installation_request_services irs on irs.id=vs.request_service_id
  where ev.installation_request_id=p_request_id
    and ev.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');

  if exists(
    select 1 from tmp_installation_old_alloc a
    join jsonb_to_recordset(p_services) x(service_type_id uuid,quantity integer,unit_price numeric)
      on x.service_type_id=a.service_type_id
    group by a.service_type_id,x.quantity
    having sum(a.executed_quantity)>x.quantity
  ) then
    raise exception 'Cannot reduce a service quantity below its already executed quantity' using errcode='23514';
  end if;

  update public.installation_requests
  set customer_id=p_customer_id,quotation_id=p_quotation_id,representative_id=v_new_representative_id,
      neighborhood_id=p_neighborhood_id,priority=p_priority,
      installation_address=nullif(btrim(coalesce(p_installation_address,'')),''),
      customer_order_number=v_customer_order_number,customer_map_url=v_map_url,
      notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where installation_requests.id=p_request_id
  returning installation_requests.request_number into v_request_number;

  if v_request_number is null then
    raise exception 'Installation request not found or not accessible' using errcode='P0002';
  end if;

  delete from public.installation_request_services where installation_request_id=p_request_id;

  insert into public.installation_request_services(installation_request_id,service_type_id,quantity,unit_price)
  select p_request_id,x.service_type_id,x.quantity,x.unit_price
  from jsonb_to_recordset(p_services) x(service_type_id uuid,quantity integer,unit_price numeric)
  where x.service_type_id is not null and x.quantity>=1 and x.unit_price>=0;

  perform public.refresh_installation_request_totals(p_request_id);

  -- Rebuild visit allocations against the newly-created request service IDs.
  -- Existing multi-day distribution is preserved in visit order; quantity deltas are
  -- placed on the last active visit. New services are placed on the first active visit.
  with active_visits as (
    select ev.id,ev.visit_no,
           row_number() over(order by ev.visit_no,ev.created_at,ev.id) rn,
           count(*) over() visit_count
    from public.installation_execution_visits ev
    where ev.installation_request_id=p_request_id
      and ev.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
  ), new_services as (
    select s.id request_service_id,s.service_type_id,s.quantity
    from public.installation_request_services s
    where s.installation_request_id=p_request_id
  ), old_by_visit as (
    select a.visit_id,a.visit_no,a.service_type_id,
           sum(a.scheduled_quantity) scheduled_quantity,
           sum(a.executed_quantity) executed_quantity
    from tmp_installation_old_alloc a
    group by a.visit_id,a.visit_no,a.service_type_id
  ), prepared as (
    select v.id visit_id,v.visit_no,v.rn,v.visit_count,
           ns.request_service_id,ns.service_type_id,ns.quantity,
           coalesce(o.scheduled_quantity,0) old_scheduled,
           coalesce(o.executed_quantity,0) old_executed,
           sum(coalesce(o.scheduled_quantity,0)) over(
             partition by ns.request_service_id order by v.visit_no,v.id
             rows between unbounded preceding and 1 preceding
           ) prior_scheduled,
           sum(coalesce(o.scheduled_quantity,0)) over(partition by ns.request_service_id) old_total
    from active_visits v cross join new_services ns
    left join old_by_visit o on o.visit_id=v.id and o.service_type_id=ns.service_type_id
  ), allocations as (
    select visit_id,request_service_id,
      case
        when visit_count=1 then quantity
        when old_total=0 and rn=1 then quantity
        when old_total=0 then 0
        when rn=visit_count then greatest(0,quantity-coalesce(prior_scheduled,0))
        else least(old_scheduled,greatest(0,quantity-coalesce(prior_scheduled,0)))
      end scheduled_quantity,
      least(old_executed,quantity) executed_quantity
    from prepared
  )
  insert into public.installation_execution_visit_services(
    visit_id,request_service_id,scheduled_quantity,executed_quantity,updated_at
  )
  select visit_id,request_service_id,scheduled_quantity,
         nullif(executed_quantity,0),now()
  from allocations
  where scheduled_quantity>0 or executed_quantity>0;

  return query select p_request_id,v_request_number;
end;
$$;

revoke all on function public.update_installation_request_with_services(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb
) from public,anon;

grant execute on function public.update_installation_request_with_services(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb
) to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- ------------------------------------------------------------------
-- Verification A — exact functions/signatures.
-- ------------------------------------------------------------------
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in(
    'can_access_unassigned_appointment',
    'resolve_installation_request_representative',
    'can_access_installation_request_scope',
    'create_installation_request_with_services',
    'update_installation_request_with_services',
    'create_petatoe_appointment',
    'update_petatoe_appointment',
    'save_petatoe_appointment_details'
  )
order by p.proname,arguments;

-- Verification B — existing data remains valid with nullable representative.
select
  count(*) filter(where representative_id is null) as appointments_without_representative,
  count(*) filter(where representative_id is null and installation_team_id is null) as unassigned_without_representative,
  count(*) filter(where representative_id is null and installation_team_id is not null) as team_assigned_without_representative
from public.installation_requests;

-- Verification C — no appointment FK corruption.
select
  count(*) filter(where c.id is null) as orphan_customers,
  count(*) filter(where r.quotation_id is not null and q.id is null) as orphan_contracts,
  count(*) filter(where r.neighborhood_id is not null and n.id is null) as orphan_neighborhoods,
  count(*) filter(where r.installation_team_id is not null and t.id is null) as orphan_teams
from public.installation_requests r
left join public.customers c on c.id=r.customer_id
left join public.quotations q on q.id=r.quotation_id
left join public.installation_neighborhoods n on n.id=r.neighborhood_id
left join public.installation_teams t on t.id=r.installation_team_id;

begin;

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
security invoker
set search_path=public
as $$
declare
  v_request_number text;
  v_map_url text := nullif(btrim(coalesce(p_customer_map_url,'')), '');
  v_customer_order_number text := nullif(btrim(coalesce(p_customer_order_number,'')), '');
begin
  if not (public.has_screen_permission('installationRequests','edit')
          or public.has_screen_permission('installationSchedule','edit')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

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
  set customer_id=p_customer_id,quotation_id=p_quotation_id,representative_id=p_representative_id,
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

grant execute on function public.update_installation_request_with_services(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb
) to authenticated;

commit;

begin;

-- P5.13.8.64
-- Completion workspace new-service INSERT ambiguity hotfix.
-- Canonical function body remains the P5.13.8.50 request-service identity implementation;
-- only the INSERT RETURNING target is explicitly aliased because RETURNS TABLE creates an output variable named id.
-- Completion workspace service-row identity recovery.
-- Canonical identity is installation_request_services.id (request_service_id), not service_type_id.
-- This preserves legitimate duplicate service types as separate request lines and prevents one edit
-- from overwriting every row that happens to use the same service type.

create or replace function public.update_installation_completion_workspace(
  p_request_id uuid,
  p_visit_id uuid,
  p_services jsonb,
  p_discount_amount numeric,
  p_collection jsonb
)
returns table(id uuid,request_number text,final_amount numeric,discount_amount numeric)
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  svc record;
  snap record;
  payload_row record;
  v_target_visit uuid;
  v_needed numeric;
  v_alloc numeric;
  v_executed numeric;
  v_new_service_id uuid;
  v_amount numeric:=greatest(coalesce((p_collection->>'amount_collected')::numeric,0),0);
  v_payment text:=nullif(btrim(coalesce(p_collection->>'payment_method','')),'');
  v_invoice_number text:=nullif(btrim(coalesce(p_collection->>'invoice_number','')),'');
  v_notes text:=nullif(btrim(coalesce(p_collection->>'collection_notes','')),'');
  v_final numeric;
  v_discount numeric;
begin
  if not public.has_screen_permission('installationCompletion','edit') then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select * into r
  from public.installation_requests
  where installation_requests.id=p_request_id
  for update;

  if not found then
    raise exception 'Appointment not found' using errcode='P0002';
  end if;

  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then
    raise exception 'Appointment is outside your permitted scope' using errcode='42501';
  end if;

  if p_services is null or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 then
    raise exception 'At least one service is required' using errcode='23514';
  end if;

  create temporary table if not exists tmp_completion_services(
    payload_ord bigint,
    request_service_id uuid,
    service_type_id uuid,
    quantity integer,
    unit_price numeric,
    resolved_request_service_id uuid
  ) on commit drop;
  truncate tmp_completion_services;

  insert into tmp_completion_services(payload_ord,request_service_id,service_type_id,quantity,unit_price,resolved_request_service_id)
  select
    x.ordinality,
    nullif(x.item->>'request_service_id','')::uuid,
    nullif(x.item->>'service_type_id','')::uuid,
    (x.item->>'quantity')::integer,
    (x.item->>'unit_price')::numeric,
    nullif(x.item->>'request_service_id','')::uuid
  from jsonb_array_elements(p_services) with ordinality as x(item,ordinality);

  if exists(
    select 1 from tmp_completion_services
    where service_type_id is null or quantity<1 or unit_price<0
  ) then
    raise exception 'Invalid service data' using errcode='23514';
  end if;

  -- A persisted request line may appear only once in the submitted workspace.
  if exists(
    select request_service_id
    from tmp_completion_services
    where request_service_id is not null
    group by request_service_id
    having count(*)>1
  ) then
    raise exception 'Duplicate request service row' using errcode='23514';
  end if;

  -- Never allow a caller to submit an ID owned by another request.
  if exists(
    select 1
    from tmp_completion_services t
    where t.request_service_id is not null
      and not exists(
        select 1
        from public.installation_request_services s
        where s.id=t.request_service_id
          and s.installation_request_id=p_request_id
      )
  ) then
    raise exception 'Request service row does not belong to this appointment' using errcode='23514';
  end if;

  if p_visit_id is not null then
    select v.id into v_target_visit
    from public.installation_execution_visits v
    where v.id=p_visit_id
      and v.installation_request_id=p_request_id
      and v.status in ('قيد التنفيذ','بانتظار التأكيد','مجدولة');
    if v_target_visit is null then
      raise exception 'Current execution visit is not editable';
    end if;
  else
    select v.id into v_target_visit
    from public.installation_execution_visits v
    where v.installation_request_id=p_request_id
      and v.status in ('قيد التنفيذ','بانتظار التأكيد','مجدولة')
    order by v.visit_no,v.created_at
    limit 1;
  end if;

  create temporary table if not exists tmp_completion_alloc(
    visit_id uuid,
    visit_no integer,
    request_service_id uuid,
    scheduled_quantity numeric,
    executed_quantity numeric
  ) on commit drop;
  truncate tmp_completion_alloc;

  -- Snapshot active allocations by the canonical request-service line ID.
  insert into tmp_completion_alloc
  select
    v.id,
    v.visit_no,
    vs.request_service_id,
    coalesce(vs.scheduled_quantity,0),
    coalesce(vs.executed_quantity,0)
  from public.installation_execution_visits v
  join public.installation_execution_visit_services vs on vs.visit_id=v.id
  where v.installation_request_id=p_request_id
    and v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');

  -- Protect executed history line-by-line. Duplicate service types are valid; IDs are authoritative.
  for svc in
    select s.id,s.service_type_id,s.quantity
    from public.installation_request_services s
    where s.installation_request_id=p_request_id
  loop
    select coalesce(sum(coalesce(vs.executed_quantity,0)),0) into v_executed
    from public.installation_execution_visit_services vs
    join public.installation_execution_visits v on v.id=vs.visit_id
    where v.installation_request_id=p_request_id
      and vs.request_service_id=svc.id;

    if not exists(
      select 1 from tmp_completion_services t where t.request_service_id=svc.id
    ) and v_executed>0 then
      raise exception 'Cannot remove a service with executed quantity' using errcode='23514';
    end if;

    if exists(
      select 1
      from tmp_completion_services t
      where t.request_service_id=svc.id
        and t.quantity<v_executed
    ) then
      raise exception 'Cannot reduce a service quantity below its already executed quantity' using errcode='23514';
    end if;

    if exists(
      select 1
      from tmp_completion_services t
      where t.request_service_id=svc.id
        and t.service_type_id<>svc.service_type_id
    ) and v_executed>0 then
      raise exception 'Cannot change the service type of a line with executed quantity' using errcode='23514';
    end if;
  end loop;

  -- Remove active allocation rows before mutating request-service rows. Confirmed history remains protected above.
  delete from public.installation_execution_visit_services vs
  using public.installation_execution_visits v
  where vs.visit_id=v.id
    and v.installation_request_id=p_request_id
    and v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');

  -- Update only the exact persisted line that the user edited.
  update public.installation_request_services s
  set service_type_id=t.service_type_id,
      quantity=t.quantity,
      unit_price=t.unit_price,
      updated_at=now()
  from tmp_completion_services t
  where t.request_service_id is not null
    and s.id=t.request_service_id
    and s.installation_request_id=p_request_id;

  -- Delete only persisted lines explicitly removed from the workspace.
  delete from public.installation_request_services s
  where s.installation_request_id=p_request_id
    and not exists(
      select 1
      from tmp_completion_services t
      where t.request_service_id=s.id
    );

  -- New workspace rows get a new request_service_id even when another row uses the same service type.
  for payload_row in
    select * from tmp_completion_services
    where request_service_id is null
    order by payload_ord
  loop
    insert into public.installation_request_services as new_request_service(
      installation_request_id,service_type_id,quantity,unit_price
    ) values(
      p_request_id,payload_row.service_type_id,payload_row.quantity,payload_row.unit_price
    ) returning new_request_service.id into v_new_service_id;

    update tmp_completion_services
    set resolved_request_service_id=v_new_service_id
    where payload_ord=payload_row.payload_ord;
  end loop;

  perform public.refresh_installation_request_totals(p_request_id);
  update public.installation_requests
  set discount_amount=greatest(coalesce(p_discount_amount,0),0),
      tax_rate=15,
      updated_at=now()
  where installation_requests.id=p_request_id;

  select r2.final_amount,r2.discount_amount
  into v_final,v_discount
  from public.installation_requests r2
  where r2.id=p_request_id;

  v_amount:=round(coalesce(v_amount,0),2);
  v_final:=round(coalesce(v_final,0),2);
  v_discount:=round(coalesce(v_discount,0),2);

  if (v_amount*100)::bigint>(v_final*100)::bigint then
    raise exception 'Collected amount cannot exceed appointment total' using errcode='23514';
  end if;
  if v_amount>0 and v_payment is null then
    raise exception 'Payment method is required' using errcode='23514';
  end if;
  if v_invoice_number is not null and exists(
    select 1 from public.installation_request_collection c
    where c.invoice_number=v_invoice_number
      and c.installation_request_id<>p_request_id
  ) then
    raise exception 'Invoice number is already assigned to another appointment' using errcode='23505';
  end if;
  if v_invoice_number is not null and exists(
    select 1 from public.sales_invoices si
    where si.invoice_number=v_invoice_number
      and (si.installation_request_id is null or si.installation_request_id<>p_request_id)
      and si.status<>'ملغاة'
  ) then
    raise exception 'Invoice number already exists' using errcode='23505';
  end if;

  -- Rebuild active allocations by request_service_id, never by service_type_id.
  for svc in
    select s.id,s.quantity
    from public.installation_request_services s
    where s.installation_request_id=p_request_id
    order by s.created_at,s.id
  loop
    select coalesce(sum(coalesce(vs.executed_quantity,0)),0) into v_executed
    from public.installation_execution_visit_services vs
    join public.installation_execution_visits v on v.id=vs.visit_id
    where v.installation_request_id=p_request_id
      and v.status='مؤكدة'
      and vs.request_service_id=svc.id;

    v_needed:=greatest(svc.quantity-v_executed,0);

    for snap in
      select *
      from tmp_completion_alloc a
      where a.request_service_id=svc.id
      order by a.visit_no,a.visit_id
    loop
      exit when v_needed<=0;
      v_alloc:=least(greatest(snap.scheduled_quantity,snap.executed_quantity),v_needed);
      if v_alloc>0 then
        insert into public.installation_execution_visit_services(
          visit_id,request_service_id,scheduled_quantity,executed_quantity,updated_at
        ) values(
          snap.visit_id,svc.id,v_alloc,nullif(least(snap.executed_quantity,v_alloc),0),now()
        )
        on conflict(visit_id,request_service_id) do update
        set scheduled_quantity=excluded.scheduled_quantity,
            executed_quantity=excluded.executed_quantity,
            updated_at=now();
        v_needed:=v_needed-v_alloc;
      end if;
    end loop;

    if v_needed>0 and v_target_visit is not null then
      insert into public.installation_execution_visit_services(
        visit_id,request_service_id,scheduled_quantity,updated_at
      ) values(
        v_target_visit,svc.id,v_needed,now()
      )
      on conflict(visit_id,request_service_id) do update
      set scheduled_quantity=public.installation_execution_visit_services.scheduled_quantity+excluded.scheduled_quantity,
          updated_at=now();
    end if;
  end loop;

  insert into public.installation_request_collection(
    installation_request_id,session_value,total_discount,amount_collected,collection_status,
    payment_method,appointment_status,invoice_number,collection_notes,updated_at
  ) values(
    p_request_id,v_final,v_discount,v_amount,
    case
      when (v_amount*100)::bigint<=0 then 'غير محصل'
      when (v_amount*100)::bigint>=(v_final*100)::bigint then 'محصل بالكامل'
      else 'محصل جزئيًا'
    end,
    v_payment,coalesce(r.status,'قيد التنفيذ'),v_invoice_number,v_notes,now()
  )
  on conflict(installation_request_id) do update
  set session_value=excluded.session_value,
      total_discount=excluded.total_discount,
      amount_collected=excluded.amount_collected,
      collection_status=excluded.collection_status,
      payment_method=excluded.payment_method,
      appointment_status=excluded.appointment_status,
      invoice_number=excluded.invoice_number,
      collection_notes=excluded.collection_notes,
      updated_at=now();

  return query select r.id,r.request_number,v_final,v_discount;
end;
$$;

revoke all on function public.update_installation_completion_workspace(uuid,uuid,jsonb,numeric,jsonb) from public,anon;
grant execute on function public.update_installation_completion_workspace(uuid,uuid,jsonb,numeric,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';
commit;

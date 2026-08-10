-- PETATOE P5.11 — Appointment Cycle Deep Recovery
-- Scope: appointment create/update integrity + fixed scheduling slots.
-- Does not alter historical appointment data or execution history.
begin;

-- ------------------------------------------------------------------
-- 1) Create/update wrapper recovery.
-- Root cause: RETURNS TABLE(id uuid, ...) creates an output variable named id.
-- Unqualified `where id = ...` inside PL/pgSQL is therefore ambiguous.
-- ------------------------------------------------------------------
create or replace function public.create_petatoe_appointment(
  p_customer_id uuid,
  p_contract_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb,
  p_discount_amount numeric,
  p_animals jsonb,
  p_collection jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_number text;
  v_address text;
begin
  select n.name
    into v_address
  from public.installation_neighborhoods n
  where n.id=p_neighborhood_id;

  if v_address is null then
    raise exception 'Appointment neighborhood not found' using errcode='23514';
  end if;

  select r.id,r.request_number
    into v_id,v_number
  from public.create_installation_request_with_services(
    p_customer_id,p_contract_id,p_representative_id,p_neighborhood_id,
    'عادية',v_address,null,p_customer_map_url,p_notes,p_services
  ) r;

  perform public.save_petatoe_appointment_details(
    v_id,p_discount_amount,p_animals,p_collection
  );

  return query select v_id,v_number;
end;
$$;

create or replace function public.update_petatoe_appointment(
  p_request_id uuid,
  p_customer_id uuid,
  p_contract_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb,
  p_discount_amount numeric,
  p_animals jsonb,
  p_collection jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_number text;
  v_address text;
begin
  select n.name
    into v_address
  from public.installation_neighborhoods n
  where n.id=p_neighborhood_id;

  if v_address is null then
    raise exception 'Appointment neighborhood not found' using errcode='23514';
  end if;

  select r.id,r.request_number
    into v_id,v_number
  from public.update_installation_request_with_services(
    p_request_id,p_customer_id,p_contract_id,p_representative_id,p_neighborhood_id,
    'عادية',v_address,null,p_customer_map_url,p_notes,p_services
  ) r;

  perform public.save_petatoe_appointment_details(
    p_request_id,p_discount_amount,p_animals,p_collection
  );

  return query select v_id,v_number;
end;
$$;

-- Harden the details helper as well: every installation_requests.id reference is qualified.
create or replace function public.save_petatoe_appointment_details(
  p_request_id uuid,
  p_discount_amount numeric,
  p_animals jsonb,
  p_collection jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.installation_requests%rowtype;
  v_final numeric(14,2);
  v_discount numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;

  select ir.* into v_row
  from public.installation_requests ir
  where ir.id=p_request_id
  for update;

  if not found then raise exception 'Appointment not found' using errcode='P0002'; end if;

  if not (
    public.has_screen_permission('installationRequestNew','add')
    or public.has_screen_permission('installationRequests','edit')
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not public.can_access_installation_request_scope(v_row.representative_id,v_row.installation_team_id) then
    raise exception 'Appointment is outside your permitted scope' using errcode='42501';
  end if;

  update public.installation_requests ir
  set discount_amount=greatest(coalesce(p_discount_amount,0),0),
      tax_rate=15,
      customer_order_number=null,
      priority='عادية',
      updated_at=now()
  where ir.id=p_request_id
  returning ir.final_amount,ir.discount_amount into v_final,v_discount;

  delete from public.installation_request_animals a
  where a.installation_request_id=p_request_id;

  if p_animals is not null and jsonb_typeof(p_animals)='array' then
    insert into public.installation_request_animals(
      installation_request_id,pet_name,pet_type,breed,pet_size,quantity,display_order
    )
    select p_request_id,
           btrim(coalesce(a.value->>'pet_name','')),
           btrim(coalesce(a.value->>'pet_type','')),
           nullif(btrim(coalesce(a.value->>'breed','')),''),
           nullif(btrim(coalesce(a.value->>'pet_size','')),''),
           greatest(coalesce(nullif(a.value->>'quantity','')::integer,1),1),
           a.ord::integer
    from jsonb_array_elements(p_animals) with ordinality as a(value,ord)
    where btrim(coalesce(a.value->>'pet_name',''))<>''
       or btrim(coalesce(a.value->>'pet_type',''))<>'';
  end if;

  insert into public.installation_request_collection(
    installation_request_id,session_value,total_discount,amount_collected,
    collection_status,payment_method,appointment_status,updated_at
  ) values(
    p_request_id,
    v_final,
    v_discount,
    greatest(coalesce((coalesce(p_collection,'{}'::jsonb)->>'amount_collected')::numeric,0),0),
    coalesce(nullif(coalesce(p_collection,'{}'::jsonb)->>'collection_status',''),'غير محصل'),
    nullif(coalesce(p_collection,'{}'::jsonb)->>'payment_method',''),
    coalesce(nullif(coalesce(p_collection,'{}'::jsonb)->>'appointment_status',''),v_row.status,'بانتظار المراجعة'),
    now()
  )
  on conflict(installation_request_id) do update set
    session_value=excluded.session_value,
    total_discount=excluded.total_discount,
    amount_collected=excluded.amount_collected,
    collection_status=excluded.collection_status,
    payment_method=excluded.payment_method,
    appointment_status=excluded.appointment_status,
    updated_at=now();
end;
$$;

revoke all on function public.save_petatoe_appointment_details(uuid,numeric,jsonb,jsonb) from public,anon;
revoke all on function public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) from public,anon;
revoke all on function public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) from public,anon;
grant execute on function public.save_petatoe_appointment_details(uuid,numeric,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) to authenticated,service_role;

-- ------------------------------------------------------------------
-- 2) Canonical appointment slots.
-- Final PETATOE slots: 12:00 / 14:00 / 16:00 / 18:00 / 20:00 / 22:00.
-- Existing historical rows are not rewritten. New/changed schedule times are guarded.
-- ------------------------------------------------------------------
create or replace function public.guard_petatoe_appointment_time_slot()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.scheduled_time is not null
     and new.scheduled_time not in (
       time '12:00',time '14:00',time '16:00',
       time '18:00',time '20:00',time '22:00'
     ) then
    raise exception 'Appointment time must be one of 12:00, 14:00, 16:00, 18:00, 20:00 or 22:00'
      using errcode='23514';
  end if;
  return new;
end;
$$;

-- Parent compatibility row.
drop trigger if exists trg_petatoe_appointment_slot_request on public.installation_requests;
create trigger trg_petatoe_appointment_slot_request
before insert or update of scheduled_time on public.installation_requests
for each row execute function public.guard_petatoe_appointment_time_slot();

-- Canonical multi-visit scheduling rows.
do $$
begin
  if to_regclass('public.installation_execution_visits') is not null then
    execute 'drop trigger if exists trg_petatoe_appointment_slot_visit on public.installation_execution_visits';
    execute 'create trigger trg_petatoe_appointment_slot_visit before insert or update of scheduled_time on public.installation_execution_visits for each row execute function public.guard_petatoe_appointment_time_slot()';
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;

-- Verification A: no ambiguous id remains in the appointment wrappers.
select p.proname as function_name,
       position('where id=' in lower(pg_get_functiondef(p.oid))) as unqualified_where_id_position
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('create_petatoe_appointment','update_petatoe_appointment','save_petatoe_appointment_details')
order by p.proname;

-- Verification B: current invalid scheduled slots (historical rows are reported, not changed).
select 'installation_requests' as object_name,count(*)::bigint as invalid_slot_rows
from public.installation_requests r
where r.scheduled_time is not null
  and r.scheduled_time not in (time '12:00',time '14:00',time '16:00',time '18:00',time '20:00',time '22:00')
union all
select 'installation_execution_visits',count(*)::bigint
from public.installation_execution_visits v
where v.scheduled_time is not null
  and v.scheduled_time not in (time '12:00',time '14:00',time '16:00',time '18:00',time '20:00',time '22:00');

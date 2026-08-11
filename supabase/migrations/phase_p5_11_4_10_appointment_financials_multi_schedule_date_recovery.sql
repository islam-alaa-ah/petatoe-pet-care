-- PETATOE P5.11.4.10 — Appointment Financials + Multi-Schedule Date Recovery
-- Scope:
-- 1) Discount can be fixed amount or percentage.
-- 2) VAT 15% is calculated before discount; discount applies to VAT-inclusive gross.
-- 3) Multi-visit scheduling accepts every selected visit and supports same team/day at different slots.
-- 4) Preserve visit history numbering when replacing only not-started planned visits.
begin;

-- ============================================================
-- A. Persist discount intent separately from calculated amount
-- ============================================================
alter table public.installation_requests
  add column if not exists discount_type text not null default 'amount',
  add column if not exists discount_value numeric(14,2) not null default 0;

update public.installation_requests
set discount_type='amount', discount_value=coalesce(discount_amount,0)
where discount_type is null
   or discount_type not in ('amount','percentage')
   or (discount_value=0 and coalesce(discount_amount,0)>0);

alter table public.installation_requests
  drop constraint if exists installation_requests_discount_type_check;
alter table public.installation_requests
  add constraint installation_requests_discount_type_check
  check (discount_type in ('amount','percentage'));

create or replace function public.recalculate_installation_request_financials()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_subtotal numeric(14,2);
  v_tax numeric(14,2);
  v_gross numeric(14,2);
  v_discount_value numeric(14,2);
  v_discount numeric(14,2);
begin
  v_subtotal := greatest(coalesce(new.total_services_amount,0),0);
  new.tax_rate := coalesce(new.tax_rate,15);
  v_tax := round(v_subtotal*new.tax_rate/100.0,2);
  v_gross := round(v_subtotal+v_tax,2);

  new.discount_type := case when new.discount_type='percentage' then 'percentage' else 'amount' end;

  -- Legacy compatibility: an older client may still write discount_amount only.
  if new.discount_type='amount'
     and greatest(coalesce(new.discount_value,0),0)=0
     and greatest(coalesce(new.discount_amount,0),0)>0 then
    new.discount_value := greatest(coalesce(new.discount_amount,0),0);
  end if;

  v_discount_value := greatest(coalesce(new.discount_value,0),0);
  if new.discount_type='percentage' then
    v_discount_value := least(v_discount_value,100);
    v_discount := round(v_gross*v_discount_value/100.0,2);
  else
    v_discount := least(v_discount_value,v_gross);
  end if;

  new.discount_value := v_discount_value;
  new.discount_amount := v_discount;
  new.tax_amount := v_tax;
  new.final_amount := round(greatest(v_gross-v_discount,0),2);
  return new;
end;
$$;

drop trigger if exists trg_installation_request_financials on public.installation_requests;
create trigger trg_installation_request_financials
before insert or update of total_services_amount,discount_amount,discount_type,discount_value,tax_rate
on public.installation_requests
for each row
execute function public.recalculate_installation_request_financials();

-- ============================================================
-- B. New appointment create/update signatures preserve discount type/value
-- ============================================================
create or replace function public.save_petatoe_appointment_details(
  p_request_id uuid,
  p_discount_amount numeric,
  p_discount_type text,
  p_discount_value numeric,
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
  v_type text;
  v_value numeric(14,2);
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

  v_type := case when p_discount_type='percentage' then 'percentage' else 'amount' end;
  v_value := greatest(coalesce(p_discount_value,p_discount_amount,0),0);
  if v_type='percentage' then v_value:=least(v_value,100); end if;

  update public.installation_requests ir
  set discount_type=v_type,
      discount_value=v_value,
      -- Written for backward-compatible audit visibility; trigger recalculates canonical amount.
      discount_amount=greatest(coalesce(p_discount_amount,0),0),
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

create or replace function public.create_petatoe_appointment(
  p_customer_id uuid,
  p_contract_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb,
  p_discount_amount numeric,
  p_discount_type text,
  p_discount_value numeric,
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
  select n.name into v_address
  from public.installation_neighborhoods n
  where n.id=p_neighborhood_id;
  if v_address is null then raise exception 'Appointment neighborhood not found' using errcode='23514'; end if;

  select r.id,r.request_number into v_id,v_number
  from public.create_installation_request_with_services(
    p_customer_id,p_contract_id,p_representative_id,p_neighborhood_id,
    'عادية',v_address,null,p_customer_map_url,p_notes,p_services
  ) r;

  perform public.save_petatoe_appointment_details(
    v_id,p_discount_amount,p_discount_type,p_discount_value,p_animals,p_collection
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
  p_discount_type text,
  p_discount_value numeric,
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
  select n.name into v_address
  from public.installation_neighborhoods n
  where n.id=p_neighborhood_id;
  if v_address is null then raise exception 'Appointment neighborhood not found' using errcode='23514'; end if;

  select r.id,r.request_number into v_id,v_number
  from public.update_installation_request_with_services(
    p_request_id,p_customer_id,p_contract_id,p_representative_id,p_neighborhood_id,
    'عادية',v_address,null,p_customer_map_url,p_notes,p_services
  ) r;

  perform public.save_petatoe_appointment_details(
    p_request_id,p_discount_amount,p_discount_type,p_discount_value,p_animals,p_collection
  );
  return query select v_id,v_number;
end;
$$;

revoke all on function public.save_petatoe_appointment_details(uuid,numeric,text,numeric,jsonb,jsonb) from public,anon;
revoke all on function public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,text,numeric,jsonb,jsonb) from public,anon;
revoke all on function public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,text,numeric,jsonb,jsonb) from public,anon;
grant execute on function public.save_petatoe_appointment_details(uuid,numeric,text,numeric,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,text,numeric,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,text,numeric,jsonb,jsonb) to authenticated,service_role;

-- ============================================================
-- C. Multi-visit scheduling: all selected visits are persisted.
-- Same team/day is allowed at different slots; exact same team/day/slot is blocked.
-- ============================================================
create or replace function public.schedule_installation_request_multi_day(
  p_request_id uuid,
  p_visits jsonb,
  p_assignment_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  r public.installation_requests%rowtype;
  v jsonb;
  svc record;
  v_visit_id uuid;
  v_no integer:=0;
  v_date date;
  v_time time;
  v_team uuid;
  v_technician text;
  v_total numeric;
  v_expected numeric;
  v_first_date date;
  v_first_time time;
  v_first_team uuid;
  v_first_technician text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.has_screen_permission('installationSchedule','edit') then raise exception 'ليس لديك صلاحية تعديل جدولة المواعيد'; end if;
  if p_request_id is null then raise exception 'معرّف الموعد مطلوب'; end if;
  if jsonb_typeof(p_visits)<>'array' or jsonb_array_length(p_visits)<1 then raise exception 'أضف موعدًا واحدًا على الأقل للجدولة'; end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then raise exception 'الموعد خارج نطاقك التشغيلي'; end if;

  if exists(
    select 1 from public.installation_execution_visits ev
    join public.installation_execution_visit_services es on es.visit_id=ev.id
    where ev.installation_request_id=p_request_id and coalesce(es.executed_quantity,0)>0
  ) then raise exception 'لا يمكن إعادة توزيع موعد بدأ تنفيذه. استخدم مسار تأكيد الكميات وإعادة الجدولة.'; end if;

  for svc in select id,quantity from public.installation_request_services where installation_request_id=p_request_id loop
    select coalesce(sum((line->>'quantity')::numeric),0) into v_total
    from jsonb_array_elements(p_visits) visit,
         jsonb_array_elements(coalesce(visit->'services','[]'::jsonb)) line
    where nullif(line->>'request_service_id','')::uuid=svc.id;
    v_expected:=coalesce(svc.quantity,0);
    if v_total<>v_expected then
      raise exception 'توزيع كميات الخدمات غير مكتمل. المطلوب % والموزع %',v_expected,v_total;
    end if;
  end loop;

  if exists(
    select 1
    from jsonb_array_elements(p_visits) visit,
         jsonb_array_elements(coalesce(visit->'services','[]'::jsonb)) line
    where coalesce((line->>'quantity')::numeric,0)<0
       or not exists(select 1 from public.installation_request_services rs where rs.id=nullif(line->>'request_service_id','')::uuid and rs.installation_request_id=p_request_id)
  ) then raise exception 'يوجد بند خدمة أو كمية غير صالحة في توزيع المواعيد'; end if;

  -- Replace only planned/not-started visits, preserving confirmed/history rows.
  delete from public.installation_execution_visits
  where installation_request_id=p_request_id and status in ('مجدولة','بانتظار التأكيد','بانتظار الجدولة');

  select coalesce(max(visit_no),0) into v_no
  from public.installation_execution_visits
  where installation_request_id=p_request_id;

  for v in select value from jsonb_array_elements(p_visits) loop
    v_no:=v_no+1;
    v_date:=nullif(v->>'scheduled_date','')::date;
    v_time:=nullif(v->>'scheduled_time','')::time;
    v_team:=nullif(v->>'team_id','')::uuid;
    v_technician:=nullif(trim(v->>'technician_name'),'');
    if v_date is null or v_time is null or v_team is null or v_technician is null then raise exception 'أكمل التاريخ والوقت والفرقة والجرومر لكل موعد'; end if;
    if public.is_installation_schedule_day_locked(v_date) then raise exception 'اليوم % مغلق. افتح اليوم أولًا قبل الجدولة.',v_date; end if;
    if not public.can_access_installation_request_scope(r.representative_id,v_team) then raise exception 'الفرقة المختارة خارج نطاقك التشغيلي'; end if;

    -- Exact team slot conflict with another request is not allowed.
    if exists(
      select 1 from public.installation_execution_visits x
      where x.installation_request_id<>p_request_id and x.scheduled_date=v_date and x.scheduled_time=v_time
        and x.installation_team_id=v_team
        and x.status not in ('ملغاة','مؤكدة')
    ) or exists(
      select 1 from public.installation_requests x
      where x.id<>p_request_id and x.scheduled_date=v_date and x.scheduled_time=v_time
        and x.installation_team_id=v_team
        and coalesce(x.status,'') not in ('ملغي','ملغاة')
    ) then raise exception 'الفرقة محجوزة بالفعل في الموعد % يوم %',v_time,v_date; end if;

    -- Same groomer cannot be double-booked at the exact slot either.
    if exists(
      select 1 from public.installation_execution_visits x
      where x.installation_request_id<>p_request_id and x.scheduled_date=v_date and x.scheduled_time=v_time
        and lower(regexp_replace(trim(coalesce(x.technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(v_technician,'\s+',' ','g'))
        and x.status not in ('ملغاة','مؤكدة')
    ) or exists(
      select 1 from public.installation_requests x
      where x.id<>p_request_id and x.scheduled_date=v_date and x.scheduled_time=v_time
        and lower(regexp_replace(trim(coalesce(x.assigned_technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(v_technician,'\s+',' ','g'))
        and coalesce(x.status,'') not in ('ملغي','ملغاة')
    ) then raise exception 'الجرومر محجوز بالفعل في الموعد % يوم %',v_time,v_date; end if;

    -- Inside the same payload only an exact team/day/slot duplicate is invalid.
    if exists(
      select 1 from jsonb_array_elements(p_visits) other
      where other<>v
        and nullif(other->>'scheduled_date','')::date=v_date
        and nullif(other->>'scheduled_time','')::time=v_time
        and nullif(other->>'team_id','')::uuid=v_team
    ) then raise exception 'لا يمكن حجز نفس الفرقة مرتين في نفس اليوم ونفس الوقت داخل الخطة'; end if;

    insert into public.installation_execution_visits(
      installation_request_id,visit_no,scheduled_date,scheduled_time,
      installation_team_id,technician_name,status
    ) values(
      p_request_id,v_no,v_date,v_time,v_team,v_technician,'مجدولة'
    ) returning id into v_visit_id;

    insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
    select v_visit_id,nullif(line->>'request_service_id','')::uuid,(line->>'quantity')::numeric
    from jsonb_array_elements(coalesce(v->'services','[]'::jsonb)) line
    where coalesce((line->>'quantity')::numeric,0)>0;

    if v_first_date is null then
      v_first_date:=v_date;v_first_time:=v_time;v_first_team:=v_team;v_first_technician:=v_technician;
    end if;
  end loop;

  update public.installation_requests set
    scheduled_date=v_first_date,scheduled_time=v_first_time,time_slot=null,
    installation_team_id=v_first_team,assigned_technician_name=v_first_technician,technician_id=null,
    status='مسند',assignment_notes=nullif(trim(coalesce(p_assignment_notes,'')),''),
    completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null,updated_at=now()
  where id=p_request_id;

  return jsonb_build_object(
    'requestId',p_request_id,
    'visitsCount',jsonb_array_length(p_visits),
    'status','scheduled'
  );
end;
$$;

grant execute on function public.schedule_installation_request_multi_day(uuid,jsonb,text) to authenticated;

commit;

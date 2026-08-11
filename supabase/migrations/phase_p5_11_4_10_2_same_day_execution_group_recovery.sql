-- P5.11.4.10.2 — Same-day same-team execution group recovery
-- One execution workflow per request + team + local scheduled date, while preserving individual scheduling slots.
begin;

create or replace function public.get_installation_execution_group_visit_ids(p_request_id uuid,p_visit_id uuid)
returns uuid[] language sql security definer set search_path=public as $$
  with anchor as (
    select installation_request_id,installation_team_id,scheduled_date
    from public.installation_execution_visits
    where id=p_visit_id and installation_request_id=p_request_id
  )
  select coalesce(array_agg(v.id order by v.visit_no,v.scheduled_time,v.id::text),array[]::uuid[])
  from public.installation_execution_visits v join anchor a on true
  where v.installation_request_id=a.installation_request_id
    and v.installation_team_id is not distinct from a.installation_team_id
    and v.scheduled_date is not distinct from a.scheduled_date
    and v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة');
$$;
grant execute on function public.get_installation_execution_group_visit_ids(uuid,uuid) to authenticated;

create or replace function public.get_current_installation_execution_visit_id()
returns uuid language sql security definer set search_path=public as $$
  select v.id
  from public.installation_execution_visits v
  join public.installation_requests r on r.id=v.installation_request_id
  where v.selected_for_execution_by=auth.uid()
    and v.selected_for_execution_at is not null
    and v.status in ('مجدولة','قيد التنفيذ')
    and public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
    and public.can_access_installation_assignment(v.installation_team_id,v.technician_name)
  order by v.scheduled_date,v.installation_team_id,v.visit_no,v.id::text
  limit 1
$$;

create or replace function public.select_installation_execution_visit(p_request_id uuid,p_visit_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; v_id uuid; ids uuid[];
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية بدء تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  if p_visit_id is null then
    select id into v_id from public.installation_execution_visits where installation_request_id=p_request_id and status in ('مجدولة','قيد التنفيذ') and completed_at is null order by scheduled_date,scheduled_time,visit_no limit 1;
  else v_id:=p_visit_id; end if;
  select * into v from public.installation_execution_visits where id=v_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;
  if v.status not in ('مجدولة','قيد التنفيذ') or v.completed_at is not null then raise exception 'لا يمكن بدء زيارة التنفيذ في حالتها الحالية'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id) or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name) then raise exception 'هذه الزيارة غير مرتبطة بفرقتك والجرومر الخاص بك'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
  if exists(select 1 from public.installation_execution_visits x where x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null and x.status in ('مجدولة','قيد التنفيذ') and not(x.id=any(ids))) then raise exception 'يوجد تنفيذ حالي نشط بالفعل'; end if;
  update public.installation_execution_visits set selected_for_execution_at=coalesce(selected_for_execution_at,now()),selected_for_execution_by=auth.uid(),updated_at=now() where id=any(ids) and status in ('مجدولة','قيد التنفيذ');
  update public.installation_requests set status=case when status in ('بانتظار المراجعة','جديد','مجدول','بانتظار الجدولة') then 'مسند' else status end where id=r.id;
  return (select x.id from public.installation_execution_visits x where x.id=any(ids) order by x.visit_no,x.scheduled_time,x.id::text limit 1);
end;$$;

grant execute on function public.select_installation_execution_visit(uuid,uuid) to authenticated;

create or replace function public.record_installation_visit_map_opened(p_request_id uuid,p_visit_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; ids uuid[];
begin
  select * into r from public.installation_requests where id=p_request_id;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id) or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name) then raise exception 'الزيارة غير مسموحة'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.selected_for_execution_by=auth.uid()) then raise exception 'الزيارة ليست التنفيذ الحالي لهذا المستخدم'; end if;
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.on_route_at is not null) then raise exception 'ابدأ التحرك أولاً'; end if;
  update public.installation_execution_visits set map_opened_at=coalesce(map_opened_at,now()),last_status_changed_at=now(),last_status_changed_by=auth.uid(),updated_at=now() where id=any(ids);
end;$$;
grant execute on function public.record_installation_visit_map_opened(uuid,uuid) to authenticated;

create or replace function public.advance_installation_execution_visit_stage(p_request_id uuid,p_visit_id uuid,p_next_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; a public.installation_execution_visits%rowtype; ids uuid[]; expected text; nextv public.installation_execution_visits%rowtype;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
  select * into a from public.installation_execution_visits where id=any(ids) order by visit_no,scheduled_time limit 1;
  if not public.can_access_installation_request_scope(r.representative_id,a.installation_team_id) or not public.can_access_installation_assignment(a.installation_team_id,a.technician_name) then raise exception 'هذه الزيارة غير مرتبطة بفرقتك والجرومر الخاص بك'; end if;
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null) then raise exception 'هذه الزيارة ليست التنفيذ الحالي لهذا المستخدم'; end if;
  expected:=case when a.on_route_at is null then 'في الطريق' when a.map_opened_at is null then null when a.arrived_at is null then 'وصل إلى العميل' when a.started_at is null then 'قيد التنفيذ' when a.completed_at is null then 'مكتمل' else null end;
  if expected is distinct from p_next_status then raise exception 'يجب تنفيذ مراحل الزيارة بالترتيب'; end if;
  if p_next_status='وصل إلى العميل' and a.map_opened_at is null then raise exception 'افتح موقع العميل قبل تسجيل الوصول'; end if;
  update public.installation_execution_visits set
    on_route_at=case when p_next_status='في الطريق' then coalesce(on_route_at,now()) else on_route_at end,
    arrived_at=case when p_next_status='وصل إلى العميل' then coalesce(arrived_at,now()) else arrived_at end,
    started_at=case when p_next_status='قيد التنفيذ' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_next_status='مكتمل' then coalesce(completed_at,now()) else completed_at end,
    status=case when p_next_status='مكتمل' then 'بانتظار التأكيد' else 'قيد التنفيذ' end,
    selected_for_execution_at=case when p_next_status='مكتمل' then null else selected_for_execution_at end,
    selected_for_execution_by=case when p_next_status='مكتمل' then null else selected_for_execution_by end,
    execution_notes=nullif(trim(coalesce(p_notes,'')),''),last_status_changed_at=now(),last_status_changed_by=auth.uid(),updated_at=now()
  where id=any(ids);
  if p_next_status='مكتمل' then
    select * into nextv from public.installation_execution_visits where installation_request_id=p_request_id and not(id=any(ids)) and status='مجدولة' order by scheduled_date,scheduled_time,visit_no limit 1;
    update public.installation_requests set status=case when nextv.id is not null then 'مسند' else 'قيد التنفيذ' end,scheduled_date=coalesce(nextv.scheduled_date,a.scheduled_date),scheduled_time=coalesce(nextv.scheduled_time,a.scheduled_time),installation_team_id=coalesce(nextv.installation_team_id,a.installation_team_id),assigned_technician_name=coalesce(nextv.technician_name,a.technician_name),completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null where id=r.id;
  end if;
end;$$;
grant execute on function public.advance_installation_execution_visit_stage(uuid,uuid,text,text) to authenticated;

create or replace function public.get_installation_execution_visit_quantity_summary(p_request_id uuid,p_visit_id uuid)
returns table(request_id uuid,request_service_id uuid,service_name text,requested_quantity numeric,scheduled_current_quantity numeric,executed_quantity numeric,remaining_quantity numeric,unit_price numeric,executed_value numeric,remaining_value numeric,current_visit_id uuid,current_visit_no integer)
language sql security definer set search_path=public as $$
  with anchor as (select * from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id),
  grp as (select v.id,v.visit_no from public.installation_execution_visits v,anchor a where v.installation_request_id=a.installation_request_id and v.installation_team_id is not distinct from a.installation_team_id and v.scheduled_date is not distinct from a.scheduled_date),
  scheduled as (select vs.request_service_id,sum(coalesce(vs.scheduled_quantity,0)) q from public.installation_execution_visit_services vs join grp g on g.id=vs.visit_id group by vs.request_service_id),
  confirmed as (select vs.request_service_id,sum(coalesce(vs.executed_quantity,0)) q from public.installation_execution_visit_services vs join public.installation_execution_visits v on v.id=vs.visit_id where v.installation_request_id=p_request_id and v.status='مؤكدة' and not(v.id in(select id from grp)) group by vs.request_service_id),
  canon as (select id,visit_no from grp order by visit_no,id::text limit 1)
  select s.installation_request_id,s.id,coalesce(st.name,'خدمة'),s.quantity,coalesce(sc.q,0),coalesce(c.q,0),greatest(s.quantity-coalesce(c.q,0),0),s.unit_price,coalesce(c.q,0)*s.unit_price,greatest(s.quantity-coalesce(c.q,0),0)*s.unit_price,cn.id,cn.visit_no
  from public.installation_request_services s cross join canon cn left join scheduled sc on sc.request_service_id=s.id left join confirmed c on c.request_service_id=s.id left join public.installation_service_types st on st.id=s.service_type_id
  where s.installation_request_id=p_request_id and (coalesce(sc.q,0)>0 or coalesce(c.q,0)>0);
$$;
grant execute on function public.get_installation_execution_visit_quantity_summary(uuid,uuid) to authenticated;

create or replace function public.confirm_installation_execution_visit_quantities(p_request_id uuid,p_visit_id uuid,p_lines jsonb,p_remaining_action text,p_schedule jsonb default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; ids uuid[]; line jsonb; sid uuid; executed numeric; already numeric; requested numeric; sched numeric; total_remaining numeric:=0; remaining numeric; rec record; left_to_allocate numeric; nextv public.installation_execution_visits%rowtype;
begin
  if not public.has_screen_permission('installationCompletion','edit') then raise exception 'لا توجد صلاحية تأكيد تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update; if not found then raise exception 'الموعد غير موجود'; end if;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update; if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.status='بانتظار التأكيد') then raise exception 'زيارة التنفيذ ليست بانتظار التأكيد'; end if;
  for line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    sid:=nullif(line->>'requestServiceId','')::uuid; executed:=greatest(coalesce((line->>'executedQuantity')::numeric,0),0);
    select quantity into requested from public.installation_request_services where id=sid and installation_request_id=p_request_id; if not found then raise exception 'خدمة غير صالحة داخل الموعد'; end if;
    select coalesce(sum(vs.scheduled_quantity),0) into sched from public.installation_execution_visit_services vs where vs.visit_id=any(ids) and vs.request_service_id=sid;
    if sched<=0 then raise exception 'الخدمة ليست ضمن زيارة التنفيذ الحالية'; end if;
    select coalesce(sum(vs.executed_quantity),0) into already from public.installation_execution_visit_services vs join public.installation_execution_visits x on x.id=vs.visit_id where x.installation_request_id=p_request_id and x.status='مؤكدة' and not(x.id=any(ids)) and vs.request_service_id=sid;
    if already+executed>requested then raise exception 'الكمية المنفذة تتجاوز المتبقي من الخدمة'; end if;
    left_to_allocate:=executed;
    for rec in select vs.visit_id,vs.scheduled_quantity from public.installation_execution_visit_services vs join public.installation_execution_visits x on x.id=vs.visit_id where vs.visit_id=any(ids) and vs.request_service_id=sid order by x.visit_no,x.scheduled_time,x.id::text loop
      update public.installation_execution_visit_services set executed_quantity=least(left_to_allocate,coalesce(rec.scheduled_quantity,0)),updated_at=now() where visit_id=rec.visit_id and request_service_id=sid;
      left_to_allocate:=greatest(left_to_allocate-coalesce(rec.scheduled_quantity,0),0);
    end loop;
    if left_to_allocate>0 then raise exception 'الكمية المنفذة تتجاوز الكمية المجدولة لهذه الزيارة'; end if;
    remaining:=greatest(requested-(already+executed),0); total_remaining:=total_remaining+remaining;
    insert into public.installation_execution_quantity_audit(installation_request_id,visit_id,request_service_id,scheduled_quantity,confirmed_quantity,remaining_quantity,action,notes)
    values(p_request_id,(select x.id from public.installation_execution_visits x where x.id=any(ids) order by x.visit_no limit 1),sid,sched,executed,remaining,case when remaining=0 then 'completed' else coalesce(p_remaining_action,'return_to_schedule') end,nullif(trim(coalesce(p_notes,'')),''));
  end loop;
  update public.installation_execution_visits set status='مؤكدة',confirmed_at=now(),confirmed_by=auth.uid(),confirmation_notes=nullif(trim(coalesce(p_notes,'')),''),selected_for_execution_at=null,selected_for_execution_by=null,updated_at=now() where id=any(ids);
  select * into nextv from public.installation_execution_visits where installation_request_id=p_request_id and not(id=any(ids)) and status='مجدولة' order by scheduled_date,scheduled_time,visit_no limit 1;
  if total_remaining=0 and nextv.id is null then update public.installation_requests set status='مكتمل',completed_at=coalesce(completed_at,now()),selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id;
  elsif nextv.id is not null then update public.installation_requests set status='مسند',scheduled_date=nextv.scheduled_date,scheduled_time=nextv.scheduled_time,installation_team_id=nextv.installation_team_id,assigned_technician_name=nextv.technician_name,completed_at=null where id=p_request_id;
  else update public.installation_requests set status='بانتظار الجدولة',scheduled_date=null,scheduled_time=null,installation_team_id=null,assigned_technician_name=null,completed_at=null where id=p_request_id; end if;
  return jsonb_build_object('status',case when total_remaining=0 and nextv.id is null then 'completed' when nextv.id is not null then 'existing_next_visit' else 'pending_schedule' end,'remainingQuantity',total_remaining,'groupVisits',cardinality(ids));
end;$$;
grant execute on function public.confirm_installation_execution_visit_quantities(uuid,uuid,jsonb,text,jsonb,text) to authenticated;

-- One invoice covers the whole same-day execution group.
create or replace function public.create_sales_invoice_from_installation_visit(p_installation_request_id uuid,p_visit_id uuid,p_invoice_number text,p_invoice_date date)
returns public.sales_invoices language plpgsql security definer set search_path=public as $$ 
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; ids uuid[]; existing public.sales_invoices%rowtype; created public.sales_invoices%rowtype; amount numeric(14,2):=0; cost numeric(14,2):=0; canon uuid;
begin
  if not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  if coalesce(p_invoice_number,'') !~ '^[0-9]{9}$' then raise exception 'رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  select * into r from public.installation_requests where id=p_installation_request_id; if not found then raise exception 'الموعد غير موجود'; end if;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_installation_request_id; if not found then raise exception 'زيارة التنفيذ غير موجودة'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_installation_request_id,v.id); select x.id into canon from public.installation_execution_visits x where x.id=any(ids) order by x.visit_no,x.id::text limit 1;
  if exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.status<>'مؤكدة') then raise exception 'لا يمكن تحويل الزيارة إلى فاتورة قبل تأكيد الكمية المنفذة'; end if;
  select * into existing from public.sales_invoices where installation_execution_visit_id=any(ids) and status<>'ملغاة' limit 1; if found then return existing; end if;
  select coalesce(sum(coalesce(vs.executed_quantity,0)*coalesce(rs.unit_price,0)),0)::numeric(14,2),coalesce(sum(coalesce(vs.executed_quantity,0)*coalesce(st.default_cost,0)),0)::numeric(14,2) into amount,cost from public.installation_execution_visit_services vs join public.installation_request_services rs on rs.id=vs.request_service_id left join public.installation_service_types st on st.id=rs.service_type_id where vs.visit_id=any(ids);
  if amount<=0 then raise exception 'لا توجد كمية منفذة بقيمة قابلة للفوترة في هذه الزيارة'; end if;
  insert into public.sales_invoices(invoice_number,request_number,customer_id,representative_id,quotation_id,installation_request_id,installation_execution_visit_id,completion_report_id,invoice_amount,installation_expenses,invoice_date,source_type,status)
  values(p_invoice_number,r.request_number||'-'||lpad(v.visit_no::text,2,'0'),r.customer_id,r.representative_id,null,r.id,canon,null,amount,cost,p_invoice_date,'installation','صادرة') returning * into created; return created;
end;$$;
grant execute on function public.create_sales_invoice_from_installation_visit(uuid,uuid,text,date) to authenticated;

commit;
notify pgrst,'reload schema';

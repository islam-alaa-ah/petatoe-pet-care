-- P5.13.8.28 — Collection money-scope recovery
-- Aligns collection validation with the same two-decimal, execution-group financial amount shown in the UI.
-- Prevents false "amount exceeds remaining" errors when the entered amount equals the displayed amount.

begin;

create or replace function public.complete_installation_collection_stage(
  p_request_id uuid,
  p_visit_id uuid default null,
  p_amount_received numeric default 0,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  a public.installation_execution_visits%rowtype;
  ids uuid[];
  existing_amount numeric:=0;
  request_final numeric:=0;
  request_remaining numeric:=0;
  group_due numeric:=0;
  remaining_amount numeric:=0;
  received numeric:=round(greatest(coalesce(p_amount_received,0),0),2);
  method text:=nullif(trim(coalesce(p_payment_method,'')),'');
  stamp timestamptz:=now();
begin
  if not public.has_screen_permission('installationExecution','edit') then
    raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد';
  end if;

  select * into r
  from public.installation_requests
  where id=p_request_id
  for update;
  if not found then raise exception 'الموعد غير موجود'; end if;

  request_final:=round(greatest(coalesce(r.final_amount,0),0),2);

  select round(coalesce(amount_collected,0),2)
    into existing_amount
  from public.installation_request_collection
  where installation_request_id=p_request_id
  for update;
  if not found then existing_amount:=0; end if;

  request_remaining:=greatest(round(request_final-existing_amount,2),0);

  if p_visit_id is not null then
    select * into v
    from public.installation_execution_visits
    where id=p_visit_id and installation_request_id=p_request_id
    for update;
    if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;

    ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
    select * into a
    from public.installation_execution_visits
    where id=any(ids)
    order by visit_no,scheduled_time,id::text
    limit 1;

    -- Mirror the canonical JS execution-group financial allocation:
    -- same request + team + local date, live/confirmed visits only, normalized
    -- against request subtotal unless historical over-allocation exists.
    with financial_groups as (
      select
        ev.installation_team_id as team_id,
        ev.scheduled_date as group_date,
        coalesce(sum(greatest(coalesce(vs.scheduled_quantity,0),0) * greatest(coalesce(rs.unit_price,0),0)),0)::numeric as subtotal
      from public.installation_execution_visits ev
      join public.installation_execution_visit_services vs on vs.visit_id=ev.id
      join public.installation_request_services rs on rs.id=vs.request_service_id and rs.installation_request_id=ev.installation_request_id
      where ev.installation_request_id=p_request_id
        and ev.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة')
      group by ev.installation_team_id,ev.scheduled_date
    ), totals as (
      select
        coalesce(sum(subtotal),0)::numeric as allocated_subtotal,
        greatest(coalesce(r.total_services_amount,0),0)::numeric as request_subtotal
      from financial_groups
    ), ranked as (
      select
        fg.*,
        case
          when t.allocated_subtotal > t.request_subtotal + 0.01 then t.allocated_subtotal
          else t.request_subtotal
        end as allocation_base,
        (abs(t.allocated_subtotal-t.request_subtotal) <= 0.01) as fully_allocated,
        (t.allocated_subtotal > t.request_subtotal + 0.01) as over_allocated,
        row_number() over(order by fg.group_date,coalesce(fg.team_id::text,'')) as rn,
        count(*) over() as cnt
      from financial_groups fg cross join totals t
    ), prelim as (
      select
        ranked.*,
        case when allocation_base>0 then round(request_final * subtotal / allocation_base,2) else 0 end as preliminary_due
      from ranked
    ), allocated as (
      select
        prelim.*,
        coalesce(sum(preliminary_due) over(order by group_date,coalesce(team_id::text,'') rows between unbounded preceding and 1 preceding),0) as prior_due
      from prelim
    )
    select coalesce(
      max(case
        when team_id is not distinct from v.installation_team_id and group_date is not distinct from v.scheduled_date then
          case
            when (fully_allocated or over_allocated) and rn=cnt then greatest(round(request_final-prior_due,2),0)
            else greatest(preliminary_due,0)
          end
      end),0)
    into group_due
    from allocated;

    -- If there is no service allocation for a legacy visit, fall back to request remaining.
    if group_due<=0 then group_due:=request_remaining; end if;
    group_due:=round(group_due,2);
    remaining_amount:=group_due;

    -- Exact two-decimal comparison. Also protect the request-level cumulative total,
    -- allowing one halala only for allocation rounding at group boundaries.
    if received>remaining_amount then
      raise exception 'المبلغ المستلم يتجاوز المبلغ المتبقي للتحصيل';
    end if;
    if existing_amount+received>request_final+0.01 then
      raise exception 'المبلغ المستلم يتجاوز المبلغ المتبقي للتحصيل';
    end if;

    -- Super admin is unrestricted. Other users must have access to the active team/assignment.
    if public.current_user_role() <> 'super_admin'::public.app_role and
       (not public.can_access_installation_request_scope(r.representative_id,a.installation_team_id)
        or not public.can_access_installation_assignment(a.installation_team_id,a.technician_name)) then
      raise exception 'هذه الزيارة غير مرتبطة بفرقتك والجرومر الخاص بك';
    end if;

    if not exists(
      select 1
      from public.installation_execution_visits x
      where x.id=any(ids)
        and x.selected_for_execution_at is not null
        and x.completed_at is null
    ) then
      raise exception 'هذه الزيارة ليست قيد التنفيذ';
    end if;

    if a.started_at is null then raise exception 'ابدأ الموعد قبل مرحلة التحصيل'; end if;
    if a.collection_at is not null then raise exception 'تم تأكيد مرحلة التحصيل مسبقًا'; end if;
    if a.completed_at is not null then raise exception 'لا يمكن تعديل التحصيل بعد انتهاء الموعد'; end if;

    update public.installation_execution_visits
      set collection_at=coalesce(collection_at,stamp),
          last_status_changed_at=stamp,
          last_status_changed_by=auth.uid(),
          updated_at=stamp
    where id=any(ids);
  else
    remaining_amount:=request_remaining;
    if received>remaining_amount then
      raise exception 'المبلغ المستلم يتجاوز المبلغ المتبقي للتحصيل';
    end if;

    if public.current_user_role() <> 'super_admin'::public.app_role and
       (not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
        or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)) then
      raise exception 'هذا الموعد غير مرتبط بفرقتك والجرومر الخاص بك';
    end if;

    if r.selected_for_execution_at is null or r.completed_at is not null then
      raise exception 'هذا الموعد ليس قيد التنفيذ';
    end if;
    if r.started_at is null then raise exception 'ابدأ الموعد قبل مرحلة التحصيل'; end if;
    if r.collection_at is not null then raise exception 'تم تأكيد مرحلة التحصيل مسبقًا'; end if;
  end if;

  if remaining_amount>0 and received<=0 then
    raise exception 'يجب تسجيل مبلغ التحصيل قبل إنهاء الموعد';
  end if;
  if received>0 and method is null then
    raise exception 'طريقة التحصيل مطلوبة';
  end if;

  insert into public.installation_request_collection(
    installation_request_id,session_value,total_discount,amount_collected,
    collection_status,payment_method,appointment_status,collection_reference,
    collection_notes,collected_at,collected_by,updated_at
  ) values (
    p_request_id,request_final,coalesce(r.discount_amount,0),round(existing_amount+received,2),
    case when round(existing_amount+received,2)>=request_final-0.01 then 'محصل بالكامل' else 'محصل جزئيًا' end,
    coalesce(method,(select payment_method from public.installation_request_collection where installation_request_id=p_request_id)),
    'قيد التنفيذ',nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),stamp,auth.uid(),stamp
  )
  on conflict (installation_request_id) do update set
    amount_collected=excluded.amount_collected,
    collection_status=excluded.collection_status,
    payment_method=coalesce(excluded.payment_method,public.installation_request_collection.payment_method),
    appointment_status='قيد التنفيذ',
    collection_reference=excluded.collection_reference,
    collection_notes=excluded.collection_notes,
    collected_at=excluded.collected_at,
    collected_by=excluded.collected_by,
    updated_at=excluded.updated_at;

  update public.installation_requests
    set collection_at=coalesce(collection_at,stamp)
  where id=p_request_id;
end;
$$;

grant execute on function public.complete_installation_collection_stage(uuid,uuid,numeric,text,text,text) to authenticated;

commit;
notify pgrst,'reload schema';

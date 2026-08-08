
begin;

-- Phase M14.9.8.14
-- Actual execution confirmation and dynamic re-scheduling.

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid='public.installation_requests'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.installation_requests drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.installation_requests
  add constraint installation_requests_status_check
  check(status in (
    'بانتظار المراجعة','جديد','بانتظار الجدولة','مجدول','مسند',
    'في الطريق','وصل إلى العميل','قيد التنفيذ','مكتمل',
    'مؤجل','متعذر','ملغي'
  ));

create table if not exists public.installation_execution_visits (
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  visit_no integer not null check(visit_no > 0),
  scheduled_date date,
  scheduled_time time,
  installation_team_id uuid references public.installation_teams(id) on delete set null,
  technician_name text,
  status text not null default 'مجدولة'
    check(status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة','ملغاة')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(installation_request_id,visit_no)
);

create table if not exists public.installation_execution_visit_services (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.installation_execution_visits(id) on delete cascade,
  request_service_id uuid not null references public.installation_request_services(id) on delete cascade,
  scheduled_quantity numeric(14,3) not null default 0 check(scheduled_quantity >= 0),
  executed_quantity numeric(14,3) check(executed_quantity is null or executed_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(visit_id,request_service_id)
);

create table if not exists public.installation_execution_quantity_audit (
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  visit_id uuid references public.installation_execution_visits(id) on delete set null,
  request_service_id uuid not null references public.installation_request_services(id) on delete cascade,
  scheduled_quantity numeric(14,3) not null,
  confirmed_quantity numeric(14,3) not null,
  remaining_quantity numeric(14,3) not null,
  action text not null check(action in ('completed','reschedule_now','schedule_later')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.installation_execution_visits enable row level security;
alter table public.installation_execution_visit_services enable row level security;
alter table public.installation_execution_quantity_audit enable row level security;

drop policy if exists "installation visits scoped read" on public.installation_execution_visits;
create policy "installation visits scoped read" on public.installation_execution_visits
for select to authenticated using (
  exists (
    select 1 from public.installation_requests r
    where r.id=installation_request_id
      and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
  )
  or public.has_screen_permission('installationSchedule','view')
);

drop policy if exists "installation visit services scoped read" on public.installation_execution_visit_services;
create policy "installation visit services scoped read" on public.installation_execution_visit_services
for select to authenticated using (
  exists (
    select 1
    from public.installation_execution_visits v
    join public.installation_requests r on r.id=v.installation_request_id
    where v.id=visit_id
      and (
        public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
        or public.has_screen_permission('installationSchedule','view')
      )
  )
);

drop policy if exists "installation quantity audit scoped read" on public.installation_execution_quantity_audit;
create policy "installation quantity audit scoped read" on public.installation_execution_quantity_audit
for select to authenticated using (
  exists (
    select 1 from public.installation_requests r
    where r.id=installation_request_id
      and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
  )
);

-- The application writes through SECURITY DEFINER RPCs only.
revoke insert,update,delete on public.installation_execution_visits from authenticated;
revoke insert,update,delete on public.installation_execution_visit_services from authenticated;
revoke insert,update,delete on public.installation_execution_quantity_audit from authenticated;
grant select on public.installation_execution_visits,public.installation_execution_visit_services,public.installation_execution_quantity_audit to authenticated;

create or replace function public.ensure_installation_execution_visit(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v_id uuid;
  v_no integer;
begin
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;

  select id into v_id
  from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
  order by visit_no desc
  limit 1;

  if v_id is null then
    select coalesce(max(visit_no),0)+1 into v_no
    from public.installation_execution_visits
    where installation_request_id=p_request_id;

    insert into public.installation_execution_visits(
      installation_request_id,visit_no,scheduled_date,scheduled_time,
      installation_team_id,technician_name,status
    )
    values(
      p_request_id,v_no,r.scheduled_date,r.scheduled_time,
      r.installation_team_id,r.assigned_technician_name,
      case when r.status='مكتمل' then 'بانتظار التأكيد' else 'مجدولة' end
    )
    returning id into v_id;

    insert into public.installation_execution_visit_services(
      visit_id,request_service_id,scheduled_quantity
    )
    select
      v_id,s.id,
      greatest(
        s.quantity-coalesce((
          select sum(coalesce(vs.executed_quantity,0))
          from public.installation_execution_visit_services vs
          join public.installation_execution_visits vv on vv.id=vs.visit_id
          where vv.installation_request_id=p_request_id
            and vv.status='مؤكدة'
            and vs.request_service_id=s.id
        ),0),0
      )
    from public.installation_request_services s
    where s.installation_request_id=p_request_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.get_installation_execution_quantity_summary(
  p_request_id uuid default null
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
  with accessible as (
    select r.id
    from public.installation_requests r
    where (p_request_id is null or r.id=p_request_id)
      and (
        public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
        or public.has_screen_permission('installationSchedule','view')
        or public.has_screen_permission('installationCompletion','view')
      )
  ),
  confirmed as (
    select v.installation_request_id,vs.request_service_id,
           sum(coalesce(vs.executed_quantity,0)) executed_quantity
    from public.installation_execution_visits v
    join public.installation_execution_visit_services vs on vs.visit_id=v.id
    where v.status='مؤكدة'
    group by v.installation_request_id,vs.request_service_id
  ),
  current_visit as (
    select distinct on (v.installation_request_id)
      v.installation_request_id,v.id,v.visit_no
    from public.installation_execution_visits v
    where v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
    order by v.installation_request_id,v.visit_no desc
  )
  select
    s.installation_request_id,
    s.id,
    t.name,
    s.quantity::numeric,
    coalesce(cvs.scheduled_quantity, greatest(s.quantity-coalesce(c.executed_quantity,0),0))::numeric,
    coalesce(c.executed_quantity,0)::numeric,
    greatest(s.quantity-coalesce(c.executed_quantity,0),0)::numeric,
    s.unit_price,
    (coalesce(c.executed_quantity,0)*s.unit_price)::numeric,
    (greatest(s.quantity-coalesce(c.executed_quantity,0),0)*s.unit_price)::numeric,
    cv.id,
    cv.visit_no
  from public.installation_request_services s
  join accessible a on a.id=s.installation_request_id
  join public.installation_service_types t on t.id=s.service_type_id
  left join confirmed c on c.installation_request_id=s.installation_request_id and c.request_service_id=s.id
  left join current_visit cv on cv.installation_request_id=s.installation_request_id
  left join public.installation_execution_visit_services cvs on cvs.visit_id=cv.id and cvs.request_service_id=s.id;
$$;

create or replace function public.schedule_installation_request_visit(
  p_request_id uuid,
  p_scheduled_date date,
  p_scheduled_time time,
  p_team_id uuid,
  p_technician_name text,
  p_assignment_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v_id uuid;
  v_no integer;
begin
  if not public.has_screen_permission('installationSchedule','edit') then
    raise exception 'لا توجد صلاحية جدولة وإسناد طلبات التركيبات';
  end if;
  if p_scheduled_date is null or p_scheduled_time is null or p_team_id is null or nullif(trim(p_technician_name),'') is null then
    raise exception 'بيانات الجدولة والفرقة والفني مطلوبة';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,p_team_id) then
    raise exception 'الطلب أو الفرقة خارج نطاقك التشغيلي';
  end if;

  select id into v_id
  from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
  order by visit_no desc limit 1;

  if v_id is null then
    select coalesce(max(visit_no),0)+1 into v_no
    from public.installation_execution_visits
    where installation_request_id=p_request_id;

    insert into public.installation_execution_visits(
      installation_request_id,visit_no,scheduled_date,scheduled_time,
      installation_team_id,technician_name,status
    ) values(
      p_request_id,v_no,p_scheduled_date,p_scheduled_time,p_team_id,trim(p_technician_name),'مجدولة'
    ) returning id into v_id;

    insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
    select v_id,x.request_service_id,x.remaining_quantity
    from public.get_installation_execution_quantity_summary(p_request_id) x
    where x.remaining_quantity > 0;
  else
    update public.installation_execution_visits
    set scheduled_date=p_scheduled_date,
        scheduled_time=p_scheduled_time,
        installation_team_id=p_team_id,
        technician_name=trim(p_technician_name),
        status='مجدولة',
        updated_at=now()
    where id=v_id;
  end if;

  update public.installation_requests
  set scheduled_date=p_scheduled_date,
      scheduled_time=p_scheduled_time,
      time_slot=null,
      installation_team_id=p_team_id,
      assigned_technician_name=trim(p_technician_name),
      technician_id=null,
      status='مسند',
      assignment_notes=nullif(trim(coalesce(p_assignment_notes,'')),''),
      completed_at=null,
      selected_for_execution_at=null,
      selected_for_execution_by=null
  where id=p_request_id;

  return v_id;
end;
$$;

create or replace function public.confirm_installation_actual_quantities(
  p_request_id uuid,
  p_lines jsonb,
  p_remaining_action text,
  p_schedule jsonb default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v_id uuid;
  v_no integer;
  line jsonb;
  service_row public.installation_request_services%rowtype;
  executed numeric;
  already_executed numeric;
  remaining_after numeric;
  total_remaining numeric:=0;
  next_date date;
  next_time time;
  next_team uuid;
  next_technician text;
begin
  if not public.has_screen_permission('installationCompletion','edit') then
    raise exception 'لا توجد صلاحية تأكيد تنفيذ التركيبات';
  end if;
  if p_remaining_action not in ('reschedule_now','schedule_later','completed') then
    raise exception 'إجراء المتبقي غير صحيح';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then
    raise exception 'الطلب خارج نطاقك';
  end if;

  v_id:=public.ensure_installation_execution_visit(p_request_id);
  select visit_no into v_no from public.installation_execution_visits where id=v_id for update;

  for line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
  loop
    select * into service_row
    from public.installation_request_services
    where id=(line->>'requestServiceId')::uuid
      and installation_request_id=p_request_id
    for update;
    if not found then raise exception 'خدمة غير صالحة داخل الطلب'; end if;

    executed:=coalesce((line->>'executedQuantity')::numeric,0);
    if executed < 0 then raise exception 'الكمية المنفذة لا يمكن أن تكون سالبة'; end if;

    select coalesce(sum(coalesce(vs.executed_quantity,0)),0) into already_executed
    from public.installation_execution_visit_services vs
    join public.installation_execution_visits vv on vv.id=vs.visit_id
    where vv.installation_request_id=p_request_id
      and vv.status='مؤكدة'
      and vs.request_service_id=service_row.id;

    if already_executed+executed > service_row.quantity then
      raise exception 'إجمالي الكمية المنفذة يتجاوز كمية الطلب للخدمة %',service_row.id;
    end if;

    insert into public.installation_execution_visit_services(
      visit_id,request_service_id,scheduled_quantity,executed_quantity
    )
    values(
      v_id,service_row.id,
      coalesce((line->>'scheduledQuantity')::numeric,0),
      executed
    )
    on conflict(visit_id,request_service_id)
    do update set
      scheduled_quantity=excluded.scheduled_quantity,
      executed_quantity=excluded.executed_quantity,
      updated_at=now();

    remaining_after:=greatest(service_row.quantity-(already_executed+executed),0);
    total_remaining:=total_remaining+remaining_after;

    insert into public.installation_execution_quantity_audit(
      installation_request_id,visit_id,request_service_id,
      scheduled_quantity,confirmed_quantity,remaining_quantity,action,notes
    ) values(
      p_request_id,v_id,service_row.id,
      coalesce((line->>'scheduledQuantity')::numeric,0),
      executed,remaining_after,
      case when remaining_after=0 then 'completed' else p_remaining_action end,
      nullif(trim(coalesce(p_notes,'')),'')
    );
  end loop;

  update public.installation_execution_visits
  set status='مؤكدة',
      confirmed_at=now(),
      confirmed_by=auth.uid(),
      confirmation_notes=nullif(trim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=v_id;

  if total_remaining=0 then
    update public.installation_requests
    set status='مكتمل',
        completed_at=coalesce(completed_at,now()),
        selected_for_execution_at=null,
        selected_for_execution_by=null
    where id=p_request_id;

    return jsonb_build_object('status','completed','remainingQuantity',0,'visitNo',v_no);
  end if;

  if p_remaining_action='reschedule_now' then
    next_date:=(p_schedule->>'scheduledDate')::date;
    next_time:=(p_schedule->>'scheduledTime')::time;
    next_team:=(p_schedule->>'teamId')::uuid;
    next_technician:=nullif(trim(p_schedule->>'technicianName'),'');
    if next_date is null or next_time is null or next_team is null or next_technician is null then
      raise exception 'بيانات إعادة الجدولة مطلوبة';
    end if;
    perform public.schedule_installation_request_visit(
      p_request_id,next_date,next_time,next_team,next_technician,
      coalesce(p_schedule->>'assignmentNotes','استكمال الكمية المتبقية')
    );
    return jsonb_build_object('status','rescheduled','remainingQuantity',total_remaining,'visitNo',v_no);
  end if;

  update public.installation_requests
  set status='بانتظار الجدولة',
      scheduled_date=null,
      scheduled_time=null,
      time_slot=null,
      installation_team_id=null,
      assigned_technician_name=null,
      technician_id=null,
      completed_at=null,
      selected_for_execution_at=null,
      selected_for_execution_by=null,
      assignment_notes='متبقي تنفيذ بعد الزيارة رقم '||v_no
  where id=p_request_id;

  return jsonb_build_object('status','pending_schedule','remainingQuantity',total_remaining,'visitNo',v_no);
end;
$$;

grant execute on function public.ensure_installation_execution_visit(uuid) to authenticated;
grant execute on function public.get_installation_execution_quantity_summary(uuid) to authenticated;
grant execute on function public.schedule_installation_request_visit(uuid,date,time,uuid,text,text) to authenticated;
grant execute on function public.confirm_installation_actual_quantities(uuid,jsonb,text,jsonb,text) to authenticated;

commit;

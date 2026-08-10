-- PETATOE P5.11.4 — Appointment Save + Scheduling Handoff Recovery
-- Idempotent recovery for the complete path:
-- Add Appointment -> Save -> Scheduling -> Assignment -> Execution.
--
-- Main live failure fixed here:
-- installation_requests.customer_map_url is missing in production.
--
-- Additional recovery:
-- * ensure every PETATOE appointment column/table used by save exists;
-- * ensure financial trigger exists;
-- * ensure unassigned/no-representative appointments are operable in scheduling;
-- * ensure canonical scheduling slots: 12:00 / 14:00 / 16:00 / 18:00 / 20:00 / 22:00;
-- * preserve Groomer/Driver team-only scope.

begin;

-- ============================================================
-- A. Required appointment schema contract
-- ============================================================
alter table public.installation_requests
  add column if not exists customer_map_url text,
  add column if not exists customer_order_number text,
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists tax_rate numeric(5,2) not null default 15,
  add column if not exists tax_amount numeric(14,2) not null default 0,
  add column if not exists final_amount numeric(14,2) not null default 0;

alter table public.customers
  add column if not exists google_maps_url text,
  add column if not exists neighborhood_id uuid references public.installation_neighborhoods(id) on delete set null;

alter table public.installation_requests
  drop constraint if exists installation_requests_customer_map_url_check;

alter table public.installation_requests
  add constraint installation_requests_customer_map_url_check
  check (
    customer_map_url is null
    or customer_map_url ~* '^https://(maps\.app\.goo\.gl/|maps\.google\.com/|((www\.)?google\.com)/maps/|goo\.gl/maps/)'
  );

-- ============================================================
-- B. PETATOE financial columns / trigger
-- ============================================================
create or replace function public.recalculate_installation_request_financials()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_subtotal numeric(14,2);
  v_discount numeric(14,2);
  v_taxable numeric(14,2);
begin
  v_subtotal := greatest(coalesce(new.total_services_amount,0),0);
  v_discount := least(greatest(coalesce(new.discount_amount,0),0),v_subtotal);
  v_taxable := greatest(v_subtotal-v_discount,0);

  new.discount_amount := v_discount;
  new.tax_rate := coalesce(new.tax_rate,15);
  new.tax_amount := round(v_taxable*new.tax_rate/100.0,2);
  new.final_amount := round(v_taxable+new.tax_amount,2);
  return new;
end;
$$;

drop trigger if exists trg_installation_request_financials on public.installation_requests;
create trigger trg_installation_request_financials
before insert or update of total_services_amount,discount_amount,tax_rate
on public.installation_requests
for each row
execute function public.recalculate_installation_request_financials();

-- ============================================================
-- C. Animal + collection storage used by create/update wrappers
-- ============================================================
create table if not exists public.installation_request_animals (
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  pet_name text not null default '',
  pet_type text not null default '',
  breed text,
  pet_size text,
  quantity integer not null default 1 check(quantity > 0),
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_installation_request_animals_request
  on public.installation_request_animals(installation_request_id,display_order,id);

create table if not exists public.installation_request_collection (
  installation_request_id uuid primary key references public.installation_requests(id) on delete cascade,
  session_value numeric(14,2) not null default 0 check(session_value >= 0),
  total_discount numeric(14,2) not null default 0 check(total_discount >= 0),
  amount_collected numeric(14,2) not null default 0 check(amount_collected >= 0),
  collection_status text not null default 'غير محصل',
  payment_method text,
  appointment_status text not null default 'بانتظار المراجعة',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- D. Global scheduling list:
-- use canonical REQUEST scope, not representative-only scope.
-- This is critical for customers with representative_id = NULL.
-- ============================================================
create or replace function public.get_installation_schedule_global()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not public.has_screen_permission('installationSchedule','view') then
    raise exception 'Missing installation schedule view permission' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      item
      order by item->>'scheduled_date' nulls last,
               item->>'scheduled_time' nulls last,
               item->>'request_number'
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select jsonb_build_object(
      'id',r.id,
      'request_number',r.request_number,
      'customer_order_number',coalesce(r.customer_order_number,''),
      'customer_name',case when scope.can_operate then coalesce(c.customer_name,'') else '' end,
      'customer_phone',case when scope.can_operate then coalesce(c.phone,'') else '' end,
      'customer_masked',not scope.can_operate,
      'representative_id',r.representative_id,
      'representative_name',coalesce(rep.full_name,''),
      'scheduled_date',r.scheduled_date,
      'scheduled_time',r.scheduled_time,
      'time_slot',coalesce(r.time_slot,''),
      'status',coalesce(r.status,'بانتظار المراجعة'),
      'priority',coalesce(r.priority,'عادية'),
      'technician_id',r.technician_id,
      'technician_name',coalesce(r.assigned_technician_name,tech.full_name,''),
      'technician_status',coalesce(tech.status,''),
      'team_id',r.installation_team_id,
      'team_name',coalesce(team.name,''),
      'installation_address',coalesce(r.installation_address,''),
      'total_services_count',coalesce(r.total_services_count,0),
      'total_services_amount',coalesce(r.total_services_amount,0),
      'assignment_notes',coalesce(r.assignment_notes,''),
      'can_operate',scope.can_operate,
      'services',coalesce(s.services,'[]'::jsonb)
    ) item
    from public.installation_requests r
    cross join lateral (
      select public.can_access_installation_request_scope(
        r.representative_id,
        r.installation_team_id
      ) as can_operate
    ) scope
    left join public.customers c on c.id=r.customer_id
    left join public.sales_representatives rep on rep.id=r.representative_id
    left join public.installation_technicians tech on tech.id=r.technician_id
    left join public.installation_teams team on team.id=r.installation_team_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id',rs.id,
          'name',coalesce(st.name,'خدمة'),
          'quantity',coalesce(rs.quantity,0),
          'unit_price',coalesce(rs.unit_price,0),
          'line_total',coalesce(rs.line_total,0)
        )
        order by rs.id
      ) services
      from public.installation_request_services rs
      left join public.installation_service_types st on st.id=rs.service_type_id
      where rs.installation_request_id=r.id
    ) s on true
    where coalesce(r.status,'') not in ('ملغي','مكتمل')
  ) q;

  return v_result;
end;
$$;

revoke all on function public.get_installation_schedule_global() from public,anon;
grant execute on function public.get_installation_schedule_global() to authenticated,service_role;

-- ============================================================
-- E. Canonical scheduling / assignment RPC
-- ============================================================
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
  active_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not public.has_screen_permission('installationSchedule','edit') then
    raise exception 'لا توجد صلاحية جدولة وإسناد المواعيد' using errcode='42501';
  end if;

  if p_scheduled_date is null or p_scheduled_time is null or p_team_id is null then
    raise exception 'تاريخ ووقت وفرقة الموعد مطلوبة' using errcode='23514';
  end if;

  if p_scheduled_time not in (
    time '12:00',time '14:00',time '16:00',
    time '18:00',time '20:00',time '22:00'
  ) then
    raise exception 'وقت الموعد يجب أن يكون 12 أو 2 أو 4 أو 6 أو 8 أو 10'
      using errcode='23514';
  end if;

  if not exists(
    select 1
    from public.installation_teams t
    where t.id=p_team_id
      and coalesce(t.status,'نشطة')<>'غير نشطة'
  ) then
    raise exception 'فرقة المواعيد غير موجودة أو غير نشطة' using errcode='23514';
  end if;

  select *
    into r
  from public.installation_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'الموعد غير موجود' using errcode='P0002';
  end if;

  if coalesce(r.status,'') in ('ملغي','مكتمل') then
    raise exception 'لا يمكن جدولة موعد ملغي أو مكتمل' using errcode='23514';
  end if;

  if not public.can_access_installation_request_scope(r.representative_id,p_team_id) then
    raise exception 'الموعد أو الفرقة خارج نطاقك التشغيلي' using errcode='42501';
  end if;

  select ev.id
    into v_id
  from public.installation_execution_visits ev
  where ev.installation_request_id=p_request_id
    and ev.status='بانتظار الجدولة'
  order by ev.visit_no
  limit 1
  for update;

  if v_id is null then
    select count(*)
      into active_count
    from public.installation_execution_visits ev
    where ev.installation_request_id=p_request_id
      and ev.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');

    if active_count>1 then
      raise exception 'الموعد لديه أكثر من زيارة نشطة؛ استخدم جدولة الأيام المتعددة'
        using errcode='23514';
    end if;

    select ev.id
      into v_id
    from public.installation_execution_visits ev
    where ev.installation_request_id=p_request_id
      and ev.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
    order by ev.visit_no
    limit 1
    for update;
  end if;

  if v_id is null then
    select coalesce(max(ev.visit_no),0)+1
      into v_no
    from public.installation_execution_visits ev
    where ev.installation_request_id=p_request_id;

    insert into public.installation_execution_visits(
      installation_request_id,visit_no,scheduled_date,scheduled_time,
      installation_team_id,technician_name,status
    )
    values(
      p_request_id,v_no,p_scheduled_date,p_scheduled_time,
      p_team_id,coalesce(nullif(trim(p_technician_name),''),'فريق الموعد'),'مجدولة'
    )
    returning id into v_id;

    insert into public.installation_execution_visit_services(
      visit_id,request_service_id,scheduled_quantity
    )
    select
      v_id,
      s.id,
      greatest(
        s.quantity
        - coalesce((
            select sum(coalesce(vs.executed_quantity,0))
            from public.installation_execution_visit_services vs
            join public.installation_execution_visits vv on vv.id=vs.visit_id
            where vv.installation_request_id=p_request_id
              and vv.status='مؤكدة'
              and vs.request_service_id=s.id
          ),0)
        - coalesce((
            select sum(coalesce(vs2.scheduled_quantity,0))
            from public.installation_execution_visit_services vs2
            join public.installation_execution_visits vv2 on vv2.id=vs2.visit_id
            where vv2.installation_request_id=p_request_id
              and vv2.status='مجدولة'
              and vs2.request_service_id=s.id
          ),0),
        0
      )
    from public.installation_request_services s
    where s.installation_request_id=p_request_id;
  else
    update public.installation_execution_visits ev
    set scheduled_date=p_scheduled_date,
        scheduled_time=p_scheduled_time,
        installation_team_id=p_team_id,
        technician_name=coalesce(nullif(trim(p_technician_name),''),'فريق الموعد'),
        status='مجدولة',
        updated_at=now()
    where ev.id=v_id;
  end if;

  update public.installation_requests ir
  set scheduled_date=p_scheduled_date,
      scheduled_time=p_scheduled_time,
      time_slot=null,
      installation_team_id=p_team_id,
      assigned_technician_name=coalesce(nullif(trim(p_technician_name),''),'فريق الموعد'),
      technician_id=null,
      status='مسند',
      assignment_notes=nullif(trim(coalesce(p_assignment_notes,'')),''),
      completed_at=null,
      selected_for_execution_at=null,
      selected_for_execution_by=null,
      updated_at=now()
  where ir.id=p_request_id;

  return v_id;
end;
$$;

revoke all on function public.schedule_installation_request_visit(uuid,date,time,uuid,text,text) from public,anon;
grant execute on function public.schedule_installation_request_visit(uuid,date,time,uuid,text,text) to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- ============================================================
-- Verification 1: required save columns
-- ============================================================
select
  x.column_name,
  case when c.column_name is not null then 'PASS' else 'MISSING' end status
from (values
  ('customer_map_url'),
  ('customer_order_number'),
  ('neighborhood_id'),
  ('discount_amount'),
  ('tax_rate'),
  ('tax_amount'),
  ('final_amount'),
  ('installation_team_id'),
  ('scheduled_date'),
  ('scheduled_time'),
  ('assigned_technician_name')
) x(column_name)
left join information_schema.columns c
  on c.table_schema='public'
 and c.table_name='installation_requests'
 and c.column_name=x.column_name
order by x.column_name;

-- ============================================================
-- Verification 2: required tables
-- ============================================================
select
  to_regclass('public.installation_request_services') is not null as services_ok,
  to_regclass('public.installation_request_animals') is not null as animals_ok,
  to_regclass('public.installation_request_collection') is not null as collection_ok,
  to_regclass('public.installation_execution_visits') is not null as execution_visits_ok,
  to_regclass('public.installation_execution_visit_services') is not null as execution_visit_services_ok;

-- ============================================================
-- Verification 3: core RPC contract
-- ============================================================
select
  to_regprocedure('public.create_installation_request_with_services(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb)') is not null as create_base_ok,
  to_regprocedure('public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb)') is not null as create_petatoe_ok,
  to_regprocedure('public.save_petatoe_appointment_details(uuid,numeric,jsonb,jsonb)') is not null as save_details_ok,
  to_regprocedure('public.get_installation_schedule_global()') is not null as schedule_list_ok,
  to_regprocedure('public.schedule_installation_request_visit(uuid,date,time,uuid,text,text)') is not null as schedule_save_ok;

-- ============================================================
-- Verification 4: handoff integrity
-- Unsheduled appointments must be discoverable by schedule global RPC.
-- ============================================================
select
  count(*) as waiting_or_unscheduled_appointments
from public.installation_requests r
where coalesce(r.status,'') not in ('ملغي','مكتمل')
  and r.installation_team_id is null;

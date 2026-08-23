-- P5.13.8.71 — Payroll & Commissions
-- Canonical sources:
--   users: user_profiles/auth.users
--   appointment staff: appointment_employees
--   sales representatives: sales_representatives
--   vehicle/team: installation_teams + appointment_cars
--   commission sales base: final issued sales invoice amount AFTER discount, VAT inclusive / 1.15
begin;

-- ---------------------------------------------------------------------------
-- Permission screens
-- ---------------------------------------------------------------------------
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active) values
('payrollManagement','إدارة الرواتب','الرواتب والعمولات',140,true),
('salaryStatement','كشف الراتب','الرواتب والعمولات',141,true),
('commissionManagement','إدارة العمولات','الرواتب والعمولات',142,true),
('commissionStatement','كشف العمولة','الرواتب والعمولات',143,true),
('payrollReference','البيانات المرجعية - الرواتب والعمولات','الرواتب والعمولات',144,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

-- Management/reference screens stay opt-in except super admin.
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select r.role,s.screen_key,
       case when r.role='super_admin' then true else false end,
       case when r.role='super_admin' then true else false end,
       case when r.role='super_admin' then true else false end,
       case when r.role='super_admin' then true else false end,
       case when r.role='super_admin' then true else false end
from unnest(enum_range(null::public.app_role)) r(role)
cross join (values('payrollManagement'),('commissionManagement'),('payrollReference')) s(screen_key)
on conflict(role,screen_key) do nothing;

-- Employee self-service statements are visible for existing roles; RLS limits rows to the linked user.
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select r.role,s.screen_key,true,false,false,false,false
from unnest(enum_range(null::public.app_role)) r(role)
cross join (values('salaryStatement'),('commissionStatement')) s(screen_key)
on conflict(role,screen_key) do nothing;

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check(nullif(btrim(full_name),'') is not null),
  user_id uuid unique references public.user_profiles(id) on delete set null,
  base_salary numeric(14,2) not null default 0 check(base_salary>=0),
  allowances numeric(14,2) not null default 0 check(allowances>=0),
  payment_method text not null default 'تحويل بنكي' check(nullif(btrim(payment_method),'') is not null),
  commission_role text check(commission_role is null or commission_role in ('representative','driver','groomer')),
  appointment_employee_id uuid references public.appointment_employees(id) on delete set null,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  commission_eligible boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_employee_commission_source_ck check (
    commission_role is null
    or (commission_role='representative' and representative_id is not null and appointment_employee_id is null)
    or (commission_role in ('driver','groomer') and appointment_employee_id is not null and representative_id is null)
  )
);
create unique index if not exists uq_payroll_employees_appointment_source
  on public.payroll_employees(appointment_employee_id)
  where appointment_employee_id is not null;
create unique index if not exists uq_payroll_employees_representative_source
  on public.payroll_employees(representative_id)
  where representative_id is not null;
create index if not exists idx_payroll_employees_active on public.payroll_employees(is_active,full_name);

create table if not exists public.payroll_commission_tiers (
  id uuid primary key default gen_random_uuid(),
  commission_role text not null check(commission_role in ('representative','driver','groomer')),
  tier_no smallint not null check(tier_no between 1 and 3),
  from_amount numeric(14,2) not null default 0 check(from_amount>=0),
  to_amount numeric(14,2) check(to_amount is null or to_amount>from_amount),
  rate_percent numeric(8,4) not null default 0 check(rate_percent>=0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_commission_tier_role_no_uq unique(commission_role,tier_no)
);

-- Seed exactly three editable tiers for each role. Values are placeholders, not business assumptions.
insert into public.payroll_commission_tiers(commission_role,tier_no,from_amount,to_amount,rate_percent,is_active) values
('representative',1,0,0.01,0,false),('representative',2,0.01,0.02,0,false),('representative',3,0.02,null,0,false),
('driver',1,0,0.01,0,false),('driver',2,0.01,0.02,0,false),('driver',3,0.02,null,0,false),
('groomer',1,0,0.01,0,false),('groomer',2,0.01,0.02,0,false),('groomer',3,0.02,null,0,false)
on conflict(commission_role,tier_no) do nothing;

-- ---------------------------------------------------------------------------
-- Monthly commission snapshots and salary statements
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_commission_statements (
  id uuid primary key default gen_random_uuid(),
  payroll_month date not null check(payroll_month=date_trunc('month',payroll_month)::date),
  installation_team_id uuid not null references public.installation_teams(id) on delete restrict,
  appointment_car_id uuid references public.appointment_cars(id) on delete set null,
  employee_id uuid not null references public.payroll_employees(id) on delete restrict,
  commission_role text not null check(commission_role in ('representative','driver','groomer')),
  eligible_sales numeric(14,2) not null default 0 check(eligible_sales>=0),
  commission_amount numeric(14,2) not null default 0 check(commission_amount>=0),
  tier_breakdown jsonb not null default '[]'::jsonb,
  is_locked boolean not null default false,
  calculated_at timestamptz not null default now(),
  calculated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_commission_statement_uq unique(payroll_month,installation_team_id,employee_id,commission_role)
);
create index if not exists idx_payroll_commission_month_employee on public.payroll_commission_statements(payroll_month,employee_id);

create table if not exists public.payroll_salary_statements (
  id uuid primary key default gen_random_uuid(),
  payroll_month date not null check(payroll_month=date_trunc('month',payroll_month)::date),
  employee_id uuid not null references public.payroll_employees(id) on delete restrict,
  employee_name_snapshot text not null,
  base_salary_snapshot numeric(14,2) not null default 0,
  allowances_snapshot numeric(14,2) not null default 0,
  payment_method_snapshot text not null,
  commissions_snapshot numeric(14,2) not null default 0,
  overtime_amount numeric(14,2) not null default 0 check(overtime_amount>=0),
  deductions_amount numeric(14,2) not null default 0 check(deductions_amount>=0),
  net_salary numeric(14,2) not null default 0,
  status text not null default 'draft' check(status in ('draft','pending_chairman','pending_employee','ready_for_payment','paid')),
  notes text,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  chairman_approved_at timestamptz,
  chairman_approved_by uuid references auth.users(id) on delete set null,
  employee_approved_at timestamptz,
  employee_approved_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  payment_reference text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_salary_month_employee_uq unique(payroll_month,employee_id)
);
create index if not exists idx_payroll_salary_month_status on public.payroll_salary_statements(payroll_month,status);
create index if not exists idx_payroll_salary_employee_month on public.payroll_salary_statements(employee_id,payroll_month desc);

create table if not exists public.payroll_salary_audit (
  id uuid primary key default gen_random_uuid(),
  salary_statement_id uuid not null references public.payroll_salary_statements(id) on delete cascade,
  action_key text not null,
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  action_by uuid references auth.users(id) on delete set null default auth.uid(),
  action_at timestamptz not null default now()
);
create index if not exists idx_payroll_salary_audit_statement on public.payroll_salary_audit(salary_statement_id,action_at desc);

-- ---------------------------------------------------------------------------
-- Canonical helpers
-- ---------------------------------------------------------------------------
create or replace function public.payroll_month_start(p_month date)
returns date language sql stable as $$
  select date_trunc('month',coalesce(p_month,current_date))::date
$$;
revoke all on function public.payroll_month_start(date) from public,anon;
grant execute on function public.payroll_month_start(date) to authenticated,service_role;

create or replace function public.payroll_calc_progressive_commission(p_role text,p_sales numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  r record;
  v_sales numeric:=greatest(coalesce(p_sales,0),0);
  v_part numeric;
  v_comm numeric;
  v_total numeric:=0;
  v_breakdown jsonb:='[]'::jsonb;
begin
  if p_role not in ('representative','driver','groomer') then
    return jsonb_build_object('total',0,'breakdown','[]'::jsonb);
  end if;
  if exists(
    select 1
    from public.payroll_commission_tiers current_tier
    join public.payroll_commission_tiers previous_tier
      on previous_tier.commission_role=current_tier.commission_role
     and previous_tier.tier_no=current_tier.tier_no-1
    where current_tier.commission_role=p_role
      and (previous_tier.to_amount is null or current_tier.from_amount<previous_tier.to_amount)
  ) then
    raise exception 'شرائح العمولة متداخلة أو غير مرتبة.';
  end if;
  for r in
    select tier_no,from_amount,to_amount,rate_percent,is_active
    from public.payroll_commission_tiers
    where commission_role=p_role
    order by tier_no
  loop
    v_part:=greatest(least(v_sales,coalesce(r.to_amount,v_sales))-r.from_amount,0);
    v_comm:=case when r.is_active then round(v_part*r.rate_percent/100.0,2) else 0 end;
    v_total:=v_total+v_comm;
    v_breakdown:=v_breakdown||jsonb_build_array(jsonb_build_object(
      'tierNo',r.tier_no,'from',r.from_amount,'to',r.to_amount,'rate',r.rate_percent,
      'active',r.is_active,'salesPart',round(v_part,2),'commission',round(v_comm,2)
    ));
  end loop;
  return jsonb_build_object('total',round(v_total,2),'breakdown',v_breakdown);
end;
$$;
revoke all on function public.payroll_calc_progressive_commission(text,numeric) from public,anon;
grant execute on function public.payroll_calc_progressive_commission(text,numeric) to authenticated,service_role;

-- Final invoice amount AFTER discount is VAT-inclusive. Divide by 1.15 exactly as approved business rule.
create or replace view public.payroll_commission_invoice_base with (security_invoker=true) as
select
  si.id invoice_id,
  si.invoice_number,
  si.invoice_date,
  public.payroll_month_start(si.invoice_date) payroll_month,
  si.representative_id,
  coalesce(v.installation_team_id,r.installation_team_id) installation_team_id,
  round(greatest(coalesce(si.final_amount,round(si.invoice_amount*1.15,2)),0)/1.15,2)::numeric(14,2) eligible_sales_before_vat
from public.sales_invoices si
left join public.sales_invoices ref_si
  on ref_si.id=si.reference_sales_invoice_id
 and ref_si.source_type='installation'
 and ref_si.status<>'ملغاة'
left join public.installation_execution_visits v
  on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
left join public.installation_requests r
  on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
where si.status='صادرة'
  and si.source_type in ('installation','manual')
  and (si.source_type<>'manual' or ref_si.id is not null)
  and coalesce(v.installation_team_id,r.installation_team_id) is not null;

create or replace function public.payroll_live_commission_rows(p_month date)
returns table(
  payroll_month date,
  installation_team_id uuid,
  team_name text,
  appointment_car_id uuid,
  car_name text,
  plate_number text,
  employee_id uuid,
  employee_name text,
  commission_role text,
  eligible_sales numeric,
  commission_amount numeric,
  tier_breakdown jsonb,
  linked boolean,
  commission_eligible boolean
)
language sql
stable
security definer
set search_path=public
as $$
with month_key as (select public.payroll_month_start(p_month) m),
team_master as (
  select t.id team_id,t.name team_name,t.appointment_car_id,
         coalesce(nullif(btrim(c.name),''),nullif(btrim(t.car_name),''),t.name) car_name,
         c.plate_number,t.groomer_employee_id,t.driver_employee_id
  from public.installation_teams t
  left join public.appointment_cars c on c.id=t.appointment_car_id
  where t.status<>'غير نشطة'
),
team_sales as (
  select b.installation_team_id,round(sum(b.eligible_sales_before_vat),2) sales
  from public.payroll_commission_invoice_base b,month_key k
  where b.payroll_month=k.m
  group by b.installation_team_id
),
rep_sales as (
  select b.installation_team_id,b.representative_id,round(sum(b.eligible_sales_before_vat),2) sales
  from public.payroll_commission_invoice_base b,month_key k
  where b.payroll_month=k.m and b.representative_id is not null
  group by b.installation_team_id,b.representative_id
),
roles as (
  select tm.*,pe.id employee_id,coalesce(pe.full_name,ae.full_name,'غير مربوط') employee_name,
         'groomer'::text commission_role,coalesce(ts.sales,0)::numeric sales,(pe.id is not null) linked,coalesce(pe.commission_eligible,false) commission_eligible
  from team_master tm
  left join team_sales ts on ts.installation_team_id=tm.team_id
  left join public.appointment_employees ae on ae.id=tm.groomer_employee_id
  left join public.payroll_employees pe on pe.appointment_employee_id=tm.groomer_employee_id and pe.commission_role='groomer' and pe.is_active
  union all
  select tm.*,pe.id,coalesce(pe.full_name,ae.full_name,'غير مربوط'),'driver',coalesce(ts.sales,0)::numeric,(pe.id is not null),coalesce(pe.commission_eligible,false)
  from team_master tm
  left join team_sales ts on ts.installation_team_id=tm.team_id
  left join public.appointment_employees ae on ae.id=tm.driver_employee_id
  left join public.payroll_employees pe on pe.appointment_employee_id=tm.driver_employee_id and pe.commission_role='driver' and pe.is_active
  union all
  select tm.*,pe.id,coalesce(pe.full_name,sr.full_name,'غير مربوط'),'representative',rs.sales::numeric,(pe.id is not null),coalesce(pe.commission_eligible,false)
  from team_master tm
  join rep_sales rs on rs.installation_team_id=tm.team_id
  left join public.sales_representatives sr on sr.id=rs.representative_id
  left join public.payroll_employees pe on pe.representative_id=rs.representative_id and pe.commission_role='representative' and pe.is_active
), calc as (
  select roles.*,public.payroll_calc_progressive_commission(roles.commission_role,roles.sales) calc
  from roles
)
select k.m,calc.team_id,calc.team_name,calc.appointment_car_id,calc.car_name,calc.plate_number,
       calc.employee_id,calc.employee_name,calc.commission_role,round(calc.sales,2),
       case when calc.linked and calc.commission_eligible then coalesce((calc.calc->>'total')::numeric,0) else 0 end,
       case when calc.linked and calc.commission_eligible then coalesce(calc.calc->'breakdown','[]'::jsonb) else '[]'::jsonb end,
       calc.linked,calc.commission_eligible
from calc cross join month_key k
where public.has_screen_permission('commissionManagement','view')
   or public.has_screen_permission('payrollManagement','add')
   or public.has_screen_permission('payrollManagement','edit')
   or (calc.employee_id is not null and exists(select 1 from public.payroll_employees own where own.id=calc.employee_id and own.user_id=auth.uid()))
order by calc.car_name,case calc.commission_role when 'representative' then 1 when 'driver' then 2 else 3 end,calc.employee_name
$$;
revoke all on function public.payroll_live_commission_rows(date) from public,anon;
grant execute on function public.payroll_live_commission_rows(date) to authenticated,service_role;

create or replace function public.rebuild_payroll_commissions_internal(p_month date,p_actor uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_month date:=public.payroll_month_start(p_month);
begin
  delete from public.payroll_commission_statements
  where payroll_month=v_month and is_locked=false;

  insert into public.payroll_commission_statements(
    payroll_month,installation_team_id,appointment_car_id,employee_id,commission_role,
    eligible_sales,commission_amount,tier_breakdown,is_locked,calculated_at,calculated_by
  )
  select payroll_month,installation_team_id,appointment_car_id,employee_id,commission_role,
         eligible_sales,commission_amount,tier_breakdown,false,now(),p_actor
  from public.payroll_live_commission_rows(v_month)
  where linked=true and employee_id is not null
  on conflict(payroll_month,installation_team_id,employee_id,commission_role) do update set
    appointment_car_id=excluded.appointment_car_id,
    eligible_sales=excluded.eligible_sales,
    commission_amount=excluded.commission_amount,
    tier_breakdown=excluded.tier_breakdown,
    calculated_at=now(),
    calculated_by=p_actor,
    updated_at=now()
  where public.payroll_commission_statements.is_locked=false;
end;
$$;
revoke all on function public.rebuild_payroll_commissions_internal(date,uuid) from public,anon,authenticated;

create or replace function public.refresh_payroll_commissions(p_month date)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.has_screen_permission('commissionManagement','edit') then
    raise exception 'لا توجد صلاحية إعادة احتساب العمولات';
  end if;
  perform public.rebuild_payroll_commissions_internal(p_month,auth.uid());
  return true;
end;
$$;
revoke all on function public.refresh_payroll_commissions(date) from public,anon;
grant execute on function public.refresh_payroll_commissions(date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Salary generation and ordered workflow
-- ---------------------------------------------------------------------------
create or replace function public.prepare_payroll_month(p_month date)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_month date:=public.payroll_month_start(p_month); v_count integer:=0;
begin
  if not public.has_screen_permission('payrollManagement','add') then
    raise exception 'لا توجد صلاحية تجهيز الرواتب';
  end if;
  perform public.rebuild_payroll_commissions_internal(v_month,auth.uid());

  insert into public.payroll_salary_statements(
    payroll_month,employee_id,employee_name_snapshot,base_salary_snapshot,allowances_snapshot,
    payment_method_snapshot,commissions_snapshot,overtime_amount,deductions_amount,net_salary,status,created_by,updated_by
  )
  select v_month,e.id,e.full_name,e.base_salary,e.allowances,e.payment_method,
         coalesce(c.commission_total,0),0,0,
         round(e.base_salary+e.allowances+coalesce(c.commission_total,0),2),'draft',auth.uid(),auth.uid()
  from public.payroll_employees e
  left join (
    select employee_id,round(sum(commission_amount),2) commission_total
    from public.payroll_commission_statements
    where payroll_month=v_month
    group by employee_id
  ) c on c.employee_id=e.id
  where e.is_active=true
  on conflict(payroll_month,employee_id) do update set
    employee_name_snapshot=excluded.employee_name_snapshot,
    base_salary_snapshot=excluded.base_salary_snapshot,
    allowances_snapshot=excluded.allowances_snapshot,
    payment_method_snapshot=excluded.payment_method_snapshot,
    commissions_snapshot=excluded.commissions_snapshot,
    net_salary=round(excluded.base_salary_snapshot+excluded.allowances_snapshot+excluded.commissions_snapshot+public.payroll_salary_statements.overtime_amount-public.payroll_salary_statements.deductions_amount,2),
    updated_by=auth.uid(),updated_at=now()
  where public.payroll_salary_statements.status='draft';

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.prepare_payroll_month(date) from public,anon;
grant execute on function public.prepare_payroll_month(date) to authenticated,service_role;

create or replace function public.save_payroll_salary_adjustments(
  p_statement_id uuid,p_overtime numeric,p_deductions numeric,p_notes text default null
)
returns public.payroll_salary_statements
language plpgsql
security definer
set search_path=public
as $$
declare s public.payroll_salary_statements%rowtype;
begin
  if not public.has_screen_permission('payrollManagement','add') then raise exception 'لا توجد صلاحية تعديل تجهيز الرواتب'; end if;
  select * into s from public.payroll_salary_statements where id=p_statement_id for update;
  if not found then raise exception 'كشف الراتب غير موجود'; end if;
  if s.status<>'draft' then raise exception 'يمكن تعديل الإضافي والخصومات أثناء التجهيز فقط'; end if;
  update public.payroll_salary_statements set
    overtime_amount=greatest(coalesce(p_overtime,0),0),
    deductions_amount=greatest(coalesce(p_deductions,0),0),
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    net_salary=round(base_salary_snapshot+allowances_snapshot+commissions_snapshot+greatest(coalesce(p_overtime,0),0)-greatest(coalesce(p_deductions,0),0),2),
    updated_by=auth.uid(),updated_at=now()
  where id=p_statement_id returning * into s;
  insert into public.payroll_salary_audit(salary_statement_id,action_key,from_status,to_status,details)
  values(s.id,'adjustments_saved','draft','draft',jsonb_build_object('overtime',s.overtime_amount,'deductions',s.deductions_amount));
  return s;
end;
$$;
revoke all on function public.save_payroll_salary_adjustments(uuid,numeric,numeric,text) from public,anon;
grant execute on function public.save_payroll_salary_adjustments(uuid,numeric,numeric,text) to authenticated,service_role;

create or replace function public.payroll_salary_transition(
  p_statement_id uuid,p_action text,p_reference text default null
)
returns public.payroll_salary_statements
language plpgsql
security definer
set search_path=public
as $$
declare s public.payroll_salary_statements%rowtype; own_user uuid; next_status text; old_status text;
begin
  select * into s from public.payroll_salary_statements where id=p_statement_id for update;
  if not found then raise exception 'كشف الراتب غير موجود'; end if;
  select user_id into own_user from public.payroll_employees where id=s.employee_id;
  old_status:=s.status;

  if p_action='submit' then
    if not public.has_screen_permission('payrollManagement','add') or s.status<>'draft' then raise exception 'لا يمكن إرسال الراتب للاعتماد من حالته الحالية'; end if;
    next_status:='pending_chairman';
    update public.payroll_salary_statements set status=next_status,submitted_at=now(),submitted_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=s.id;
    update public.payroll_commission_statements set is_locked=true,updated_at=now() where payroll_month=s.payroll_month and employee_id=s.employee_id;
  elsif p_action='chairman_approve' then
    if not public.has_screen_permission('payrollManagement','edit') or s.status<>'pending_chairman' then raise exception 'لا يمكن اعتماد رئيس مجلس الإدارة من الحالة الحالية'; end if;
    next_status:='pending_employee';
    update public.payroll_salary_statements set status=next_status,chairman_approved_at=now(),chairman_approved_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=s.id;
  elsif p_action='employee_approve' then
    if s.status<>'pending_employee' or own_user is distinct from auth.uid() then raise exception 'لا يمكنك اعتماد كشف الراتب هذا'; end if;
    next_status:='ready_for_payment';
    update public.payroll_salary_statements set status=next_status,employee_approved_at=now(),employee_approved_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=s.id;
  elsif p_action='mark_paid' then
    if not public.has_screen_permission('payrollManagement','edit') or s.status<>'ready_for_payment' then raise exception 'الراتب غير جاهز للصرف'; end if;
    next_status:='paid';
    update public.payroll_salary_statements set status=next_status,paid_at=now(),paid_by=auth.uid(),payment_reference=nullif(btrim(coalesce(p_reference,'')),''),updated_by=auth.uid(),updated_at=now() where id=s.id;
  elsif p_action='reverse_paid' then
    if not public.has_screen_permission('payrollManagement','delete') or s.status<>'paid' then raise exception 'يجب إلغاء الصرف أولًا وبالترتيب العكسي'; end if;
    next_status:='ready_for_payment';
    update public.payroll_salary_statements set status=next_status,paid_at=null,paid_by=null,payment_reference=null,updated_by=auth.uid(),updated_at=now() where id=s.id;
  elsif p_action='reverse_employee' then
    if not public.has_screen_permission('payrollManagement','delete') or s.status<>'ready_for_payment' then raise exception 'إلغاء موافقة الموظف متاح فقط بعد إلغاء الصرف'; end if;
    next_status:='pending_employee';
    update public.payroll_salary_statements set status=next_status,employee_approved_at=null,employee_approved_by=null,updated_by=auth.uid(),updated_at=now() where id=s.id;
  elsif p_action='reverse_chairman' then
    if not public.has_screen_permission('payrollManagement','delete') or s.status<>'pending_employee' then raise exception 'إلغاء اعتماد رئيس مجلس الإدارة يجب أن يتم بعد إلغاء اعتماد الموظف'; end if;
    next_status:='pending_chairman';
    update public.payroll_salary_statements set status=next_status,chairman_approved_at=null,chairman_approved_by=null,updated_by=auth.uid(),updated_at=now() where id=s.id;
  elsif p_action='reverse_submit' then
    if not public.has_screen_permission('payrollManagement','delete') or s.status<>'pending_chairman' then raise exception 'لا يمكن إرجاع الراتب للتجهيز من الحالة الحالية'; end if;
    next_status:='draft';
    update public.payroll_salary_statements set status=next_status,submitted_at=null,submitted_by=null,updated_by=auth.uid(),updated_at=now() where id=s.id;
    update public.payroll_commission_statements set is_locked=false,updated_at=now() where payroll_month=s.payroll_month and employee_id=s.employee_id;
  else
    raise exception 'إجراء راتب غير معروف';
  end if;

  insert into public.payroll_salary_audit(salary_statement_id,action_key,from_status,to_status,details)
  values(s.id,p_action,old_status,next_status,jsonb_build_object('reference',nullif(btrim(coalesce(p_reference,'')),'')));
  select * into s from public.payroll_salary_statements where id=p_statement_id;
  return s;
end;
$$;
revoke all on function public.payroll_salary_transition(uuid,text,text) from public,anon;
grant execute on function public.payroll_salary_transition(uuid,text,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Workspace RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_payroll_management_workspace(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_month date:=public.payroll_month_start(p_month); result jsonb;
begin
  if not public.has_screen_permission('payrollManagement','view') then raise exception 'لا توجد صلاحية عرض إدارة الرواتب'; end if;
  select jsonb_build_object(
    'month',v_month,
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'employeeId',s.employee_id,'employeeName',s.employee_name_snapshot,
      'paymentMethod',s.payment_method_snapshot,'baseSalary',s.base_salary_snapshot,'allowances',s.allowances_snapshot,
      'commissions',s.commissions_snapshot,'overtime',s.overtime_amount,'deductions',s.deductions_amount,'netSalary',s.net_salary,
      'status',s.status,'notes',coalesce(s.notes,''),'submittedAt',s.submitted_at,'chairmanApprovedAt',s.chairman_approved_at,
      'employeeApprovedAt',s.employee_approved_at,'paidAt',s.paid_at,'paymentReference',coalesce(s.payment_reference,'')
    ) order by s.employee_name_snapshot) from public.payroll_salary_statements s where s.payroll_month=v_month),'[]'::jsonb),
    'summary',jsonb_build_object(
      'employees',(select count(*) from public.payroll_salary_statements where payroll_month=v_month),
      'baseSalary',coalesce((select sum(base_salary_snapshot) from public.payroll_salary_statements where payroll_month=v_month),0),
      'allowances',coalesce((select sum(allowances_snapshot) from public.payroll_salary_statements where payroll_month=v_month),0),
      'commissions',coalesce((select sum(commissions_snapshot) from public.payroll_salary_statements where payroll_month=v_month),0),
      'overtime',coalesce((select sum(overtime_amount) from public.payroll_salary_statements where payroll_month=v_month),0),
      'deductions',coalesce((select sum(deductions_amount) from public.payroll_salary_statements where payroll_month=v_month),0),
      'netSalary',coalesce((select sum(net_salary) from public.payroll_salary_statements where payroll_month=v_month),0)
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_payroll_management_workspace(date) from public,anon;
grant execute on function public.get_payroll_management_workspace(date) to authenticated,service_role;

create or replace function public.get_salary_statement_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare emp public.payroll_employees%rowtype; result jsonb;
begin
  if not public.has_screen_permission('salaryStatement','view') then raise exception 'لا توجد صلاحية عرض كشف الراتب'; end if;
  select * into emp from public.payroll_employees where user_id=auth.uid() and is_active=true limit 1;
  if not found then return jsonb_build_object('employee',null,'current',null,'history','[]'::jsonb); end if;
  select jsonb_build_object(
    'employee',jsonb_build_object('id',emp.id,'name',emp.full_name,'paymentMethod',emp.payment_method),
    'current',(select to_jsonb(x) from (
      select s.id,s.payroll_month "payrollMonth",s.employee_name_snapshot "employeeName",s.payment_method_snapshot "paymentMethod",
             s.base_salary_snapshot "baseSalary",s.allowances_snapshot allowances,s.commissions_snapshot commissions,
             s.overtime_amount overtime,s.deductions_amount deductions,s.net_salary "netSalary",s.status,
             s.chairman_approved_at "chairmanApprovedAt",s.employee_approved_at "employeeApprovedAt"
      from public.payroll_salary_statements s
      where s.employee_id=emp.id and s.status in ('pending_employee','ready_for_payment')
      order by s.payroll_month desc limit 1
    ) x),
    'history',coalesce((select jsonb_agg(to_jsonb(x) order by x."payrollMonth" desc) from (
      select s.id,s.payroll_month "payrollMonth",s.payment_method_snapshot "paymentMethod",s.base_salary_snapshot "baseSalary",
             s.allowances_snapshot allowances,s.commissions_snapshot commissions,s.overtime_amount overtime,
             s.deductions_amount deductions,s.net_salary "netSalary",s.status,s.paid_at "paidAt",s.payment_reference "paymentReference"
      from public.payroll_salary_statements s where s.employee_id=emp.id and s.status='paid'
    ) x),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_salary_statement_workspace() from public,anon;
grant execute on function public.get_salary_statement_workspace() to authenticated,service_role;

create or replace function public.get_commission_management_workspace(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_month date:=public.payroll_month_start(p_month); result jsonb;
begin
  if not public.has_screen_permission('commissionManagement','view') then raise exception 'لا توجد صلاحية عرض إدارة العمولات'; end if;
  with rows as (
    select * from public.payroll_live_commission_rows(v_month)
  )
  select jsonb_build_object(
    'month',v_month,
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'teamId',installation_team_id,'teamName',team_name,'carId',appointment_car_id,'carName',car_name,'plateNumber',coalesce(plate_number,''),
      'employeeId',employee_id,'employeeName',employee_name,'role',commission_role,'eligibleSales',eligible_sales,
      'commissionAmount',commission_amount,'tierBreakdown',tier_breakdown,'linked',linked,'commissionEligible',commission_eligible
    ) order by car_name,commission_role,employee_name),'[]'::jsonb),
    'totalSales',coalesce((select sum(x.sales) from (select installation_team_id,max(eligible_sales) sales from rows group by installation_team_id)x),0),
    'totalCommissions',coalesce(sum(commission_amount),0)
  ) into result from rows;
  return result;
end;
$$;
revoke all on function public.get_commission_management_workspace(date) from public,anon;
grant execute on function public.get_commission_management_workspace(date) to authenticated,service_role;

create or replace function public.get_commission_statement_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare emp public.payroll_employees%rowtype; v_month date:=public.payroll_month_start(current_date); result jsonb;
begin
  if not public.has_screen_permission('commissionStatement','view') then raise exception 'لا توجد صلاحية عرض كشف العمولة'; end if;
  select * into emp from public.payroll_employees where user_id=auth.uid() and is_active=true limit 1;
  if not found then return jsonb_build_object('employee',null,'current','[]'::jsonb,'history','[]'::jsonb); end if;
  select jsonb_build_object(
    'employee',jsonb_build_object('id',emp.id,'name',emp.full_name,'role',emp.commission_role,'eligible',emp.commission_eligible),
    'current',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'month',c.payroll_month,'teamId',c.installation_team_id,'carName',coalesce(ac.name,it.car_name,it.name),
      'eligibleSales',c.eligible_sales,'commissionAmount',c.commission_amount,'tierBreakdown',c.tier_breakdown,'locked',c.is_locked
    )) from public.payroll_commission_statements c join public.installation_teams it on it.id=c.installation_team_id left join public.appointment_cars ac on ac.id=c.appointment_car_id
    where c.employee_id=emp.id and c.payroll_month=v_month),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'month',h.payroll_month,'eligibleSales',h.sales,'commissionAmount',h.commission
    ) order by h.payroll_month desc) from (
      select c.payroll_month,round(sum(c.eligible_sales),2) sales,round(sum(c.commission_amount),2) commission
      from public.payroll_commission_statements c where c.employee_id=emp.id and c.payroll_month<v_month
      group by c.payroll_month
    ) h),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_commission_statement_workspace() from public,anon;
grant execute on function public.get_commission_statement_workspace() to authenticated,service_role;

create or replace function public.get_payroll_reference_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.has_screen_permission('payrollReference','view') then raise exception 'لا توجد صلاحية عرض البيانات المرجعية للرواتب والعمولات'; end if;
  select jsonb_build_object(
    'employees',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'fullName',e.full_name,'userId',e.user_id,'baseSalary',e.base_salary,'allowances',e.allowances,
      'paymentMethod',e.payment_method,'commissionRole',e.commission_role,'appointmentEmployeeId',e.appointment_employee_id,
      'representativeId',e.representative_id,'commissionEligible',e.commission_eligible,'isActive',e.is_active,'notes',coalesce(e.notes,'')
    ) order by e.full_name) from public.payroll_employees e),'[]'::jsonb),
    'tiers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'role',t.commission_role,'tierNo',t.tier_no,'fromAmount',t.from_amount,'toAmount',t.to_amount,
      'ratePercent',t.rate_percent,'isActive',t.is_active
    ) order by t.commission_role,t.tier_no) from public.payroll_commission_tiers t),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'fullName',u.full_name,'email',u.email,'isActive',u.is_active) order by u.full_name) from public.user_profiles u where u.is_active=true),'[]'::jsonb),
    'appointmentEmployees',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'fullName',a.full_name,'employeeType',a.employee_type,'isActive',a.is_active) order by a.full_name) from public.appointment_employees a where a.is_active=true),'[]'::jsonb),
    'representatives',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'fullName',r.full_name,'isActive',r.is_active) order by r.full_name) from public.sales_representatives r where r.is_active=true),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_payroll_reference_workspace() from public,anon;
grant execute on function public.get_payroll_reference_workspace() to authenticated,service_role;

create or replace function public.save_payroll_employee(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_role text; v_appointment uuid; v_rep uuid; v_type text;
begin
  if not (public.has_screen_permission('payrollReference','add') or public.has_screen_permission('payrollReference','edit')) then raise exception 'لا توجد صلاحية حفظ الموظفين'; end if;
  begin v_id:=nullif(p_record->>'id','')::uuid; exception when others then v_id:=null; end;
  v_role:=nullif(btrim(coalesce(p_record->>'commissionRole','')),'');
  begin v_appointment:=nullif(p_record->>'appointmentEmployeeId','')::uuid; exception when others then v_appointment:=null; end;
  begin v_rep:=nullif(p_record->>'representativeId','')::uuid; exception when others then v_rep:=null; end;
  if v_role in ('driver','groomer') then
    select employee_type into v_type from public.appointment_employees where id=v_appointment and is_active=true;
    if v_type is null or (v_role='driver' and v_type<>'سائق') or (v_role='groomer' and v_type<>'جرومر') then raise exception 'موظف العمولة المختار لا يطابق الدور'; end if;
    v_rep:=null;
  elsif v_role='representative' then
    if v_rep is null or not exists(select 1 from public.sales_representatives where id=v_rep and is_active=true) then raise exception 'مندوب العمولة غير صالح'; end if;
    v_appointment:=null;
  else
    v_role:=null;v_appointment:=null;v_rep:=null;
  end if;

  if v_id is null then
    insert into public.payroll_employees(full_name,user_id,base_salary,allowances,payment_method,commission_role,appointment_employee_id,representative_id,commission_eligible,is_active,notes,created_by,updated_by)
    values(
      btrim(coalesce(p_record->>'fullName','')),
      nullif(p_record->>'userId','')::uuid,
      greatest(coalesce((p_record->>'baseSalary')::numeric,0),0),greatest(coalesce((p_record->>'allowances')::numeric,0),0),
      btrim(coalesce(nullif(p_record->>'paymentMethod',''),'تحويل بنكي')),v_role,v_appointment,v_rep,
      coalesce((p_record->>'commissionEligible')::boolean,false),coalesce((p_record->>'isActive')::boolean,true),
      nullif(btrim(coalesce(p_record->>'notes','')),''),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.payroll_employees set
      full_name=btrim(coalesce(p_record->>'fullName',full_name)),user_id=nullif(p_record->>'userId','')::uuid,
      base_salary=greatest(coalesce((p_record->>'baseSalary')::numeric,base_salary),0),allowances=greatest(coalesce((p_record->>'allowances')::numeric,allowances),0),
      payment_method=btrim(coalesce(nullif(p_record->>'paymentMethod',''),payment_method)),commission_role=v_role,appointment_employee_id=v_appointment,representative_id=v_rep,
      commission_eligible=coalesce((p_record->>'commissionEligible')::boolean,false),is_active=coalesce((p_record->>'isActive')::boolean,true),
      notes=nullif(btrim(coalesce(p_record->>'notes','')),''),updated_by=auth.uid(),updated_at=now()
    where id=v_id;
    if not found then raise exception 'الموظف غير موجود'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_payroll_employee(jsonb) from public,anon;
grant execute on function public.save_payroll_employee(jsonb) to authenticated,service_role;

create or replace function public.save_payroll_commission_tier(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_role text; v_no integer; v_from numeric; v_to numeric; v_rate numeric; v_active boolean;
begin
  if not public.has_screen_permission('payrollReference','edit') then raise exception 'لا توجد صلاحية تعديل شرائح العمولات'; end if;
  v_role:=p_record->>'role'; v_no:=(p_record->>'tierNo')::integer;
  v_from:=greatest(coalesce((p_record->>'fromAmount')::numeric,0),0);
  v_to:=nullif(p_record->>'toAmount','')::numeric;
  v_rate:=greatest(coalesce((p_record->>'ratePercent')::numeric,0),0);
  v_active:=coalesce((p_record->>'isActive')::boolean,false);
  if v_role not in ('representative','driver','groomer') or v_no not between 1 and 3 then raise exception 'شريحة عمولة غير صالحة'; end if;
  if v_to is not null and v_to<=v_from then raise exception 'نهاية الشريحة يجب أن تكون أكبر من بدايتها'; end if;
  insert into public.payroll_commission_tiers(commission_role,tier_no,from_amount,to_amount,rate_percent,is_active,created_by,updated_by)
  values(v_role,v_no,v_from,v_to,v_rate,v_active,auth.uid(),auth.uid())
  on conflict(commission_role,tier_no) do update set from_amount=excluded.from_amount,to_amount=excluded.to_amount,rate_percent=excluded.rate_percent,is_active=excluded.is_active,updated_by=auth.uid(),updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.save_payroll_commission_tier(jsonb) from public,anon;
grant execute on function public.save_payroll_commission_tier(jsonb) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- RLS: management gets all; employees get only their own post-chairman statements.
-- ---------------------------------------------------------------------------
alter table public.payroll_employees enable row level security;
alter table public.payroll_commission_tiers enable row level security;
alter table public.payroll_commission_statements enable row level security;
alter table public.payroll_salary_statements enable row level security;
alter table public.payroll_salary_audit enable row level security;

drop policy if exists "payroll employees management read" on public.payroll_employees;
create policy "payroll employees management read" on public.payroll_employees for select to authenticated using(
  public.has_screen_permission('payrollReference','view') or user_id=auth.uid()
);
drop policy if exists "payroll employees management write" on public.payroll_employees;
create policy "payroll employees management write" on public.payroll_employees for all to authenticated using(public.has_screen_permission('payrollReference','edit')) with check(public.has_screen_permission('payrollReference','add') or public.has_screen_permission('payrollReference','edit'));

drop policy if exists "payroll tiers read" on public.payroll_commission_tiers;
create policy "payroll tiers read" on public.payroll_commission_tiers for select to authenticated using(
  public.has_screen_permission('commissionManagement','view') or public.has_screen_permission('payrollReference','view') or public.has_screen_permission('commissionStatement','view')
);
drop policy if exists "payroll tiers write" on public.payroll_commission_tiers;
create policy "payroll tiers write" on public.payroll_commission_tiers for all to authenticated using(public.has_screen_permission('payrollReference','edit')) with check(public.has_screen_permission('payrollReference','edit'));

drop policy if exists "payroll commission management or own" on public.payroll_commission_statements;
create policy "payroll commission management or own" on public.payroll_commission_statements for select to authenticated using(
  public.has_screen_permission('commissionManagement','view')
  or exists(select 1 from public.payroll_employees e where e.id=employee_id and e.user_id=auth.uid())
);
drop policy if exists "payroll commission management write" on public.payroll_commission_statements;
create policy "payroll commission management write" on public.payroll_commission_statements for all to authenticated using(public.has_screen_permission('commissionManagement','edit')) with check(public.has_screen_permission('commissionManagement','edit'));

drop policy if exists "payroll salary management or own" on public.payroll_salary_statements;
create policy "payroll salary management or own" on public.payroll_salary_statements for select to authenticated using(
  public.has_screen_permission('payrollManagement','view')
  or (
    status in ('pending_employee','ready_for_payment','paid')
    and exists(select 1 from public.payroll_employees e where e.id=employee_id and e.user_id=auth.uid())
  )
);
drop policy if exists "payroll salary management write" on public.payroll_salary_statements;
create policy "payroll salary management write" on public.payroll_salary_statements for all to authenticated using(public.has_screen_permission('payrollManagement','edit')) with check(public.has_screen_permission('payrollManagement','add') or public.has_screen_permission('payrollManagement','edit'));

drop policy if exists "payroll salary audit management read" on public.payroll_salary_audit;
create policy "payroll salary audit management read" on public.payroll_salary_audit for select to authenticated using(
  public.has_screen_permission('payrollManagement','view')
  or exists(
    select 1 from public.payroll_salary_statements s join public.payroll_employees e on e.id=s.employee_id
    where s.id=salary_statement_id and e.user_id=auth.uid() and s.status in ('pending_employee','ready_for_payment','paid')
  )
);

grant select,insert,update,delete on public.payroll_employees,public.payroll_commission_tiers,public.payroll_commission_statements,public.payroll_salary_statements to authenticated;
grant select on public.payroll_salary_audit to authenticated;

-- ---------------------------------------------------------------------------
-- Central localization seed (canonical DB localization source)
-- ---------------------------------------------------------------------------
insert into public.app_translations(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at) values
  ('sidebar.group.payroll','navigation','payroll','navigation','الرواتب والعمولات','Payroll & Commissions','الرواتب والعمولات','Payroll & Commissions',true,now()),
  ('sidebar.payrollManagement','navigation','payroll','navigation','إدارة الرواتب','Payroll Management','إدارة الرواتب','Payroll Management',true,now()),
  ('sidebar.salaryStatement','navigation','payroll','navigation','كشف الراتب','Salary Statement','كشف الراتب','Salary Statement',true,now()),
  ('sidebar.commissionManagement','navigation','payroll','navigation','إدارة العمولات','Commission Management','إدارة العمولات','Commission Management',true,now()),
  ('sidebar.commissionStatement','navigation','payroll','navigation','كشف العمولة','Commission Statement','كشف العمولة','Commission Statement',true,now()),
  ('sidebar.payrollReference','navigation','payroll','navigation','البيانات المرجعية','Reference Data','البيانات المرجعية','Reference Data',true,now()),
  ('payroll.page.management.title','payrollManagement','payroll','title','إدارة الرواتب','Payroll Management','إدارة الرواتب','Payroll Management',true,now()),
  ('payroll.page.management.subtitle','payrollManagement','payroll','subtitle','تجهيز واعتماد وصرف الرواتب الشهرية','Prepare, approve, and pay monthly salaries','تجهيز واعتماد وصرف الرواتب الشهرية','Prepare, approve, and pay monthly salaries',true,now()),
  ('payroll.page.salaryStatement.title','salaryStatement','payroll','title','كشف الراتب','Salary Statement','كشف الراتب','Salary Statement',true,now()),
  ('payroll.page.salaryStatement.subtitle','salaryStatement','payroll','subtitle','مراجعة واعتماد راتبك الحالي والرواتب السابقة','Review and approve your current salary and previous salaries','مراجعة واعتماد راتبك الحالي والرواتب السابقة','Review and approve your current salary and previous salaries',true,now()),
  ('payroll.page.commissionManagement.title','commissionManagement','payroll','title','إدارة العمولات','Commission Management','إدارة العمولات','Commission Management',true,now()),
  ('payroll.page.commissionManagement.subtitle','commissionManagement','payroll','subtitle','احتساب عمولات السيارات حسب الشرائح والأدوار','Calculate vehicle commissions by progressive tiers and roles','احتساب عمولات السيارات حسب الشرائح والأدوار','Calculate vehicle commissions by progressive tiers and roles',true,now()),
  ('payroll.page.commissionStatement.title','commissionStatement','payroll','title','كشف العمولة','Commission Statement','كشف العمولة','Commission Statement',true,now()),
  ('payroll.page.commissionStatement.subtitle','commissionStatement','payroll','subtitle','تفاصيل عمولتك الحالية والعمولات السابقة','Your current commission details and commission history','تفاصيل عمولتك الحالية والعمولات السابقة','Your current commission details and commission history',true,now()),
  ('payroll.page.reference.title','payrollReference','payroll','title','البيانات المرجعية — الرواتب والعمولات','Payroll & Commissions Reference Data','البيانات المرجعية — الرواتب والعمولات','Payroll & Commissions Reference Data',true,now()),
  ('payroll.page.reference.subtitle','payrollReference','payroll','subtitle','تكويد الموظفين وربط المستخدمين والشرائح','Configure employees, user links, and commission tiers','تكويد الموظفين وربط المستخدمين والشرائح','Configure employees, user links, and commission tiers',true,now()),
  ('payroll.management.title','payrollManagement','payroll','title','إدارة الرواتب','Payroll Management','إدارة الرواتب','Payroll Management',true,now()),
  ('payroll.management.subtitle','payrollManagement','payroll','help','تجهيز واعتماد وصرف الرواتب الشهرية.','Prepare, approve, and pay monthly salaries.','تجهيز واعتماد وصرف الرواتب الشهرية.','Prepare, approve, and pay monthly salaries.',true,now()),
  ('payroll.management.prepare','payrollManagement','payroll','button','تجهيز رواتب الشهر','Prepare Month Payroll','تجهيز رواتب الشهر','Prepare Month Payroll',true,now()),
  ('payroll.management.current','payrollManagement','payroll','tab','الرواتب الجارية','Current Payroll','الرواتب الجارية','Current Payroll',true,now()),
  ('payroll.management.reports','payrollManagement','payroll','tab','تقارير الرواتب','Payroll Reports','تقارير الرواتب','Payroll Reports',true,now()),
  ('payroll.management.searchPlaceholder','payrollManagement','payroll','placeholder','اسم الموظف...','Employee name...','اسم الموظف...','Employee name...',true,now()),
  ('salaryStatement.title','salaryStatement','payroll','title','كشف الراتب','Salary Statement','كشف الراتب','Salary Statement',true,now()),
  ('salaryStatement.subtitle','salaryStatement','payroll','help','راجع راتبك الحالي واعتمده وتابع الرواتب السابقة.','Review and approve your current salary and view previous salaries.','راجع راتبك الحالي واعتمده وتابع الرواتب السابقة.','Review and approve your current salary and view previous salaries.',true,now()),
  ('salaryStatement.current','salaryStatement','payroll','tab','الكشف الحالي','Current Statement','الكشف الحالي','Current Statement',true,now()),
  ('salaryStatement.history','salaryStatement','payroll','tab','الرواتب السابقة','Previous Salaries','الرواتب السابقة','Previous Salaries',true,now()),
  ('salaryStatement.approve','salaryStatement','payroll','button','أوافق على كشف الراتب','Approve Salary Statement','أوافق على كشف الراتب','Approve Salary Statement',true,now()),
  ('commission.management.title','commissionManagement','payroll','title','إدارة العمولات','Commission Management','إدارة العمولات','Commission Management',true,now()),
  ('commission.management.subtitle','commissionManagement','payroll','help','احتساب العمولات حسب السيارة والدور والشرائح التصاعدية.','Calculate commissions by vehicle, role, and progressive tiers.','احتساب العمولات حسب السيارة والدور والشرائح التصاعدية.','Calculate commissions by vehicle, role, and progressive tiers.',true,now()),
  ('commission.management.recalculate','commissionManagement','payroll','button','إعادة احتساب العمولات','Recalculate Commissions','إعادة احتساب العمولات','Recalculate Commissions',true,now()),
  ('commissionStatement.title','commissionStatement','payroll','title','كشف العمولة','Commission Statement','كشف العمولة','Commission Statement',true,now()),
  ('commissionStatement.subtitle','commissionStatement','payroll','help','تفاصيل عمولتك الحالية وسجل العمولات السابقة.','Your current commission details and commission history.','تفاصيل عمولتك الحالية وسجل العمولات السابقة.','Your current commission details and commission history.',true,now()),
  ('commissionStatement.current','commissionStatement','payroll','tab','العمولة الحالية','Current Commission','العمولة الحالية','Current Commission',true,now()),
  ('commissionStatement.history','commissionStatement','payroll','tab','العمولات السابقة','Previous Commissions','العمولات السابقة','Previous Commissions',true,now()),
  ('payroll.reference.title','payrollReference','payroll','title','البيانات المرجعية','Reference Data','البيانات المرجعية','Reference Data',true,now()),
  ('payroll.reference.subtitle','payrollReference','payroll','help','تكويد الموظفين وربط المستخدمين ومصادر العمولات وإدارة الشرائح.','Configure employees, user links, commission sources, and tiers.','تكويد الموظفين وربط المستخدمين ومصادر العمولات وإدارة الشرائح.','Configure employees, user links, commission sources, and tiers.',true,now()),
  ('payroll.reference.type','payrollReference','payroll','label','نوع البيانات المرجعية','Reference Data Type','نوع البيانات المرجعية','Reference Data Type',true,now()),
  ('payroll.reference.employees','payrollReference','payroll','option','الموظفين','Employees','الموظفين','Employees',true,now()),
  ('payroll.reference.tiers','payrollReference','payroll','option','الشرائح','Tiers','الشرائح','Tiers',true,now()),
  ('payroll.common.month','payrollManagement','payroll','label','الشهر','Month','الشهر','Month',true,now()),
  ('payroll.common.refresh','payrollManagement','payroll','button','تحديث','Refresh','تحديث','Refresh',true,now()),
  ('payroll.common.search','payrollManagement','payroll','label','بحث','Search','بحث','Search',true,now()),
  ('payroll.common.status','payrollManagement','payroll','label','الحالة','Status','الحالة','Status',true,now()),
  ('payroll.common.all','payrollManagement','payroll','option','الكل','All','الكل','All',true,now()),
  ('payroll.common.reset','payrollManagement','payroll','button','إعادة تعيين','Reset','إعادة تعيين','Reset',true,now()),
  ('payroll.common.actions','payrollManagement','payroll','table','الإجراءات','Actions','الإجراءات','Actions',true,now()),
  ('payroll.common.notes','payrollManagement','payroll','label','ملاحظات','Notes','ملاحظات','Notes',true,now()),
  ('payroll.common.active','payrollManagement','payroll','status','مفعلة','Active','مفعلة','Active',true,now()),
  ('payroll.common.inactive','payrollManagement','payroll','status','غير مفعلة','Inactive','غير مفعلة','Inactive',true,now()),
  ('payroll.kpi.employees','payrollManagement','payroll','label','عدد الموظفين','Employees','عدد الموظفين','Employees',true,now()),
  ('payroll.kpi.base','payrollManagement','payroll','label','إجمالي الأساسي','Total Base Salary','إجمالي الأساسي','Total Base Salary',true,now()),
  ('payroll.kpi.allowances','payrollManagement','payroll','label','إجمالي البدلات','Total Allowances','إجمالي البدلات','Total Allowances',true,now()),
  ('payroll.kpi.commissions','payrollManagement','payroll','label','إجمالي العمولات','Total Commissions','إجمالي العمولات','Total Commissions',true,now()),
  ('payroll.kpi.deductions','payrollManagement','payroll','label','إجمالي الخصومات','Total Deductions','إجمالي الخصومات','Total Deductions',true,now()),
  ('payroll.kpi.net','payrollManagement','payroll','label','صافي الرواتب','Net Payroll','صافي الرواتب','Net Payroll',true,now()),
  ('payroll.col.employee','payrollManagement','payroll','table','الموظف','Employee','الموظف','Employee',true,now()),
  ('payroll.col.base','payrollManagement','payroll','table','الأساسي','Base Salary','الأساسي','Base Salary',true,now()),
  ('payroll.col.allowances','payrollManagement','payroll','table','البدلات','Allowances','البدلات','Allowances',true,now()),
  ('payroll.col.commissions','payrollManagement','payroll','table','العمولات','Commissions','العمولات','Commissions',true,now()),
  ('payroll.col.overtime','payrollManagement','payroll','table','الإضافي','Overtime / Additions','الإضافي','Overtime / Additions',true,now()),
  ('payroll.col.deductions','payrollManagement','payroll','table','الخصومات','Deductions','الخصومات','Deductions',true,now()),
  ('payroll.col.net','payrollManagement','payroll','table','الصافي','Net Salary','الصافي','Net Salary',true,now()),
  ('payroll.status.draft','payrollManagement','payroll','status','قيد التجهيز','In Preparation','قيد التجهيز','In Preparation',true,now()),
  ('payroll.status.pendingChairman','payrollManagement','payroll','status','بانتظار رئيس مجلس الإدارة','Awaiting Chairman Approval','بانتظار رئيس مجلس الإدارة','Awaiting Chairman Approval',true,now()),
  ('payroll.status.pendingEmployee','payrollManagement','payroll','status','بانتظار الموظف','Awaiting Employee Approval','بانتظار الموظف','Awaiting Employee Approval',true,now()),
  ('payroll.status.ready','payrollManagement','payroll','status','جاهز للصرف','Ready for Payment','جاهز للصرف','Ready for Payment',true,now()),
  ('payroll.status.paid','payrollManagement','payroll','status','تم الصرف','Paid','تم الصرف','Paid',true,now()),
  ('payroll.adjustment.title','payrollManagement','payroll','title','تعديل تجهيز الراتب','Edit Payroll Preparation','تعديل تجهيز الراتب','Edit Payroll Preparation',true,now()),
  ('payroll.employee.add','payrollReference','payroll','button','إضافة موظف','Add Employee','إضافة موظف','Add Employee',true,now()),
  ('payroll.employee.edit','payrollReference','payroll','button','تعديل الموظف','Edit Employee','تعديل الموظف','Edit Employee',true,now()),
  ('payroll.employee.dialogHint','payrollReference','payroll','help','اربط الموظف بالمستخدم ومصدر العمولة الصحيح.','Link the employee to the correct user and commission source.','اربط الموظف بالمستخدم ومصدر العمولة الصحيح.','Link the employee to the correct user and commission source.',true,now()),
  ('payroll.employee.name','payrollReference','payroll','label','اسم الموظف','Employee Name','اسم الموظف','Employee Name',true,now()),
  ('payroll.employee.user','payrollReference','payroll','label','المستخدم المرتبط','Linked User','المستخدم المرتبط','Linked User',true,now()),
  ('payroll.employee.baseSalary','payrollReference','payroll','label','الراتب الأساسي','Base Salary','الراتب الأساسي','Base Salary',true,now()),
  ('payroll.employee.allowances','payrollReference','payroll','label','البدلات','Allowances','البدلات','Allowances',true,now()),
  ('payroll.employee.paymentMethod','payrollReference','payroll','label','طريقة الدفع','Payment Method','طريقة الدفع','Payment Method',true,now()),
  ('payroll.employee.commissionRole','payrollReference','payroll','label','دور العمولة','Commission Role','دور العمولة','Commission Role',true,now()),
  ('payroll.employee.noCommissionRole','payrollReference','payroll','option','بدون دور عمولة','No Commission Role','بدون دور عمولة','No Commission Role',true,now()),
  ('payroll.employee.appointmentEmployee','payrollReference','payroll','label','موظف العمولة من إعدادات المواعيد','Commission Employee from Appointment Settings','موظف العمولة من إعدادات المواعيد','Commission Employee from Appointment Settings',true,now()),
  ('payroll.employee.representative','payrollReference','payroll','label','مندوب العمولة','Commission Representative','مندوب العمولة','Commission Representative',true,now()),
  ('payroll.employee.commissionEligible','payrollReference','payroll','label','مستحق للعمولة','Commission Eligible','مستحق للعمولة','Commission Eligible',true,now()),
  ('payroll.employee.active','payrollReference','payroll','label','موظف فعال','Active Employee','موظف فعال','Active Employee',true,now()),
  ('commission.kpi.sales','commissionManagement','payroll','label','إجمالي المبيعات قبل الضريبة','Total Sales Before VAT','إجمالي المبيعات قبل الضريبة','Total Sales Before VAT',true,now()),
  ('commission.kpi.total','commissionManagement','payroll','label','إجمالي العمولات','Total Commissions','إجمالي العمولات','Total Commissions',true,now()),
  ('commission.kpi.cars','commissionManagement','payroll','label','عدد السيارات','Vehicles','عدد السيارات','Vehicles',true,now()),
  ('commission.kpi.linked','commissionManagement','payroll','label','الموظفون المستحقون','Eligible Employees','الموظفون المستحقون','Eligible Employees',true,now()),
  ('commission.filter.car','commissionManagement','payroll','label','السيارة','Vehicle','السيارة','Vehicle',true,now()),
  ('commission.filter.role','commissionManagement','payroll','label','القسم','Role','القسم','Role',true,now()),
  ('commission.filter.eligibility','commissionManagement','payroll','label','الاستحقاق','Eligibility','الاستحقاق','Eligibility',true,now()),
  ('commission.role.representative','commissionManagement','payroll','status','المندوب','Representative','المندوب','Representative',true,now()),
  ('commission.role.driver','commissionManagement','payroll','status','السائق','Driver','السائق','Driver',true,now()),
  ('commission.role.groomer','commissionManagement','payroll','status','الجرومر','Groomer','الجرومر','Groomer',true,now()),
  ('commission.eligible','payrollManagement','payroll','status','مستحق','Eligible','مستحق','Eligible',true,now()),
  ('commission.notEligible','payrollManagement','payroll','status','غير مستحق','Not Eligible','غير مستحق','Not Eligible',true,now()),
  ('commission.unlinked','payrollManagement','payroll','status','غير مربوط','Unlinked','غير مربوط','Unlinked',true,now()),
  ('commission.col.car','commissionManagement','payroll','table','السيارة','Vehicle','السيارة','Vehicle',true,now()),
  ('commission.col.sales','commissionManagement','payroll','table','المبيعات قبل الضريبة','Sales Before VAT','المبيعات قبل الضريبة','Sales Before VAT',true,now()),
  ('commission.col.role','commissionManagement','payroll','table','القسم','Role','القسم','Role',true,now()),
  ('commission.col.name','commissionManagement','payroll','table','الاسم','Name','الاسم','Name',true,now()),
  ('commission.col.tier','commissionManagement','payroll','table','الشريحة','Tier','الشريحة','Tier',true,now()),
  ('commission.col.rate','commissionManagement','payroll','table','النسبة','Rate','النسبة','Rate',true,now()),
  ('commission.col.amount','commissionManagement','payroll','table','العمولة','Commission','العمولة','Commission',true,now()),
  ('commission.col.carTotal','commissionManagement','payroll','table','إجمالي عمولات السيارة','Vehicle Commission Total','إجمالي عمولات السيارة','Vehicle Commission Total',true,now()),
  ('commission.tier.from','payrollReference','payroll','label','من','From','من','From',true,now()),
  ('commission.tier.to','payrollReference','payroll','label','إلى','To','إلى','To',true,now()),
  ('commission.tier.rate','payrollReference','payroll','label','النسبة %','Rate %','النسبة %','Rate %',true,now()),
  ('commission.tier.active','payrollReference','payroll','label','تفعيل الشريحة','Enable Tier','تفعيل الشريحة','Enable Tier',true,now()),
  ('payroll.loading','payrollManagement','payroll','status','جاري التحميل...','Loading...','جاري التحميل...','Loading...',true,now()),
  ('payroll.empty','payrollManagement','payroll','empty','لا توجد بيانات.','No data available.','لا توجد بيانات.','No data available.',true,now()),
  ('payroll.current.empty','payrollManagement','payroll','empty','لا توجد رواتب جارية ضمن الفلاتر الحالية.','No current payroll matches the selected filters.','لا توجد رواتب جارية ضمن الفلاتر الحالية.','No current payroll matches the selected filters.',true,now()),
  ('payroll.reports.empty','payrollManagement','payroll','empty','لا توجد رواتب مصروفة في هذا الشهر.','No paid salaries for this month.','لا توجد رواتب مصروفة في هذا الشهر.','No paid salaries for this month.',true,now()),
  ('payroll.action.edit','payrollManagement','payroll','button','تعديل','Edit','تعديل','Edit',true,now()),
  ('payroll.action.adjust','payrollManagement','payroll','button','تعديل الإضافي والخصومات','Adjust Additions & Deductions','تعديل الإضافي والخصومات','Adjust Additions & Deductions',true,now()),
  ('payroll.action.submit','payrollManagement','payroll','button','إرسال للاعتماد','Submit for Approval','إرسال للاعتماد','Submit for Approval',true,now()),
  ('payroll.action.chairmanApprove','payrollManagement','payroll','button','اعتماد رئيس مجلس الإدارة','Chairman Approval','اعتماد رئيس مجلس الإدارة','Chairman Approval',true,now()),
  ('payroll.action.markPaid','payrollManagement','payroll','button','تم الصرف','Mark as Paid','تم الصرف','Mark as Paid',true,now()),
  ('payroll.action.reversePaid','payrollManagement','payroll','button','إلغاء الصرف','Reverse Payment','إلغاء الصرف','Reverse Payment',true,now()),
  ('payroll.action.reverseEmployee','payrollManagement','payroll','button','إلغاء موافقة الموظف','Reverse Employee Approval','إلغاء موافقة الموظف','Reverse Employee Approval',true,now()),
  ('payroll.action.reverseChairman','payrollManagement','payroll','button','إلغاء اعتماد رئيس مجلس الإدارة','Reverse Chairman Approval','إلغاء اعتماد رئيس مجلس الإدارة','Reverse Chairman Approval',true,now()),
  ('payroll.action.reverseSubmit','payrollManagement','payroll','button','إرجاع للتجهيز','Return to Preparation','إرجاع للتجهيز','Return to Preparation',true,now()),
  ('payroll.confirm.transition','payrollManagement','payroll','validation','هل تريد تنفيذ هذا الإجراء على كشف الراتب؟','Do you want to apply this action to the salary statement?','هل تريد تنفيذ هذا الإجراء على كشف الراتب؟','Do you want to apply this action to the salary statement?',true,now()),
  ('payroll.confirm.reverse','payrollManagement','payroll','validation','سيتم إلغاء المرحلة الحالية وإرجاع الراتب مرحلة واحدة فقط. هل تريد المتابعة؟','The current stage will be reversed by exactly one step. Continue?','سيتم إلغاء المرحلة الحالية وإرجاع الراتب مرحلة واحدة فقط. هل تريد المتابعة؟','The current stage will be reversed by exactly one step. Continue?',true,now()),
  ('payroll.payment.referencePrompt','payrollManagement','payroll','label','مرجع الصرف (اختياري):','Payment reference (optional):','مرجع الصرف (اختياري):','Payment reference (optional):',true,now()),
  ('payroll.saving','payrollManagement','payroll','status','جاري حفظ التغيير...','Saving changes...','جاري حفظ التغيير...','Saving changes...',true,now()),
  ('payroll.saved','payrollManagement','payroll','status','تم تحديث حالة الراتب بنجاح.','Salary status updated successfully.','تم تحديث حالة الراتب بنجاح.','Salary status updated successfully.',true,now()),
  ('payroll.adjustment.saved','payrollManagement','payroll','status','تم حفظ الإضافي والخصومات.','Additions and deductions saved.','تم حفظ الإضافي والخصومات.','Additions and deductions saved.',true,now()),
  ('payroll.prepare.confirm','payrollManagement','payroll','validation','سيتم تجهيز أو تحديث مسودات رواتب الشهر من البيانات المرجعية والعمولات الحالية. هل تريد المتابعة؟','Monthly payroll drafts will be prepared or refreshed from reference data and current commissions. Continue?','سيتم تجهيز أو تحديث مسودات رواتب الشهر من البيانات المرجعية والعمولات الحالية. هل تريد المتابعة؟','Monthly payroll drafts will be prepared or refreshed from reference data and current commissions. Continue?',true,now()),
  ('payroll.preparing','payrollManagement','payroll','status','جاري تجهيز رواتب الشهر...','Preparing monthly payroll...','جاري تجهيز رواتب الشهر...','Preparing monthly payroll...',true,now()),
  ('payroll.prepared','payrollManagement','payroll','status','تم تجهيز رواتب الشهر بنجاح.','Monthly payroll prepared successfully.','تم تجهيز رواتب الشهر بنجاح.','Monthly payroll prepared successfully.',true,now()),
  ('payroll.employee.empty','payrollReference','payroll','empty','لا يوجد موظفون مسجلون حتى الآن.','No employees have been configured yet.','لا يوجد موظفون مسجلون حتى الآن.','No employees have been configured yet.',true,now()),
  ('payroll.employee.inactive','payrollReference','payroll','status','غير فعال','Inactive','غير فعال','Inactive',true,now()),
  ('payroll.employee.saved','payrollReference','payroll','status','تم حفظ بيانات الموظف.','Employee data saved successfully.','تم حفظ بيانات الموظف.','Employee data saved successfully.',true,now()),
  ('payroll.flow.title','payrollManagement','payroll','title','مسار الاعتماد','Approval Workflow','مسار الاعتماد','Approval Workflow',true,now()),
  ('payroll.flow.chairman','payrollManagement','payroll','status','اعتماد رئيس مجلس الإدارة','Chairman Approval','اعتماد رئيس مجلس الإدارة','Chairman Approval',true,now()),
  ('payroll.flow.employee','payrollManagement','payroll','status','موافقة الموظف','Employee Approval','موافقة الموظف','Employee Approval',true,now()),
  ('payroll.flow.ready','payrollManagement','payroll','status','جاهز للصرف','Ready for Payment','جاهز للصرف','Ready for Payment',true,now()),
  ('payroll.flow.paid','payrollManagement','payroll','status','تم الصرف','Paid','تم الصرف','Paid',true,now()),
  ('salaryStatement.noCurrent','salaryStatement','payroll','empty','لا يوجد كشف راتب حالي متاح لك.','No current salary statement is available to you.','لا يوجد كشف راتب حالي متاح لك.','No current salary statement is available to you.',true,now()),
  ('salaryStatement.noHistory','salaryStatement','payroll','empty','لا توجد رواتب سابقة.','No previous salaries.','لا توجد رواتب سابقة.','No previous salaries.',true,now()),
  ('salaryStatement.unlinked','salaryStatement','payroll','empty','حساب المستخدم غير مربوط بموظف في بيانات الرواتب.','Your user account is not linked to an employee in payroll reference data.','حساب المستخدم غير مربوط بموظف في بيانات الرواتب.','Your user account is not linked to an employee in payroll reference data.',true,now()),
  ('salaryStatement.approveConfirm','salaryStatement','payroll','validation','أؤكد موافقتي على كشف الراتب الموضح. هل تريد المتابعة؟','I confirm my approval of the displayed salary statement. Continue?','أؤكد موافقتي على كشف الراتب الموضح. هل تريد المتابعة؟','I confirm my approval of the displayed salary statement. Continue?',true,now()),
  ('salaryStatement.approved','salaryStatement','payroll','status','تم اعتماد كشف الراتب وأصبح جاهزًا للصرف.','Salary statement approved and is now ready for payment.','تم اعتماد كشف الراتب وأصبح جاهزًا للصرف.','Salary statement approved and is now ready for payment.',true,now()),
  ('commission.loading','commissionManagement','payroll','status','جاري تحميل العمولات...','Loading commissions...','جاري تحميل العمولات...','Loading commissions...',true,now()),
  ('commission.empty','commissionManagement','payroll','empty','لا توجد عمولات ضمن الفلاتر الحالية.','No commissions match the selected filters.','لا توجد عمولات ضمن الفلاتر الحالية.','No commissions match the selected filters.',true,now()),
  ('commission.footer.total','commissionManagement','payroll','table','الإجمالي','Total','الإجمالي','Total',true,now()),
  ('commission.formula','commissionManagement','payroll','help','قيمة الفواتير النهائية بعد الخصم ÷ 1.15','Final invoice value after discount ÷ 1.15','قيمة الفواتير النهائية بعد الخصم ÷ 1.15','Final invoice value after discount ÷ 1.15',true,now()),
  ('commission.noTier','commissionManagement','payroll','status','لا توجد شريحة','No Tier','لا توجد شريحة','No Tier',true,now()),
  ('commission.tier','commissionManagement','payroll','label','الشريحة','Tier','الشريحة','Tier',true,now()),
  ('commission.tierShort','commissionManagement','payroll','label','ش','T','ش','T',true,now()),
  ('commission.tiersFor','commissionManagement','payroll','title','شرائح','Tiers for','شرائح','Tiers for',true,now()),
  ('commission.progressiveHint','commissionManagement','payroll','help','كل شريحة تحسب على جزء المبيعات الخاص بها فقط.','Each tier applies only to its own portion of sales.','كل شريحة تحسب على جزء المبيعات الخاص بها فقط.','Each tier applies only to its own portion of sales.',true,now()),
  ('commission.breakdown.title','commissionManagement','payroll','title','تفصيل الشرائح','Tier Breakdown','تفصيل الشرائح','Tier Breakdown',true,now()),
  ('commission.breakdown.empty','commissionManagement','payroll','empty','لا توجد عمولة مستحقة من الشرائح الحالية.','No commission is due from the current tiers.','لا توجد عمولة مستحقة من الشرائح الحالية.','No commission is due from the current tiers.',true,now()),
  ('commission.recalculate.confirm','commissionManagement','payroll','validation','سيتم إعادة احتساب عمولات الشهر من القيمة النهائية للفواتير بعد الخصم ÷ 1.15 والشرائح الحالية. هل تريد المتابعة؟','Monthly commissions will be recalculated from final invoice values after discount ÷ 1.15 using the current tiers. Continue?','سيتم إعادة احتساب عمولات الشهر من القيمة النهائية للفواتير بعد الخصم ÷ 1.15 والشرائح الحالية. هل تريد المتابعة؟','Monthly commissions will be recalculated from final invoice values after discount ÷ 1.15 using the current tiers. Continue?',true,now()),
  ('commission.recalculating','commissionManagement','payroll','status','جاري إعادة احتساب العمولات...','Recalculating commissions...','جاري إعادة احتساب العمولات...','Recalculating commissions...',true,now()),
  ('commission.recalculated','commissionManagement','payroll','status','تم تحديث العمولات بنجاح.','Commissions recalculated successfully.','تم تحديث العمولات بنجاح.','Commissions recalculated successfully.',true,now()),
  ('commission.tier.saved','commissionManagement','payroll','status','تم حفظ الشريحة.','Tier saved successfully.','تم حفظ الشريحة.','Tier saved successfully.',true,now()),
  ('commissionStatement.noCurrent','commissionStatement','payroll','empty','لا توجد عمولة محتسبة للشهر الحالي حتى الآن.','No commission has been calculated for the current month yet.','لا توجد عمولة محتسبة للشهر الحالي حتى الآن.','No commission has been calculated for the current month yet.',true,now()),
  ('commissionStatement.noHistory','commissionStatement','payroll','empty','لا توجد عمولات سابقة.','No previous commissions.','لا توجد عمولات سابقة.','No previous commissions.',true,now()),
  ('commissionStatement.notEligible','commissionStatement','payroll','empty','الموظف غير مفعّل كمستحق للعمولة.','The employee is not enabled as commission eligible.','الموظف غير مفعّل كمستحق للعمولة.','The employee is not enabled as commission eligible.',true,now()),
  ('commissionStatement.unlinked','commissionStatement','payroll','empty','حساب المستخدم غير مربوط بموظف عمولة.','Your user account is not linked to a commission employee.','حساب المستخدم غير مربوط بموظف عمولة.','Your user account is not linked to a commission employee.',true,now()),
  ('commission.searchPlaceholder','commissionManagement','payroll','placeholder','اسم الموظف أو السيارة','Employee or vehicle name','اسم الموظف أو السيارة','Employee or vehicle name',true,now()),
  ('payroll.error.databaseNotReady','payrollManagement','payroll','error','خدمة قاعدة البيانات غير جاهزة.','Database service is not ready.','خدمة قاعدة البيانات غير جاهزة.','Database service is not ready.',true,now()),
  ('payroll.error.onlineRequired','payrollManagement','payroll','error','هذه العملية تحتاج اتصالًا بالإنترنت.','This operation requires an internet connection.','هذه العملية تحتاج اتصالًا بالإنترنت.','This operation requires an internet connection.',true,now()),
  ('payroll.error.loadManagement','payrollManagement','payroll','error','تعذر تحميل إدارة الرواتب','Unable to load Payroll Management','تعذر تحميل إدارة الرواتب','Unable to load Payroll Management',true,now()),
  ('payroll.error.prepareMonth','payrollManagement','payroll','error','تعذر تجهيز رواتب الشهر','Unable to prepare monthly payroll','تعذر تجهيز رواتب الشهر','Unable to prepare monthly payroll',true,now()),
  ('payroll.error.saveAdjustments','payrollManagement','payroll','error','تعذر حفظ تعديلات الراتب','Unable to save salary adjustments','تعذر حفظ تعديلات الراتب','Unable to save salary adjustments',true,now()),
  ('payroll.error.transition','payrollManagement','payroll','error','تعذر تحديث حالة الراتب','Unable to update salary status','تعذر تحديث حالة الراتب','Unable to update salary status',true,now()),
  ('payroll.error.loadSalaryStatement','payrollManagement','payroll','error','تعذر تحميل كشف الراتب','Unable to load the salary statement','تعذر تحميل كشف الراتب','Unable to load the salary statement',true,now()),
  ('payroll.error.loadCommissionManagement','payrollManagement','payroll','error','تعذر تحميل إدارة العمولات','Unable to load Commission Management','تعذر تحميل إدارة العمولات','Unable to load Commission Management',true,now()),
  ('payroll.error.refreshCommissions','payrollManagement','payroll','error','تعذر إعادة احتساب العمولات','Unable to recalculate commissions','تعذر إعادة احتساب العمولات','Unable to recalculate commissions',true,now()),
  ('payroll.error.loadCommissionStatement','payrollManagement','payroll','error','تعذر تحميل كشف العمولة','Unable to load the commission statement','تعذر تحميل كشف العمولة','Unable to load the commission statement',true,now()),
  ('payroll.error.loadReference','payrollManagement','payroll','error','تعذر تحميل البيانات المرجعية','Unable to load reference data','تعذر تحميل البيانات المرجعية','Unable to load reference data',true,now()),
  ('payroll.error.saveEmployee','payrollManagement','payroll','error','تعذر حفظ الموظف','Unable to save employee data','تعذر حفظ الموظف','Unable to save employee data',true,now()),
  ('payroll.error.saveTier','payrollManagement','payroll','error','تعذر حفظ شريحة العمولة','Unable to save the commission tier','تعذر حفظ شريحة العمولة','Unable to save the commission tier',true,now()),
  ('payroll.db.tierOverlap','payrollManagement','payroll','error','شرائح العمولة متداخلة أو غير مرتبة.','Commission tiers overlap or are out of order.','شرائح العمولة متداخلة أو غير مرتبة.','Commission tiers overlap or are out of order.',true,now()),
  ('payroll.db.noCommissionRecalcPermission','payrollManagement','payroll','error','لا توجد صلاحية إعادة احتساب العمولات','You do not have permission to recalculate commissions.','لا توجد صلاحية إعادة احتساب العمولات','You do not have permission to recalculate commissions.',true,now()),
  ('payroll.db.noPreparePermission','payrollManagement','payroll','error','لا توجد صلاحية تجهيز الرواتب','You do not have permission to prepare payroll.','لا توجد صلاحية تجهيز الرواتب','You do not have permission to prepare payroll.',true,now()),
  ('payroll.db.noAdjustmentPermission','payrollManagement','payroll','error','لا توجد صلاحية تعديل تجهيز الرواتب','You do not have permission to edit payroll preparation.','لا توجد صلاحية تعديل تجهيز الرواتب','You do not have permission to edit payroll preparation.',true,now()),
  ('payroll.db.salaryNotFound','payrollManagement','payroll','error','كشف الراتب غير موجود','Salary statement not found.','كشف الراتب غير موجود','Salary statement not found.',true,now()),
  ('payroll.db.adjustDraftOnly','payrollManagement','payroll','error','يمكن تعديل الإضافي والخصومات أثناء التجهيز فقط','Additions and deductions can only be edited during preparation.','يمكن تعديل الإضافي والخصومات أثناء التجهيز فقط','Additions and deductions can only be edited during preparation.',true,now()),
  ('payroll.db.submitInvalidState','payrollManagement','payroll','error','لا يمكن إرسال الراتب للاعتماد من حالته الحالية','The salary cannot be submitted for approval from its current status.','لا يمكن إرسال الراتب للاعتماد من حالته الحالية','The salary cannot be submitted for approval from its current status.',true,now()),
  ('payroll.db.chairmanInvalidState','payrollManagement','payroll','error','لا يمكن اعتماد رئيس مجلس الإدارة من الحالة الحالية','Chairman approval is not allowed from the current status.','لا يمكن اعتماد رئيس مجلس الإدارة من الحالة الحالية','Chairman approval is not allowed from the current status.',true,now()),
  ('payroll.db.employeeApprovalDenied','payrollManagement','payroll','error','لا يمكنك اعتماد كشف الراتب هذا','You cannot approve this salary statement.','لا يمكنك اعتماد كشف الراتب هذا','You cannot approve this salary statement.',true,now()),
  ('payroll.db.notReadyForPayment','payrollManagement','payroll','error','الراتب غير جاهز للصرف','The salary is not ready for payment.','الراتب غير جاهز للصرف','The salary is not ready for payment.',true,now()),
  ('payroll.db.reversePaidFirst','payrollManagement','payroll','error','يجب إلغاء الصرف أولًا وبالترتيب العكسي','Payment must be reversed first, following the reverse sequence.','يجب إلغاء الصرف أولًا وبالترتيب العكسي','Payment must be reversed first, following the reverse sequence.',true,now()),
  ('payroll.db.reverseEmployeeAfterPayment','payrollManagement','payroll','error','إلغاء موافقة الموظف متاح فقط بعد إلغاء الصرف','Employee approval can only be reversed after reversing payment.','إلغاء موافقة الموظف متاح فقط بعد إلغاء الصرف','Employee approval can only be reversed after reversing payment.',true,now()),
  ('payroll.db.reverseChairmanAfterEmployee','payrollManagement','payroll','error','إلغاء اعتماد رئيس مجلس الإدارة يجب أن يتم بعد إلغاء اعتماد الموظف','Chairman approval can only be reversed after reversing employee approval.','إلغاء اعتماد رئيس مجلس الإدارة يجب أن يتم بعد إلغاء اعتماد الموظف','Chairman approval can only be reversed after reversing employee approval.',true,now()),
  ('payroll.db.reverseSubmitInvalidState','payrollManagement','payroll','error','لا يمكن إرجاع الراتب للتجهيز من الحالة الحالية','The salary cannot be returned to preparation from its current status.','لا يمكن إرجاع الراتب للتجهيز من الحالة الحالية','The salary cannot be returned to preparation from its current status.',true,now()),
  ('payroll.db.unknownAction','payrollManagement','payroll','error','إجراء راتب غير معروف','Unknown payroll action.','إجراء راتب غير معروف','Unknown payroll action.',true,now()),
  ('payroll.db.noPayrollViewPermission','payrollManagement','payroll','error','لا توجد صلاحية عرض إدارة الرواتب','You do not have permission to view Payroll Management.','لا توجد صلاحية عرض إدارة الرواتب','You do not have permission to view Payroll Management.',true,now()),
  ('payroll.db.noSalaryViewPermission','payrollManagement','payroll','error','لا توجد صلاحية عرض كشف الراتب','You do not have permission to view the salary statement.','لا توجد صلاحية عرض كشف الراتب','You do not have permission to view the salary statement.',true,now()),
  ('payroll.db.noCommissionViewPermission','payrollManagement','payroll','error','لا توجد صلاحية عرض إدارة العمولات','You do not have permission to view Commission Management.','لا توجد صلاحية عرض إدارة العمولات','You do not have permission to view Commission Management.',true,now()),
  ('payroll.db.noCommissionStatementPermission','payrollManagement','payroll','error','لا توجد صلاحية عرض كشف العمولة','You do not have permission to view the commission statement.','لا توجد صلاحية عرض كشف العمولة','You do not have permission to view the commission statement.',true,now()),
  ('payroll.db.noReferenceViewPermission','payrollManagement','payroll','error','لا توجد صلاحية عرض البيانات المرجعية للرواتب والعمولات','You do not have permission to view payroll and commission reference data.','لا توجد صلاحية عرض البيانات المرجعية للرواتب والعمولات','You do not have permission to view payroll and commission reference data.',true,now()),
  ('payroll.db.noEmployeeSavePermission','payrollManagement','payroll','error','لا توجد صلاحية حفظ الموظفين','You do not have permission to save employees.','لا توجد صلاحية حفظ الموظفين','You do not have permission to save employees.',true,now()),
  ('payroll.db.employeeRoleMismatch','payrollManagement','payroll','error','موظف العمولة المختار لا يطابق الدور','The selected commission employee does not match the role.','موظف العمولة المختار لا يطابق الدور','The selected commission employee does not match the role.',true,now()),
  ('payroll.db.invalidRepresentative','payrollManagement','payroll','error','مندوب العمولة غير صالح','The selected commission representative is invalid.','مندوب العمولة غير صالح','The selected commission representative is invalid.',true,now()),
  ('payroll.db.employeeNotFound','payrollManagement','payroll','error','الموظف غير موجود','Employee not found.','الموظف غير موجود','Employee not found.',true,now()),
  ('payroll.db.noTierEditPermission','payrollManagement','payroll','error','لا توجد صلاحية تعديل شرائح العمولات','You do not have permission to edit commission tiers.','لا توجد صلاحية تعديل شرائح العمولات','You do not have permission to edit commission tiers.',true,now()),
  ('payroll.db.invalidTier','payrollManagement','payroll','error','شريحة عمولة غير صالحة','Invalid commission tier.','شريحة عمولة غير صالحة','Invalid commission tier.',true,now()),
  ('payroll.db.invalidTierEnd','payrollManagement','payroll','error','نهاية الشريحة يجب أن تكون أكبر من بدايتها','The tier end must be greater than its start.','نهاية الشريحة يجب أن تكون أكبر من بدايتها','The tier end must be greater than its start.',true,now()),
  ('payroll.error.operation','payrollManagement','payroll','error','تعذر تنفيذ العملية','Unable to complete the operation','تعذر تنفيذ العملية','Unable to complete the operation',true,now())
on conflict(translation_key) do update set ar_text=excluded.ar_text,en_text=excluded.en_text,default_ar=excluded.default_ar,default_en=excluded.default_en,is_active=true,updated_at=now();

notify pgrst,'reload schema';
commit;

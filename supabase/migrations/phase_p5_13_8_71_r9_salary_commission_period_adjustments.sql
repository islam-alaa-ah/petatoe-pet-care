-- Phase P5.13.8.71 R9
-- Salary commission period snapshots + multiple salary adjustment line items.
-- Reuses the R8 canonical commission range engine; does not alter commission formulas.

begin;

-- ---------------------------------------------------------------------------
-- Salary statement commission-period snapshot
-- ---------------------------------------------------------------------------
alter table public.payroll_salary_statements
  add column if not exists commission_period_from date,
  add column if not exists commission_period_to date;

update public.payroll_salary_statements
set commission_period_from=coalesce(commission_period_from,payroll_month),
    commission_period_to=coalesce(commission_period_to,(payroll_month+interval '1 month - 1 day')::date)
where commission_period_from is null or commission_period_to is null;

alter table public.payroll_salary_statements
  alter column commission_period_from set not null,
  alter column commission_period_to set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='payroll_salary_commission_period_ck'
  ) then
    alter table public.payroll_salary_statements
      add constraint payroll_salary_commission_period_ck
      check(commission_period_from<=commission_period_to);
  end if;
end;
$$;

create index if not exists idx_payroll_salary_commission_period
  on public.payroll_salary_statements(commission_period_from,commission_period_to);

create or replace function public.guard_payroll_salary_commission_period_snapshot()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status<>'draft'
     and (new.commission_period_from is distinct from old.commission_period_from
          or new.commission_period_to is distinct from old.commission_period_to) then
    raise exception 'لا يمكن تغيير فترة العمولات بعد خروج الراتب من مرحلة التجهيز.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_payroll_salary_commission_period_snapshot() from public,anon;

drop trigger if exists trg_payroll_salary_commission_period_snapshot on public.payroll_salary_statements;
create trigger trg_payroll_salary_commission_period_snapshot
before update on public.payroll_salary_statements
for each row execute function public.guard_payroll_salary_commission_period_snapshot();

-- ---------------------------------------------------------------------------
-- Canonical salary adjustment line items
-- Existing overtime_amount/deductions_amount remain summary/snapshot columns.
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_salary_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  salary_statement_id uuid not null references public.payroll_salary_statements(id) on delete cascade,
  item_type text not null check(item_type in ('addition','deduction')),
  item_name text not null check(length(btrim(item_name)) between 1 and 200),
  amount numeric(14,2) not null check(amount>0),
  notes text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payroll_salary_adjustment_statement
  on public.payroll_salary_adjustment_items(salary_statement_id,item_type,sort_order,id);

-- Preserve any legacy single-value adjustments as explicit line items.
insert into public.payroll_salary_adjustment_items(
  salary_statement_id,item_type,item_name,amount,notes,sort_order,created_by,updated_by
)
select s.id,'addition','إضافي سابق',s.overtime_amount,'تم تحويل القيمة السابقة إلى بند تفصيلي أثناء ترقية النظام.',1,s.created_by,s.updated_by
from public.payroll_salary_statements s
where s.overtime_amount>0
  and not exists(select 1 from public.payroll_salary_adjustment_items i where i.salary_statement_id=s.id and i.item_type='addition');

insert into public.payroll_salary_adjustment_items(
  salary_statement_id,item_type,item_name,amount,notes,sort_order,created_by,updated_by
)
select s.id,'deduction','خصم سابق',s.deductions_amount,'تم تحويل القيمة السابقة إلى بند تفصيلي أثناء ترقية النظام.',1,s.created_by,s.updated_by
from public.payroll_salary_statements s
where s.deductions_amount>0
  and not exists(select 1 from public.payroll_salary_adjustment_items i where i.salary_statement_id=s.id and i.item_type='deduction');

alter table public.payroll_salary_adjustment_items enable row level security;

drop policy if exists "payroll adjustment items management or own" on public.payroll_salary_adjustment_items;
create policy "payroll adjustment items management or own"
on public.payroll_salary_adjustment_items for select to authenticated
using(
  public.has_screen_permission('payrollManagement','view')
  or exists(
    select 1
    from public.payroll_salary_statements s
    join public.payroll_employees e on e.id=s.employee_id
    where s.id=salary_statement_id
      and e.user_id=auth.uid()
      and s.status in ('pending_employee','ready_for_payment','paid')
  )
);

drop policy if exists "payroll adjustment items management write" on public.payroll_salary_adjustment_items;
create policy "payroll adjustment items management write"
on public.payroll_salary_adjustment_items for all to authenticated
using(
  public.has_screen_permission('payrollManagement','add')
  and exists(select 1 from public.payroll_salary_statements s where s.id=salary_statement_id and s.status='draft')
)
with check(
  public.has_screen_permission('payrollManagement','add')
  and exists(select 1 from public.payroll_salary_statements s where s.id=salary_statement_id and s.status='draft')
);

revoke insert,update,delete on public.payroll_salary_adjustment_items from authenticated;
grant select on public.payroll_salary_adjustment_items to authenticated;

-- ---------------------------------------------------------------------------
-- Prepare salary drafts using an explicitly selected commission date range.
-- The range can start before the payroll month (carry-over) but cannot consume
-- dates after the end of the payroll month.
-- ---------------------------------------------------------------------------
create or replace function public.prepare_payroll_month_range(
  p_month date,
  p_commission_from date,
  p_commission_to date
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_month date:=public.payroll_month_start(p_month);
  v_month_end date:=(public.payroll_month_start(p_month)+interval '1 month - 1 day')::date;
  v_from date:=p_commission_from;
  v_to date:=p_commission_to;
  v_count integer:=0;
begin
  if not public.has_screen_permission('payrollManagement','add') then
    raise exception 'لا توجد صلاحية تجهيز الرواتب';
  end if;
  if v_from is null or v_to is null or v_from>v_to then
    raise exception 'يجب أن يكون تاريخ بداية عمولات الراتب قبل أو مساويًا لتاريخ النهاية.';
  end if;
  if v_to>v_month_end then
    raise exception 'لا يمكن أن تنتهي فترة عمولات الراتب بعد نهاية شهر الراتب.';
  end if;

  if exists(
    select 1
    from public.payroll_salary_statements s
    where s.payroll_month=v_month
      and s.status<>'draft'
      and (s.commission_period_from<>v_from or s.commission_period_to<>v_to)
  ) then
    raise exception 'لا يمكن تغيير فترة العمولات بعد إرسال أي راتب في هذا الشهر للاعتماد.';
  end if;

  with commission_totals as (
    select employee_id,round(sum(commission_amount),2) commission_total
    from public.payroll_live_commission_rows_range(v_from,v_to)
    where employee_id is not null
    group by employee_id
  )
  insert into public.payroll_salary_statements(
    payroll_month,employee_id,employee_name_snapshot,base_salary_snapshot,allowances_snapshot,
    payment_method_snapshot,commissions_snapshot,commission_period_from,commission_period_to,
    overtime_amount,deductions_amount,net_salary,status,created_by,updated_by
  )
  select v_month,e.id,e.full_name,e.base_salary,e.allowances,e.payment_method,
         coalesce(c.commission_total,0),v_from,v_to,0,0,
         round(e.base_salary+e.allowances+coalesce(c.commission_total,0),2),'draft',auth.uid(),auth.uid()
  from public.payroll_employees e
  left join commission_totals c on c.employee_id=e.id
  where e.is_active=true
  on conflict(payroll_month,employee_id) do update set
    employee_name_snapshot=excluded.employee_name_snapshot,
    base_salary_snapshot=excluded.base_salary_snapshot,
    allowances_snapshot=excluded.allowances_snapshot,
    payment_method_snapshot=excluded.payment_method_snapshot,
    commissions_snapshot=excluded.commissions_snapshot,
    commission_period_from=excluded.commission_period_from,
    commission_period_to=excluded.commission_period_to,
    net_salary=round(
      excluded.base_salary_snapshot+excluded.allowances_snapshot+excluded.commissions_snapshot+
      public.payroll_salary_statements.overtime_amount-public.payroll_salary_statements.deductions_amount
    ,2),
    updated_by=auth.uid(),updated_at=now()
  where public.payroll_salary_statements.status='draft';

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.prepare_payroll_month_range(date,date,date) from public,anon;
grant execute on function public.prepare_payroll_month_range(date,date,date) to authenticated,service_role;

-- Backward-compatible monthly wrapper reusing the new canonical function.
create or replace function public.prepare_payroll_month(p_month date)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_month date:=public.payroll_month_start(p_month);
begin
  return public.prepare_payroll_month_range(
    v_month,
    v_month,
    (v_month+interval '1 month - 1 day')::date
  );
end;
$$;
revoke all on function public.prepare_payroll_month(date) from public,anon;
grant execute on function public.prepare_payroll_month(date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Save multiple named addition/deduction items and recalculate summary columns.
-- ---------------------------------------------------------------------------
create or replace function public.save_payroll_salary_adjustment_items(
  p_statement_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns public.payroll_salary_statements
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.payroll_salary_statements%rowtype;
  item jsonb;
  v_type text;
  v_name text;
  v_amount numeric;
  v_notes text;
  v_sort integer:=0;
  v_additions numeric:=0;
  v_deductions numeric:=0;
begin
  if not public.has_screen_permission('payrollManagement','add') then
    raise exception 'لا توجد صلاحية تعديل تجهيز الرواتب';
  end if;
  select * into s from public.payroll_salary_statements where id=p_statement_id for update;
  if not found then raise exception 'كشف الراتب غير موجود'; end if;
  if s.status<>'draft' then raise exception 'يمكن تعديل الإضافي والخصومات أثناء التجهيز فقط'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then
    raise exception 'بنود الإضافي والخصومات غير صالحة';
  end if;

  delete from public.payroll_salary_adjustment_items where salary_statement_id=p_statement_id;

  for item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_type:=nullif(btrim(coalesce(item->>'type','')),'');
    v_name:=nullif(btrim(coalesce(item->>'name','')),'');
    v_notes:=nullif(btrim(coalesce(item->>'notes','')),'');
    v_amount:=coalesce((item->>'amount')::numeric,0);
    v_sort:=v_sort+1;

    if v_type not in ('addition','deduction') then raise exception 'نوع بند الراتب غير صالح'; end if;
    if v_name is null then raise exception 'يجب كتابة اسم لكل بند إضافي أو خصم'; end if;
    if length(v_name)>200 then raise exception 'اسم بند الراتب أطول من الحد المسموح'; end if;
    if v_amount<=0 then raise exception 'قيمة بند الراتب يجب أن تكون أكبر من صفر'; end if;

    insert into public.payroll_salary_adjustment_items(
      salary_statement_id,item_type,item_name,amount,notes,sort_order,created_by,updated_by
    ) values(p_statement_id,v_type,v_name,round(v_amount,2),v_notes,v_sort,auth.uid(),auth.uid());
  end loop;

  select
    coalesce(sum(amount) filter(where item_type='addition'),0),
    coalesce(sum(amount) filter(where item_type='deduction'),0)
  into v_additions,v_deductions
  from public.payroll_salary_adjustment_items
  where salary_statement_id=p_statement_id;

  update public.payroll_salary_statements set
    overtime_amount=round(v_additions,2),
    deductions_amount=round(v_deductions,2),
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    net_salary=round(base_salary_snapshot+allowances_snapshot+commissions_snapshot+v_additions-v_deductions,2),
    updated_by=auth.uid(),updated_at=now()
  where id=p_statement_id returning * into s;

  insert into public.payroll_salary_audit(salary_statement_id,action_key,from_status,to_status,details)
  values(
    s.id,'adjustment_items_saved','draft','draft',
    jsonb_build_object(
      'additions',s.overtime_amount,
      'deductions',s.deductions_amount,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'type',i.item_type,'name',i.item_name,'amount',i.amount,'notes',coalesce(i.notes,''),'sortOrder',i.sort_order
      ) order by i.sort_order,i.created_at) from public.payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb)
    )
  );
  return s;
end;
$$;
revoke all on function public.save_payroll_salary_adjustment_items(uuid,jsonb,text) from public,anon;
grant execute on function public.save_payroll_salary_adjustment_items(uuid,jsonb,text) to authenticated,service_role;

-- Backward-compatible wrapper for stale clients.
create or replace function public.save_payroll_salary_adjustments(
  p_statement_id uuid,p_overtime numeric,p_deductions numeric,p_notes text default null
)
returns public.payroll_salary_statements
language plpgsql
security definer
set search_path=public
as $$
declare
  v_items jsonb:='[]'::jsonb;
  s public.payroll_salary_statements%rowtype;
begin
  if greatest(coalesce(p_overtime,0),0)>0 then
    v_items:=v_items||jsonb_build_array(jsonb_build_object('type','addition','name','إضافي','amount',greatest(coalesce(p_overtime,0),0),'notes',''));
  end if;
  if greatest(coalesce(p_deductions,0),0)>0 then
    v_items:=v_items||jsonb_build_array(jsonb_build_object('type','deduction','name','خصم','amount',greatest(coalesce(p_deductions,0),0),'notes',''));
  end if;
  select * into s from public.save_payroll_salary_adjustment_items(p_statement_id,v_items,p_notes);
  return s;
end;
$$;
revoke all on function public.save_payroll_salary_adjustments(uuid,numeric,numeric,text) from public,anon;
grant execute on function public.save_payroll_salary_adjustments(uuid,numeric,numeric,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Management workspace: line items + current/previous commission periods.
-- ---------------------------------------------------------------------------
create or replace function public.get_payroll_management_workspace(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_month date:=public.payroll_month_start(p_month);
  result jsonb;
begin
  if not public.has_screen_permission('payrollManagement','view') then raise exception 'لا توجد صلاحية عرض إدارة الرواتب'; end if;

  select jsonb_build_object(
    'month',v_month,
    'commissionPeriod',jsonb_build_object(
      'fromDate',(select min(commission_period_from) from public.payroll_salary_statements where payroll_month=v_month),
      'toDate',(select max(commission_period_to) from public.payroll_salary_statements where payroll_month=v_month),
      'isUniform',coalesce((select count(distinct (commission_period_from,commission_period_to))<=1 from public.payroll_salary_statements where payroll_month=v_month),true),
      'locked',coalesce((select bool_or(status<>'draft') from public.payroll_salary_statements where payroll_month=v_month),false)
    ),
    'previousCommissionPeriod',(
      select jsonb_build_object(
        'payrollMonth',p.payroll_month,
        'fromDate',p.commission_period_from,
        'toDate',p.commission_period_to,
        'status',p.status
      )
      from public.payroll_salary_statements p
      where p.payroll_month<v_month and p.commission_period_to is not null
      order by p.payroll_month desc,p.updated_at desc
      limit 1
    ),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'employeeId',s.employee_id,'employeeName',s.employee_name_snapshot,
      'paymentMethod',s.payment_method_snapshot,'baseSalary',s.base_salary_snapshot,'allowances',s.allowances_snapshot,
      'commissions',s.commissions_snapshot,'commissionFrom',s.commission_period_from,'commissionTo',s.commission_period_to,
      'overtime',s.overtime_amount,'deductions',s.deductions_amount,'netSalary',s.net_salary,
      'adjustmentItems',coalesce((select jsonb_agg(jsonb_build_object(
        'id',i.id,'type',i.item_type,'name',i.item_name,'amount',i.amount,'notes',coalesce(i.notes,''),'sortOrder',i.sort_order
      ) order by i.sort_order,i.created_at) from public.payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- Employee statement workspace: expose period and detailed line-item snapshots.
-- ---------------------------------------------------------------------------
create or replace function public.get_salary_statement_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  emp public.payroll_employees%rowtype;
  result jsonb;
begin
  if not public.has_screen_permission('salaryStatement','view') then raise exception 'لا توجد صلاحية عرض كشف الراتب'; end if;
  select * into emp from public.payroll_employees where user_id=auth.uid() and is_active=true limit 1;
  if not found then return jsonb_build_object('employee',null,'current',null,'history','[]'::jsonb); end if;

  select jsonb_build_object(
    'employee',jsonb_build_object('id',emp.id,'name',emp.full_name,'paymentMethod',emp.payment_method),
    'current',(select to_jsonb(x) from (
      select s.id,s.payroll_month "payrollMonth",s.employee_name_snapshot "employeeName",s.payment_method_snapshot "paymentMethod",
             s.base_salary_snapshot "baseSalary",s.allowances_snapshot allowances,s.commissions_snapshot commissions,
             s.commission_period_from "commissionFrom",s.commission_period_to "commissionTo",
             s.overtime_amount overtime,s.deductions_amount deductions,s.net_salary "netSalary",s.status,
             s.chairman_approved_at "chairmanApprovedAt",s.employee_approved_at "employeeApprovedAt",
             coalesce((select jsonb_agg(jsonb_build_object(
               'id',i.id,'type',i.item_type,'name',i.item_name,'amount',i.amount,'notes',coalesce(i.notes,''),'sortOrder',i.sort_order
             ) order by i.sort_order,i.created_at) from public.payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb) "adjustmentItems"
      from public.payroll_salary_statements s
      where s.employee_id=emp.id and s.status in ('pending_employee','ready_for_payment')
      order by s.payroll_month desc limit 1
    ) x),
    'history',coalesce((select jsonb_agg(to_jsonb(x) order by x."payrollMonth" desc) from (
      select s.id,s.payroll_month "payrollMonth",s.payment_method_snapshot "paymentMethod",s.base_salary_snapshot "baseSalary",
             s.allowances_snapshot allowances,s.commissions_snapshot commissions,
             s.commission_period_from "commissionFrom",s.commission_period_to "commissionTo",
             s.overtime_amount overtime,s.deductions_amount deductions,s.net_salary "netSalary",s.status,s.paid_at "paidAt",s.payment_reference "paymentReference",
             coalesce((select jsonb_agg(jsonb_build_object(
               'id',i.id,'type',i.item_type,'name',i.item_name,'amount',i.amount,'notes',coalesce(i.notes,''),'sortOrder',i.sort_order
             ) order by i.sort_order,i.created_at) from public.payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb) "adjustmentItems"
      from public.payroll_salary_statements s where s.employee_id=emp.id and s.status='paid'
    ) x),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_salary_statement_workspace() from public,anon;
grant execute on function public.get_salary_statement_workspace() to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Localization additions
-- ---------------------------------------------------------------------------
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  ar_text,en_text,default_ar,default_en,is_active,updated_at
) values
  ('payroll.commissionPeriod.title','payrollManagement','payroll','title','فترة احتساب عمولات الراتب','Salary Commission Period','فترة احتساب عمولات الراتب','Salary Commission Period',true,now()),
  ('payroll.commissionPeriod.from','payrollManagement','payroll','label','من تاريخ','From Date','من تاريخ','From Date',true,now()),
  ('payroll.commissionPeriod.to','payrollManagement','payroll','label','إلى تاريخ','To Date','إلى تاريخ','To Date',true,now()),
  ('payroll.commissionPeriod.applyHint','payrollManagement','payroll','help','يتم اعتماد الفترة عند تجهيز رواتب الشهر.','The period is adopted when the month payroll is prepared.','يتم اعتماد الفترة عند تجهيز رواتب الشهر.','The period is adopted when the month payroll is prepared.',true,now()),
  ('payroll.commissionPeriod.noPrevious','payrollManagement','payroll','help','لا توجد فترة عمولات سابقة.','No previous commission period is available.','لا توجد فترة عمولات سابقة.','No previous commission period is available.',true,now()),
  ('payroll.commissionPeriod.previous','payrollManagement','payroll','help','آخر فترة محتسبة في راتب {month}: من {from} إلى {to}.','Last period included in {month} payroll: {from} to {to}.','آخر فترة محتسبة في راتب {month}: من {from} إلى {to}.','Last period included in {month} payroll: {from} to {to}.',true,now()),
  ('payroll.commissionPeriod.suggested','payrollManagement','payroll','help','بداية الفترة التالية المقترحة: {date}.','Suggested next period start: {date}.','بداية الفترة التالية المقترحة: {date}.','Suggested next period start: {date}.',true,now()),
  ('payroll.commissionPeriod.overlap','payrollManagement','payroll','validation','تنبيه: الفترة المختارة تتداخل مع عمولات سبق احتسابها حتى {date}.','Warning: the selected period overlaps commissions already included through {date}.','تنبيه: الفترة المختارة تتداخل مع عمولات سبق احتسابها حتى {date}.','Warning: the selected period overlaps commissions already included through {date}.',true,now()),
  ('payroll.commissionPeriod.gap','payrollManagement','payroll','validation','تنبيه: توجد أيام غير محتسبة من {from} إلى {to}.','Warning: there is an uncounted gap from {from} to {to}.','تنبيه: توجد أيام غير محتسبة من {from} إلى {to}.','Warning: there is an uncounted gap from {from} to {to}.',true,now()),
  ('payroll.commissionPeriod.locked','payrollManagement','payroll','help','تم تثبيت فترة العمولات لأن بعض رواتب الشهر خرجت من مرحلة التجهيز.','The commission period is locked because some salaries have left draft status.','تم تثبيت فترة العمولات لأن بعض رواتب الشهر خرجت من مرحلة التجهيز.','The commission period is locked because some salaries have left draft status.',true,now()),
  ('payroll.commissionPeriod.statementNote','salaryStatement','payroll','help','تم احتساب العمولات عن الفترة من {from} إلى {to}.','Commissions were calculated for the period from {from} to {to}.','تم احتساب العمولات عن الفترة من {from} إلى {to}.','Commissions were calculated for the period from {from} to {to}.',true,now()),
  ('payroll.commissionPeriod.invalid','payrollManagement','payroll','validation','يجب أن يكون تاريخ بداية عمولات الراتب قبل أو مساويًا لتاريخ النهاية.','Salary commission From date must be on or before To date.','يجب أن يكون تاريخ بداية عمولات الراتب قبل أو مساويًا لتاريخ النهاية.','Salary commission From date must be on or before To date.',true,now()),
  ('payroll.commissionPeriod.endAfterMonth','payrollManagement','payroll','validation','لا يمكن أن تنتهي فترة عمولات الراتب بعد نهاية شهر الراتب.','The salary commission period cannot end after the payroll month.','لا يمكن أن تنتهي فترة عمولات الراتب بعد نهاية شهر الراتب.','The salary commission period cannot end after the payroll month.',true,now()),
  ('payroll.adjustment.additions','payrollManagement','payroll','title','بنود الإضافي','Addition Items','بنود الإضافي','Addition Items',true,now()),
  ('payroll.adjustment.deductions','payrollManagement','payroll','title','بنود الخصومات','Deduction Items','بنود الخصومات','Deduction Items',true,now()),
  ('payroll.adjustment.addAddition','payrollManagement','payroll','button','+ إضافة بند إضافي','+ Add Addition Item','+ إضافة بند إضافي','+ Add Addition Item',true,now()),
  ('payroll.adjustment.addDeduction','payrollManagement','payroll','button','+ إضافة بند خصم','+ Add Deduction Item','+ إضافة بند خصم','+ Add Deduction Item',true,now()),
  ('payroll.adjustment.itemName','payrollManagement','payroll','label','البيان','Description','البيان','Description',true,now()),
  ('payroll.adjustment.itemAmount','payrollManagement','payroll','label','القيمة','Amount','القيمة','Amount',true,now()),
  ('payroll.adjustment.itemNotes','payrollManagement','payroll','label','ملاحظات البند','Item Notes','ملاحظات البند','Item Notes',true,now()),
  ('payroll.adjustment.remove','payrollManagement','payroll','button','حذف البند','Remove Item','حذف البند','Remove Item',true,now()),
  ('payroll.adjustment.invalidItems','payrollManagement','payroll','validation','اكتب بيانًا وقيمة أكبر من صفر لكل بند.','Enter a description and an amount greater than zero for each item.','اكتب بيانًا وقيمة أكبر من صفر لكل بند.','Enter a description and an amount greater than zero for each item.',true,now()),
  ('salaryStatement.adjustmentDetails','salaryStatement','payroll','title','تفاصيل الإضافات والخصومات','Addition & Deduction Details','تفاصيل الإضافات والخصومات','Addition & Deduction Details',true,now()),
  ('payroll.table.total','payrollManagement','payroll','label','الإجمالي','Total','الإجمالي','Total',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,module_name=excluded.module_name,text_type=excluded.text_type,
  ar_text=excluded.ar_text,en_text=excluded.en_text,default_ar=excluded.default_ar,default_en=excluded.default_en,
  is_active=true,updated_at=now();

notify pgrst,'reload schema';
commit;

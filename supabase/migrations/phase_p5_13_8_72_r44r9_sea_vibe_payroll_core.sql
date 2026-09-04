-- PETATOE P5.13.8.72R44R9 — SEA VIBE payroll core workflow
-- Scope:
--   * Independent SEA VIBE monthly salary statements, adjustment items and audit trail.
--   * Independent prepare -> chairman -> employee (when linked) -> payment workflow.
--   * Salary commission snapshot sourced only from SEA VIBE automatic trip commissions.
--   * Add stable SEA VIBE employee snapshot to automatic commission expenses.
--   * Reuse existing payroll visual/interaction pattern without touching global payroll tables/functions.
-- No pruning / retention / shared sync-engine changes.
begin;

-- ---------------------------------------------------------------------------
-- Stable employee identity snapshot on SEA VIBE automatic commission expenses.
-- R44R7 stored beneficiary name but not the employee UUID. R44R9 adds the UUID
-- so salary aggregation cannot be corrupted by later commission-rule edits.
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_expenses
  add column if not exists commission_employee_id_snapshot uuid references public.sea_vibe_employees(id) on delete set null;

-- Safe compatibility backfill only when the rule has not changed after the
-- expense was created and the beneficiary snapshot still matches exactly.
update public.sea_vibe_expenses e
set commission_employee_id_snapshot=r.employee_id
from public.sea_vibe_commission_rules r
where e.commission_employee_id_snapshot is null
  and e.commission_rule_id=r.id
  and e.is_system_generated=true
  and e.system_key like 'commission:%'
  and e.commission_beneficiary_type_snapshot='employee'
  and r.beneficiary_type='employee'
  and r.employee_id is not null
  and btrim(coalesce(e.commission_beneficiary_name_snapshot,''))=btrim(coalesce(r.beneficiary_name,''))
  and r.updated_at<=e.created_at;

-- Historical rows whose employee cannot be proven are not guessed. Abort the
-- whole migration so Production cannot start payroll with ambiguous commission ownership.
do $$
begin
  if exists(
    select 1
    from public.sea_vibe_expenses e
    where e.is_system_generated=true
      and e.system_key like 'commission:%'
      and e.commission_beneficiary_type_snapshot='employee'
      and e.commission_employee_id_snapshot is null
  ) then
    raise exception 'R44R9_EXISTING_EMPLOYEE_COMMISSION_EXPENSES_REQUIRE_EXPLICIT_MAPPING';
  end if;
end;
$$;

-- Keep the canonical R44R7 function name/trigger contract; only enrich future
-- automatic commission expenses with the stable SEA VIBE employee snapshot.
create or replace function public.sea_vibe_seed_trip_commissions_r44r7(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.sea_vibe_trips%rowtype;
  v_catalog uuid;
  v_rule record;
  v_amount numeric(14,2);
begin
  select * into v_trip from public.sea_vibe_trips where id=p_trip_id;
  if not found then return; end if;
  select id into v_catalog from public.sea_vibe_expense_catalog where system_key='automatic_commission' limit 1;
  if v_catalog is null then raise exception 'SEA_VIBE_COMMISSION_EXPENSE_CATALOG_MISSING'; end if;

  for v_rule in
    select r.*
    from public.sea_vibe_commission_rules r
    join public.sea_vibe_commission_rule_trip_types l on l.commission_rule_id=r.id
    where r.is_active=true and l.trip_type_id=v_trip.trip_type_id
    order by r.created_at,r.id
  loop
    v_amount:=case when v_rule.calculation_type='percentage'
      then round((v_trip.total_value*v_rule.calculation_value/100.0)::numeric,2)
      else round(v_rule.calculation_value::numeric,2) end;

    insert into public.sea_vibe_expenses(
      expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
      is_system_generated,system_key,created_by,updated_by,
      commission_rule_id,commission_name_ar_snapshot,commission_name_en_snapshot,
      commission_beneficiary_type_snapshot,commission_beneficiary_name_snapshot,
      commission_calculation_type_snapshot,commission_calculation_value_snapshot,commission_trip_value_snapshot,
      commission_employee_id_snapshot
    ) values(
      'trip',v_trip.id,v_catalog,v_trip.trip_date,v_amount,null,
      'المستفيد: '||v_rule.beneficiary_name,
      true,'commission:'||v_rule.id::text,coalesce(v_trip.created_by,auth.uid()),auth.uid(),
      v_rule.id,v_rule.name_ar,v_rule.name_en,v_rule.beneficiary_type,v_rule.beneficiary_name,
      v_rule.calculation_type,v_rule.calculation_value,v_trip.total_value,
      case when v_rule.beneficiary_type='employee' then v_rule.employee_id else null end
    )
    on conflict(trip_id,system_key) where trip_id is not null and system_key is not null do nothing;
  end loop;
end;
$$;
revoke all on function public.sea_vibe_seed_trip_commissions_r44r7(uuid) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Canonical independent SEA VIBE salary domain.
-- ---------------------------------------------------------------------------
create table if not exists public.sea_vibe_payroll_salary_statements (
  id uuid primary key default gen_random_uuid(),
  payroll_month date not null check(payroll_month=date_trunc('month',payroll_month)::date),
  employee_id uuid not null references public.sea_vibe_employees(id) on delete restrict,
  employee_name_snapshot text not null,
  base_salary_snapshot numeric(14,2) not null default 0,
  allowances_snapshot numeric(14,2) not null default 0,
  payment_method_snapshot text not null,
  commissions_snapshot numeric(14,2) not null default 0,
  commission_period_from date not null,
  commission_period_to date not null,
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
  constraint sea_vibe_payroll_salary_month_employee_uq unique(payroll_month,employee_id),
  constraint sea_vibe_payroll_commission_period_ck check(commission_period_from<=commission_period_to)
);
create index if not exists idx_sea_vibe_payroll_salary_month_status
  on public.sea_vibe_payroll_salary_statements(payroll_month,status);
create index if not exists idx_sea_vibe_payroll_salary_employee_month
  on public.sea_vibe_payroll_salary_statements(employee_id,payroll_month desc);

create table if not exists public.sea_vibe_payroll_salary_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  salary_statement_id uuid not null references public.sea_vibe_payroll_salary_statements(id) on delete cascade,
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
create index if not exists idx_sea_vibe_payroll_adjustment_statement
  on public.sea_vibe_payroll_salary_adjustment_items(salary_statement_id,item_type,sort_order,id);

-- Immutable commission source lines used to explain each salary commission snapshot.
create table if not exists public.sea_vibe_payroll_salary_commission_items (
  id uuid primary key default gen_random_uuid(),
  salary_statement_id uuid not null references public.sea_vibe_payroll_salary_statements(id) on delete cascade,
  source_expense_id uuid not null references public.sea_vibe_expenses(id) on delete restrict,
  trip_id uuid references public.sea_vibe_trips(id) on delete set null,
  commission_rule_id uuid references public.sea_vibe_commission_rules(id) on delete set null,
  commission_name_snapshot text not null,
  beneficiary_name_snapshot text not null,
  source_expense_date date not null,
  amount numeric(14,2) not null check(amount>=0),
  created_at timestamptz not null default now(),
  constraint sea_vibe_payroll_salary_commission_item_uq unique(salary_statement_id,source_expense_id)
);
create index if not exists idx_sea_vibe_payroll_salary_commission_statement
  on public.sea_vibe_payroll_salary_commission_items(salary_statement_id,source_expense_date,id);

create table if not exists public.sea_vibe_payroll_salary_audit (
  id uuid primary key default gen_random_uuid(),
  salary_statement_id uuid not null references public.sea_vibe_payroll_salary_statements(id) on delete cascade,
  action_key text not null,
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  action_by uuid references auth.users(id) on delete set null default auth.uid(),
  action_at timestamptz not null default now()
);
create index if not exists idx_sea_vibe_payroll_salary_audit_statement
  on public.sea_vibe_payroll_salary_audit(salary_statement_id,action_at desc);

-- ---------------------------------------------------------------------------
-- RLS. Direct financial writes are disabled; all changes go through RPCs.
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_payroll_salary_statements enable row level security;
alter table public.sea_vibe_payroll_salary_adjustment_items enable row level security;
alter table public.sea_vibe_payroll_salary_commission_items enable row level security;
alter table public.sea_vibe_payroll_salary_audit enable row level security;

drop policy if exists "sea vibe payroll salary read" on public.sea_vibe_payroll_salary_statements;
create policy "sea vibe payroll salary read" on public.sea_vibe_payroll_salary_statements
for select to authenticated using(
  public.has_screen_permission('seaVibePayrollManagement','view')
  or exists(
    select 1 from public.sea_vibe_employees e
    where e.id=employee_id and e.user_id=auth.uid()
  )
);

drop policy if exists "sea vibe payroll adjustment read" on public.sea_vibe_payroll_salary_adjustment_items;
create policy "sea vibe payroll adjustment read" on public.sea_vibe_payroll_salary_adjustment_items
for select to authenticated using(
  exists(
    select 1
    from public.sea_vibe_payroll_salary_statements s
    join public.sea_vibe_employees e on e.id=s.employee_id
    where s.id=salary_statement_id
      and (
        public.has_screen_permission('seaVibePayrollManagement','view')
        or e.user_id=auth.uid()
      )
  )
);

drop policy if exists "sea vibe payroll commission item read" on public.sea_vibe_payroll_salary_commission_items;
create policy "sea vibe payroll commission item read" on public.sea_vibe_payroll_salary_commission_items
for select to authenticated using(
  exists(
    select 1
    from public.sea_vibe_payroll_salary_statements s
    join public.sea_vibe_employees e on e.id=s.employee_id
    where s.id=salary_statement_id
      and (
        public.has_screen_permission('seaVibePayrollManagement','view')
        or e.user_id=auth.uid()
      )
  )
);

drop policy if exists "sea vibe payroll audit read" on public.sea_vibe_payroll_salary_audit;
create policy "sea vibe payroll audit read" on public.sea_vibe_payroll_salary_audit
for select to authenticated using(public.has_screen_permission('seaVibePayrollManagement','view'));

revoke insert,update,delete on public.sea_vibe_payroll_salary_statements from authenticated;
revoke insert,update,delete on public.sea_vibe_payroll_salary_adjustment_items from authenticated;
revoke insert,update,delete on public.sea_vibe_payroll_salary_commission_items from authenticated;
revoke insert,update,delete on public.sea_vibe_payroll_salary_audit from authenticated;
grant select on public.sea_vibe_payroll_salary_statements to authenticated;
grant select on public.sea_vibe_payroll_salary_adjustment_items to authenticated;
grant select on public.sea_vibe_payroll_salary_commission_items to authenticated;
grant select on public.sea_vibe_payroll_salary_audit to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_payroll_month_start_r44r9(p_month date)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select date_trunc('month',coalesce(p_month,current_date))::date
$$;
revoke all on function public.sea_vibe_payroll_month_start_r44r9(date) from public,anon;
grant execute on function public.sea_vibe_payroll_month_start_r44r9(date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Prepare / refresh salary drafts using an explicit SEA VIBE commission range.
-- Percentage/fixed commission amounts are already snapshotted as trip expenses;
-- this function only aggregates employee-owned automatic commission expenses.
-- ---------------------------------------------------------------------------
create or replace function public.prepare_sea_vibe_payroll_month_range_r44r9(
  p_month date,
  p_commission_from date,
  p_commission_to date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date:=public.sea_vibe_payroll_month_start_r44r9(p_month);
  v_month_end date:=(public.sea_vibe_payroll_month_start_r44r9(p_month)+interval '1 month - 1 day')::date;
  v_from date:=p_commission_from;
  v_to date:=p_commission_to;
  v_count integer:=0;
begin
  if not public.has_screen_permission('seaVibePayrollManagement','add') then
    raise exception 'SEA_VIBE_PAYROLL_PREPARE_PERMISSION_REQUIRED';
  end if;
  if v_from is null or v_to is null or v_from>v_to then
    raise exception 'SEA_VIBE_PAYROLL_COMMISSION_PERIOD_INVALID';
  end if;
  if v_to>v_month_end then
    raise exception 'SEA_VIBE_PAYROLL_COMMISSION_PERIOD_AFTER_MONTH_END';
  end if;

  if exists(
    select 1
    from public.sea_vibe_payroll_salary_statements s
    where s.payroll_month=v_month
      and s.status<>'draft'
      and (s.commission_period_from<>v_from or s.commission_period_to<>v_to)
  ) then
    raise exception 'SEA_VIBE_PAYROLL_COMMISSION_PERIOD_LOCKED';
  end if;

  insert into public.sea_vibe_payroll_salary_statements(
    payroll_month,employee_id,employee_name_snapshot,base_salary_snapshot,allowances_snapshot,
    payment_method_snapshot,commissions_snapshot,commission_period_from,commission_period_to,
    overtime_amount,deductions_amount,net_salary,status,created_by,updated_by
  )
  select v_month,e.id,e.full_name,e.base_salary,e.allowances,e.payment_method,
         0,v_from,v_to,0,0,round(e.base_salary+e.allowances,2),'draft',auth.uid(),auth.uid()
  from public.sea_vibe_employees e
  where e.is_active=true
  on conflict(payroll_month,employee_id) do update set
    employee_name_snapshot=excluded.employee_name_snapshot,
    base_salary_snapshot=excluded.base_salary_snapshot,
    allowances_snapshot=excluded.allowances_snapshot,
    payment_method_snapshot=excluded.payment_method_snapshot,
    commission_period_from=excluded.commission_period_from,
    commission_period_to=excluded.commission_period_to,
    updated_by=auth.uid(),updated_at=now()
  where public.sea_vibe_payroll_salary_statements.status='draft';

  get diagnostics v_count=row_count;

  -- Rebuild auditable commission source lines only for salary drafts.
  delete from public.sea_vibe_payroll_salary_commission_items ci
  using public.sea_vibe_payroll_salary_statements s
  where ci.salary_statement_id=s.id
    and s.payroll_month=v_month
    and s.status='draft';

  insert into public.sea_vibe_payroll_salary_commission_items(
    salary_statement_id,source_expense_id,trip_id,commission_rule_id,
    commission_name_snapshot,beneficiary_name_snapshot,source_expense_date,amount
  )
  select
    s.id,e.id,e.trip_id,e.commission_rule_id,
    coalesce(nullif(btrim(e.commission_name_ar_snapshot),''),'عمولة'),
    coalesce(nullif(btrim(e.commission_beneficiary_name_snapshot),''),s.employee_name_snapshot),
    e.expense_date,round(e.amount,2)
  from public.sea_vibe_payroll_salary_statements s
  join public.sea_vibe_expenses e
    on e.commission_employee_id_snapshot=s.employee_id
   and e.expense_scope='trip'
   and e.is_system_generated=true
   and e.system_key like 'commission:%'
   and e.commission_beneficiary_type_snapshot='employee'
   and e.expense_date between v_from and v_to
  where s.payroll_month=v_month
    and s.status='draft';

  update public.sea_vibe_payroll_salary_statements s
  set commissions_snapshot=coalesce((
        select round(sum(ci.amount),2)
        from public.sea_vibe_payroll_salary_commission_items ci
        where ci.salary_statement_id=s.id
      ),0),
      net_salary=round(
        s.base_salary_snapshot+s.allowances_snapshot+
        coalesce((select sum(ci.amount) from public.sea_vibe_payroll_salary_commission_items ci where ci.salary_statement_id=s.id),0)+
        s.overtime_amount-s.deductions_amount
      ,2),
      updated_by=auth.uid(),updated_at=now()
  where s.payroll_month=v_month and s.status='draft';

  return v_count;
end;
$$;
revoke all on function public.prepare_sea_vibe_payroll_month_range_r44r9(date,date,date) from public,anon;
grant execute on function public.prepare_sea_vibe_payroll_month_range_r44r9(date,date,date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Named additions/deductions while a salary is still draft.
-- ---------------------------------------------------------------------------
create or replace function public.save_sea_vibe_payroll_salary_adjustment_items_r44r9(
  p_statement_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns public.sea_vibe_payroll_salary_statements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.sea_vibe_payroll_salary_statements%rowtype;
  item jsonb;
  v_type text;
  v_name text;
  v_amount numeric;
  v_notes text;
  v_sort integer:=0;
  v_additions numeric:=0;
  v_deductions numeric:=0;
begin
  if not public.has_screen_permission('seaVibePayrollManagement','add') then
    raise exception 'SEA_VIBE_PAYROLL_ADJUST_PERMISSION_REQUIRED';
  end if;
  select * into s from public.sea_vibe_payroll_salary_statements where id=p_statement_id for update;
  if not found then raise exception 'SEA_VIBE_PAYROLL_STATEMENT_NOT_FOUND'; end if;
  if s.status<>'draft' then raise exception 'SEA_VIBE_PAYROLL_ADJUST_DRAFT_ONLY'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then
    raise exception 'SEA_VIBE_PAYROLL_ADJUST_ITEMS_INVALID';
  end if;

  delete from public.sea_vibe_payroll_salary_adjustment_items where salary_statement_id=p_statement_id;

  for item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_type:=nullif(btrim(coalesce(item->>'type','')),'');
    v_name:=nullif(btrim(coalesce(item->>'name','')),'');
    v_notes:=nullif(btrim(coalesce(item->>'notes','')),'');
    begin v_amount:=coalesce((item->>'amount')::numeric,0); exception when others then v_amount:=0; end;
    v_sort:=v_sort+1;

    if v_type not in ('addition','deduction') then raise exception 'SEA_VIBE_PAYROLL_ADJUST_TYPE_INVALID'; end if;
    if v_name is null then raise exception 'SEA_VIBE_PAYROLL_ADJUST_NAME_REQUIRED'; end if;
    if length(v_name)>200 then raise exception 'SEA_VIBE_PAYROLL_ADJUST_NAME_TOO_LONG'; end if;
    if v_amount<=0 then raise exception 'SEA_VIBE_PAYROLL_ADJUST_AMOUNT_INVALID'; end if;

    insert into public.sea_vibe_payroll_salary_adjustment_items(
      salary_statement_id,item_type,item_name,amount,notes,sort_order,created_by,updated_by
    ) values(p_statement_id,v_type,v_name,round(v_amount,2),v_notes,v_sort,auth.uid(),auth.uid());
  end loop;

  select
    coalesce(sum(amount) filter(where item_type='addition'),0),
    coalesce(sum(amount) filter(where item_type='deduction'),0)
  into v_additions,v_deductions
  from public.sea_vibe_payroll_salary_adjustment_items
  where salary_statement_id=p_statement_id;

  update public.sea_vibe_payroll_salary_statements set
    overtime_amount=round(v_additions,2),
    deductions_amount=round(v_deductions,2),
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    net_salary=round(base_salary_snapshot+allowances_snapshot+commissions_snapshot+v_additions-v_deductions,2),
    updated_by=auth.uid(),updated_at=now()
  where id=p_statement_id returning * into s;

  insert into public.sea_vibe_payroll_salary_audit(salary_statement_id,action_key,from_status,to_status,details)
  values(
    s.id,'adjustment_items_saved','draft','draft',
    jsonb_build_object(
      'additions',s.overtime_amount,
      'deductions',s.deductions_amount,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'type',i.item_type,'name',i.item_name,'amount',i.amount,'notes',coalesce(i.notes,''),'sortOrder',i.sort_order
      ) order by i.sort_order,i.created_at) from public.sea_vibe_payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb)
    )
  );
  return s;
end;
$$;
revoke all on function public.save_sea_vibe_payroll_salary_adjustment_items_r44r9(uuid,jsonb,text) from public,anon;
grant execute on function public.save_sea_vibe_payroll_salary_adjustment_items_r44r9(uuid,jsonb,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Approval / payment workflow. Employees without linked users skip self approval
-- exactly like the canonical main payroll workflow, but entirely in SEA VIBE tables.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_payroll_salary_transition_r44r9(
  p_statement_id uuid,
  p_action text,
  p_reference text default null
)
returns public.sea_vibe_payroll_salary_statements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.sea_vibe_payroll_salary_statements%rowtype;
  own_user uuid;
  old_status text;
  next_status text;
  employee_approval_skipped boolean:=false;
begin
  select * into s from public.sea_vibe_payroll_salary_statements where id=p_statement_id for update;
  if not found then raise exception 'SEA_VIBE_PAYROLL_STATEMENT_NOT_FOUND'; end if;
  select user_id into own_user from public.sea_vibe_employees where id=s.employee_id;
  old_status:=s.status;

  if p_action='submit' then
    if not public.has_screen_permission('seaVibePayrollManagement','add') or s.status<>'draft' then
      raise exception 'SEA_VIBE_PAYROLL_SUBMIT_INVALID';
    end if;
    next_status:='pending_chairman';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,submitted_at=now(),submitted_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
    where id=s.id;

  elsif p_action='chairman_approve' then
    if not public.has_screen_permission('seaVibePayrollManagement','edit') or s.status<>'pending_chairman' then
      raise exception 'SEA_VIBE_PAYROLL_CHAIRMAN_APPROVE_INVALID';
    end if;
    if own_user is null then
      next_status:='ready_for_payment';
      employee_approval_skipped:=true;
      update public.sea_vibe_payroll_salary_statements set
        status=next_status,chairman_approved_at=now(),chairman_approved_by=auth.uid(),
        employee_approved_at=null,employee_approved_by=null,updated_by=auth.uid(),updated_at=now()
      where id=s.id;
    else
      next_status:='pending_employee';
      update public.sea_vibe_payroll_salary_statements set
        status=next_status,chairman_approved_at=now(),chairman_approved_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
      where id=s.id;
    end if;

  elsif p_action='employee_approve' then
    if s.status<>'pending_employee' or own_user is distinct from auth.uid() then
      raise exception 'SEA_VIBE_PAYROLL_EMPLOYEE_APPROVE_FORBIDDEN';
    end if;
    next_status:='ready_for_payment';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,employee_approved_at=now(),employee_approved_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
    where id=s.id;

  elsif p_action='mark_paid' then
    if not public.has_screen_permission('seaVibePayrollManagement','edit') or s.status<>'ready_for_payment' then
      raise exception 'SEA_VIBE_PAYROLL_MARK_PAID_INVALID';
    end if;
    next_status:='paid';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,paid_at=now(),paid_by=auth.uid(),payment_reference=nullif(btrim(coalesce(p_reference,'')),''),
      updated_by=auth.uid(),updated_at=now()
    where id=s.id;

  elsif p_action='reverse_paid' then
    if not public.has_screen_permission('seaVibePayrollManagement','delete') or s.status<>'paid' then
      raise exception 'SEA_VIBE_PAYROLL_REVERSE_PAID_INVALID';
    end if;
    next_status:='ready_for_payment';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,paid_at=null,paid_by=null,payment_reference=null,updated_by=auth.uid(),updated_at=now()
    where id=s.id;

  elsif p_action='reverse_employee' then
    if not public.has_screen_permission('seaVibePayrollManagement','delete') or s.status<>'ready_for_payment' or own_user is null then
      raise exception 'SEA_VIBE_PAYROLL_REVERSE_EMPLOYEE_INVALID';
    end if;
    next_status:='pending_employee';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,employee_approved_at=null,employee_approved_by=null,updated_by=auth.uid(),updated_at=now()
    where id=s.id;

  elsif p_action='reverse_chairman_ready' then
    if not public.has_screen_permission('seaVibePayrollManagement','delete') or s.status<>'ready_for_payment' or own_user is not null then
      raise exception 'SEA_VIBE_PAYROLL_REVERSE_CHAIRMAN_READY_INVALID';
    end if;
    next_status:='pending_chairman';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,chairman_approved_at=null,chairman_approved_by=null,
      employee_approved_at=null,employee_approved_by=null,updated_by=auth.uid(),updated_at=now()
    where id=s.id;

  elsif p_action='reverse_chairman' then
    if not public.has_screen_permission('seaVibePayrollManagement','delete') or s.status<>'pending_employee' then
      raise exception 'SEA_VIBE_PAYROLL_REVERSE_CHAIRMAN_INVALID';
    end if;
    next_status:='pending_chairman';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,chairman_approved_at=null,chairman_approved_by=null,updated_by=auth.uid(),updated_at=now()
    where id=s.id;

  elsif p_action='reverse_submit' then
    if not public.has_screen_permission('seaVibePayrollManagement','delete') or s.status<>'pending_chairman' then
      raise exception 'SEA_VIBE_PAYROLL_REVERSE_SUBMIT_INVALID';
    end if;
    next_status:='draft';
    update public.sea_vibe_payroll_salary_statements set
      status=next_status,submitted_at=null,submitted_by=null,updated_by=auth.uid(),updated_at=now()
    where id=s.id;
  else
    raise exception 'SEA_VIBE_PAYROLL_ACTION_UNKNOWN';
  end if;

  insert into public.sea_vibe_payroll_salary_audit(salary_statement_id,action_key,from_status,to_status,details)
  values(
    s.id,p_action,old_status,next_status,
    jsonb_build_object(
      'reference',nullif(btrim(coalesce(p_reference,'')),''),
      'employeeApprovalSkipped',employee_approval_skipped,
      'employeeLinkedUserId',own_user
    )
  );

  select * into s from public.sea_vibe_payroll_salary_statements where id=p_statement_id;
  return s;
end;
$$;
revoke all on function public.sea_vibe_payroll_salary_transition_r44r9(uuid,text,text) from public,anon;
grant execute on function public.sea_vibe_payroll_salary_transition_r44r9(uuid,text,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Management workspace.
-- ---------------------------------------------------------------------------
create or replace function public.get_sea_vibe_payroll_management_workspace_r44r9(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date:=public.sea_vibe_payroll_month_start_r44r9(p_month);
  result jsonb;
begin
  if not public.has_screen_permission('seaVibePayrollManagement','view') then
    raise exception 'SEA_VIBE_PAYROLL_MANAGEMENT_VIEW_PERMISSION_REQUIRED';
  end if;

  select jsonb_build_object(
    'month',v_month,
    'commissionPeriod',jsonb_build_object(
      'fromDate',(select min(commission_period_from) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),
      'toDate',(select max(commission_period_to) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),
      'isUniform',coalesce((select count(distinct (commission_period_from,commission_period_to))<=1 from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),true),
      'locked',coalesce((select bool_or(status<>'draft') from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),false)
    ),
    'previousCommissionPeriod',(
      select jsonb_build_object(
        'payrollMonth',p.payroll_month,
        'fromDate',p.commission_period_from,
        'toDate',p.commission_period_to,
        'status',p.status
      )
      from public.sea_vibe_payroll_salary_statements p
      where p.payroll_month<v_month
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
      ) order by i.sort_order,i.created_at) from public.sea_vibe_payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb),
      'status',s.status,'notes',coalesce(s.notes,''),'submittedAt',s.submitted_at,'chairmanApprovedAt',s.chairman_approved_at,
      'employeeApprovedAt',s.employee_approved_at,'paidAt',s.paid_at,'paymentReference',coalesce(s.payment_reference,''),
      'requiresEmployeeApproval',exists(select 1 from public.sea_vibe_employees e where e.id=s.employee_id and e.user_id is not null)
    ) order by s.employee_name_snapshot) from public.sea_vibe_payroll_salary_statements s where s.payroll_month=v_month),'[]'::jsonb),
    'summary',jsonb_build_object(
      'employees',(select count(*) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),
      'baseSalary',coalesce((select sum(base_salary_snapshot) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),0),
      'allowances',coalesce((select sum(allowances_snapshot) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),0),
      'commissions',coalesce((select sum(commissions_snapshot) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),0),
      'overtime',coalesce((select sum(overtime_amount) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),0),
      'deductions',coalesce((select sum(deductions_amount) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),0),
      'netSalary',coalesce((select sum(net_salary) from public.sea_vibe_payroll_salary_statements where payroll_month=v_month),0)
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_sea_vibe_payroll_management_workspace_r44r9(date) from public,anon;
grant execute on function public.get_sea_vibe_payroll_management_workspace_r44r9(date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Employee self-service salary statement.
-- ---------------------------------------------------------------------------
create or replace function public.get_sea_vibe_salary_statement_workspace_r44r9()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  emp public.sea_vibe_employees%rowtype;
  result jsonb;
begin
  if not public.has_screen_permission('seaVibeSalaryStatement','view') then
    raise exception 'SEA_VIBE_SALARY_STATEMENT_VIEW_PERMISSION_REQUIRED';
  end if;

  select * into emp from public.sea_vibe_employees where user_id=auth.uid() and is_active=true limit 1;
  if not found then
    return jsonb_build_object('employee',null,'current',null,'history','[]'::jsonb);
  end if;

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
             ) order by i.sort_order,i.created_at) from public.sea_vibe_payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb) "adjustmentItems"
      from public.sea_vibe_payroll_salary_statements s
      where s.employee_id=emp.id and s.status in ('pending_employee','ready_for_payment')
      order by s.payroll_month desc limit 1
    ) x),
    'history',coalesce((select jsonb_agg(to_jsonb(x) order by x."payrollMonth" desc) from (
      select s.id,s.payroll_month "payrollMonth",s.payment_method_snapshot "paymentMethod",s.base_salary_snapshot "baseSalary",
             s.allowances_snapshot allowances,s.commissions_snapshot commissions,
             s.commission_period_from "commissionFrom",s.commission_period_to "commissionTo",
             s.overtime_amount overtime,s.deductions_amount deductions,s.net_salary "netSalary",s.status,
             s.paid_at "paidAt",s.payment_reference "paymentReference",
             coalesce((select jsonb_agg(jsonb_build_object(
               'id',i.id,'type',i.item_type,'name',i.item_name,'amount',i.amount,'notes',coalesce(i.notes,''),'sortOrder',i.sort_order
             ) order by i.sort_order,i.created_at) from public.sea_vibe_payroll_salary_adjustment_items i where i.salary_statement_id=s.id),'[]'::jsonb) "adjustmentItems"
      from public.sea_vibe_payroll_salary_statements s
      where s.employee_id=emp.id and s.status='paid'
    ) x),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_sea_vibe_salary_statement_workspace_r44r9() from public,anon;
grant execute on function public.get_sea_vibe_salary_statement_workspace_r44r9() to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Production verification: read-only health snapshot for this phase.
-- ---------------------------------------------------------------------------
create or replace function public.get_sea_vibe_payroll_core_verification_r44r9()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (
    public.has_screen_permission('seaVibePayrollManagement','view')
    or public.has_screen_permission('seaVibePayrollReference','view')
  ) then
    raise exception 'SEA_VIBE_PAYROLL_VERIFICATION_VIEW_PERMISSION_REQUIRED';
  end if;

  return jsonb_build_object(
    'phase','R44R9',
    'employeeCount',(select count(*) from public.sea_vibe_employees),
    'activeEmployeeCount',(select count(*) from public.sea_vibe_employees where is_active=true),
    'salaryStatementCount',(select count(*) from public.sea_vibe_payroll_salary_statements),
    'openSalaryStatementCount',(select count(*) from public.sea_vibe_payroll_salary_statements where status<>'paid'),
    'unmappedEmployeeCommissionExpenseCount',(
      select count(*) from public.sea_vibe_expenses
      where is_system_generated=true
        and system_key like 'commission:%'
        and commission_beneficiary_type_snapshot='employee'
        and commission_employee_id_snapshot is null
    ),
    'globalPayrollChanged',false,
    'pruningChanged',false
  );
end;
$$;
revoke all on function public.get_sea_vibe_payroll_core_verification_r44r9() from public,anon;
grant execute on function public.get_sea_vibe_payroll_core_verification_r44r9() to authenticated,service_role;

comment on table public.sea_vibe_payroll_salary_statements is
'R44R9 independent SEA VIBE salary statements. No dependency on global payroll salary tables.';
comment on column public.sea_vibe_expenses.commission_employee_id_snapshot is
'R44R9 immutable employee identity used by SEA VIBE payroll aggregation for automatic trip commissions.';

commit;

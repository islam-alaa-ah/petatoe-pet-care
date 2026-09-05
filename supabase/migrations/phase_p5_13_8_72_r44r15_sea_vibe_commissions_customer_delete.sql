-- PETATOE P5.13.8.72R44R15 — SEA VIBE commission management + safe customer delete
-- Scope:
--   * Activate independent SEA VIBE commission management and commission statement workspaces.
--   * Preserve commission source-of-truth in automatic trip expense snapshots; no parallel commission ledger.
--   * Add permanent customer usage guard so a customer can be deleted only when never used by any trip.
--   * No global payroll, shared sync-engine, pruning, retention, fuel, permit, invoice, or appointment changes.
begin;

-- ---------------------------------------------------------------------------
-- 1) Permanent SEA VIBE customer usage marker.
--    Once a customer has been linked to a trip, deletion remains blocked even if
--    the trip is later changed or removed. This mirrors the immutable-usage
--    protection already used for commission-rule deletion.
-- ---------------------------------------------------------------------------
create table if not exists public.sea_vibe_customer_usage_r44r15 (
  customer_id uuid primary key references public.sea_vibe_customers(id) on delete restrict,
  first_trip_id uuid not null,
  last_trip_id uuid not null,
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

insert into public.sea_vibe_customer_usage_r44r15(
  customer_id,first_trip_id,last_trip_id,first_used_at,last_used_at
)
select
  t.customer_id,
  (array_agg(t.id order by t.created_at,t.id))[1],
  (array_agg(t.id order by coalesce(t.updated_at,t.created_at) desc,t.id desc))[1],
  min(t.created_at),
  max(coalesce(t.updated_at,t.created_at))
from public.sea_vibe_trips t
where t.customer_id is not null
group by t.customer_id
on conflict(customer_id) do update set
  last_trip_id=excluded.last_trip_id,
  last_used_at=greatest(public.sea_vibe_customer_usage_r44r15.last_used_at,excluded.last_used_at);

create or replace function public.sea_vibe_track_customer_usage_r44r15()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.customer_id is null then
    return new;
  end if;

  insert into public.sea_vibe_customer_usage_r44r15(
    customer_id,first_trip_id,last_trip_id,first_used_at,last_used_at
  ) values(
    new.customer_id,new.id,new.id,
    coalesce(new.created_at,now()),coalesce(new.updated_at,new.created_at,now())
  )
  on conflict(customer_id) do update set
    last_trip_id=excluded.last_trip_id,
    last_used_at=greatest(public.sea_vibe_customer_usage_r44r15.last_used_at,excluded.last_used_at);

  return new;
end;
$$;

drop trigger if exists trg_sea_vibe_track_customer_usage_r44r15 on public.sea_vibe_trips;
create trigger trg_sea_vibe_track_customer_usage_r44r15
after insert or update of customer_id on public.sea_vibe_trips
for each row
when (new.customer_id is not null)
execute function public.sea_vibe_track_customer_usage_r44r15();

alter table public.sea_vibe_customer_usage_r44r15 enable row level security;
revoke all on table public.sea_vibe_customer_usage_r44r15 from public,anon,authenticated;
revoke all on function public.sea_vibe_track_customer_usage_r44r15() from public,anon,authenticated;

-- Super Admin gets the delete action for the SEA VIBE customer screen. Other
-- roles remain opt-in through the existing permission matrix.
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values('super_admin'::public.app_role,'seaVibeCustomers',true,true,true,true,true)
on conflict(role,screen_key) do update set
  can_view=true,
  can_add=true,
  can_edit=true,
  can_delete=true,
  can_export=true,
  updated_at=now();

-- Canonical customer read endpoint enriched with immutable usage state.
create or replace function public.get_sea_vibe_customers_r44r15()
returns table(
  id uuid,
  customer_number text,
  full_name text,
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  has_been_used boolean
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not (
    public.has_screen_permission('seaVibeCustomers','view')
    or public.has_screen_permission('seaVibeTrips','view')
    or public.has_screen_permission('seaVibeTripNew','view')
  ) then
    raise exception 'SEA_VIBE_CUSTOMERS_VIEW_PERMISSION_REQUIRED';
  end if;

  return query
  select
    c.id,c.customer_number,c.full_name,c.notes,c.is_active,c.created_at,c.updated_at,
    exists(select 1 from public.sea_vibe_customer_usage_r44r15 u where u.customer_id=c.id)
      or exists(select 1 from public.sea_vibe_trips t where t.customer_id=c.id) as has_been_used
  from public.sea_vibe_customers c
  order by c.full_name,c.customer_number,c.id;
end;
$$;
revoke all on function public.get_sea_vibe_customers_r44r15() from public,anon;
grant execute on function public.get_sea_vibe_customers_r44r15() to authenticated,service_role;

create or replace function public.delete_sea_vibe_customer_r44r15(p_customer_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_customer public.sea_vibe_customers%rowtype;
begin
  if not public.has_screen_permission('seaVibeCustomers','delete') then
    raise exception 'SEA_VIBE_CUSTOMER_DELETE_PERMISSION_REQUIRED';
  end if;
  if p_customer_id is null then
    raise exception 'SEA_VIBE_CUSTOMER_ID_REQUIRED';
  end if;

  select * into v_customer
  from public.sea_vibe_customers
  where id=p_customer_id
  for update;

  if not found then
    raise exception 'SEA_VIBE_CUSTOMER_NOT_FOUND';
  end if;

  if exists(select 1 from public.sea_vibe_customer_usage_r44r15 where customer_id=p_customer_id)
     or exists(select 1 from public.sea_vibe_trips where customer_id=p_customer_id) then
    raise exception 'SEA_VIBE_CUSTOMER_USED_DELETE_BLOCKED';
  end if;

  delete from public.sea_vibe_customers where id=p_customer_id;
  return true;
end;
$$;
revoke all on function public.delete_sea_vibe_customer_r44r15(uuid) from public,anon;
grant execute on function public.delete_sea_vibe_customer_r44r15(uuid) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 2) SEA VIBE Commission Management.
--    Automatic commission trip expenses remain the only financial source.
--    This workspace only reads and explains those immutable snapshots and their
--    salary linkage; it does not create a second commission calculation engine.
-- ---------------------------------------------------------------------------
create or replace function public.get_sea_vibe_commission_management_workspace_r44r15(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.has_screen_permission('seaVibeCommissionManagement','view') then
    raise exception 'SEA_VIBE_COMMISSION_MANAGEMENT_VIEW_PERMISSION_REQUIRED';
  end if;
  if p_from is null or p_to is null or p_from>p_to then
    raise exception 'SEA_VIBE_COMMISSION_RANGE_INVALID';
  end if;

  with commission_rows as (
    select
      e.id as source_expense_id,
      e.trip_id,
      t.trip_serial,
      t.trip_date,
      t.trip_type_id,
      tt.name_ar as trip_type_name_ar,
      tt.name_en as trip_type_name_en,
      e.commission_rule_id,
      coalesce(nullif(btrim(e.commission_name_ar_snapshot),''),r.name_ar,'عمولة') as commission_name_ar,
      coalesce(nullif(btrim(e.commission_name_en_snapshot),''),r.name_en,'Commission') as commission_name_en,
      coalesce(e.commission_beneficiary_type_snapshot,r.beneficiary_type,'broker') as beneficiary_type,
      coalesce(nullif(btrim(e.commission_beneficiary_name_snapshot),''),r.beneficiary_name,'—') as beneficiary_name,
      e.commission_employee_id_snapshot as employee_id,
      coalesce(e.commission_calculation_type_snapshot,r.calculation_type,'fixed') as calculation_type,
      coalesce(e.commission_calculation_value_snapshot,r.calculation_value,e.amount) as calculation_value,
      coalesce(e.commission_trip_value_snapshot,t.total_value,0)::numeric(14,2) as trip_value,
      round(e.amount,2)::numeric(14,2) as amount,
      coalesce(payroll.links,'[]'::jsonb) as payroll_links
    from public.sea_vibe_expenses e
    join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    left join public.sea_vibe_commission_rules r on r.id=e.commission_rule_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'salaryStatementId',s.id,
          'payrollMonth',s.payroll_month,
          'status',s.status
        ) order by s.payroll_month desc,s.created_at desc
      ) as links
      from public.sea_vibe_payroll_salary_commission_items ci
      join public.sea_vibe_payroll_salary_statements s on s.id=ci.salary_statement_id
      where ci.source_expense_id=e.id
    ) payroll on true
    where e.expense_scope='trip'
      and e.is_system_generated=true
      and e.system_key like 'commission:%'
      and e.expense_date between p_from and p_to
  )
  select jsonb_build_object(
    'fromDate',p_from,
    'toDate',p_to,
    'summary',jsonb_build_object(
      'lineCount',count(*),
      'tripCount',count(distinct trip_id),
      'totalCommissions',coalesce(round(sum(amount),2),0),
      'employeeCommissions',coalesce(round(sum(amount) filter(where beneficiary_type='employee'),2),0),
      'brokerCommissions',coalesce(round(sum(amount) filter(where beneficiary_type='broker'),2),0),
      'payrollLinkedCount',count(*) filter(where beneficiary_type='employee' and jsonb_array_length(payroll_links)>0),
      'payrollPendingCount',count(*) filter(where beneficiary_type='employee' and jsonb_array_length(payroll_links)=0)
    ),
    'rows',coalesce(jsonb_agg(
      jsonb_build_object(
        'sourceExpenseId',source_expense_id,
        'tripId',trip_id,
        'tripSerial',trip_serial,
        'tripDate',trip_date,
        'tripTypeId',trip_type_id,
        'tripTypeNameAr',trip_type_name_ar,
        'tripTypeNameEn',trip_type_name_en,
        'commissionRuleId',commission_rule_id,
        'commissionNameAr',commission_name_ar,
        'commissionNameEn',commission_name_en,
        'beneficiaryType',beneficiary_type,
        'beneficiaryName',beneficiary_name,
        'employeeId',employee_id,
        'calculationType',calculation_type,
        'calculationValue',calculation_value,
        'tripValue',trip_value,
        'amount',amount,
        'payrollLinked',jsonb_array_length(payroll_links)>0,
        'payrollLinks',payroll_links
      ) order by trip_date desc,trip_serial desc,beneficiary_name,commission_name_ar
    ),'[]'::jsonb)
  ) into v_result
  from commission_rows;

  return coalesce(v_result,jsonb_build_object(
    'fromDate',p_from,'toDate',p_to,
    'summary',jsonb_build_object('lineCount',0,'tripCount',0,'totalCommissions',0,'employeeCommissions',0,'brokerCommissions',0,'payrollLinkedCount',0,'payrollPendingCount',0),
    'rows','[]'::jsonb
  ));
end;
$$;
revoke all on function public.get_sea_vibe_commission_management_workspace_r44r15(date,date) from public,anon;
grant execute on function public.get_sea_vibe_commission_management_workspace_r44r15(date,date) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3) SEA VIBE Commission Statement.
--    Ordinary users can only see their own employee commission statement.
--    Super Admin gets an all-beneficiaries operational view, matching the
--    established payroll commission statement exception.
-- ---------------------------------------------------------------------------
create or replace function public.get_sea_vibe_commission_statement_workspace_r44r15()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_employee public.sea_vibe_employees%rowtype;
  v_month_start date:=date_trunc('month',current_date)::date;
  v_month_end date:=(date_trunc('month',current_date)+interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  if not public.has_screen_permission('seaVibeCommissionStatement','view') then
    raise exception 'SEA_VIBE_COMMISSION_STATEMENT_VIEW_PERMISSION_REQUIRED';
  end if;

  if public.current_user_role()='super_admin'::public.app_role then
    select jsonb_build_object(
      'mode','admin',
      'employee',null,
      'month',v_month_start,
      'current',coalesce((
        select jsonb_agg(jsonb_build_object(
          'sourceExpenseId',e.id,
          'tripId',e.trip_id,
          'tripSerial',t.trip_serial,
          'tripDate',t.trip_date,
          'commissionNameAr',coalesce(nullif(btrim(e.commission_name_ar_snapshot),''),'عمولة'),
          'commissionNameEn',coalesce(nullif(btrim(e.commission_name_en_snapshot),''),'Commission'),
          'beneficiaryType',e.commission_beneficiary_type_snapshot,
          'beneficiaryName',e.commission_beneficiary_name_snapshot,
          'employeeId',e.commission_employee_id_snapshot,
          'calculationType',e.commission_calculation_type_snapshot,
          'calculationValue',e.commission_calculation_value_snapshot,
          'tripValue',e.commission_trip_value_snapshot,
          'amount',round(e.amount,2)
        ) order by e.expense_date desc,t.trip_serial desc,e.commission_beneficiary_name_snapshot)
        from public.sea_vibe_expenses e
        join public.sea_vibe_trips t on t.id=e.trip_id
        where e.expense_scope='trip'
          and e.is_system_generated=true
          and e.system_key like 'commission:%'
          and e.expense_date between v_month_start and v_month_end
      ),'[]'::jsonb),
      'history',coalesce((
        select jsonb_agg(jsonb_build_object(
          'month',h.month_start,
          'beneficiaryType',h.beneficiary_type,
          'beneficiaryName',h.beneficiary_name,
          'tripCount',h.trip_count,
          'lineCount',h.line_count,
          'commissionAmount',h.commission_amount
        ) order by h.month_start desc,h.beneficiary_name)
        from (
          select
            date_trunc('month',e.expense_date)::date as month_start,
            coalesce(e.commission_beneficiary_type_snapshot,'broker') as beneficiary_type,
            coalesce(nullif(btrim(e.commission_beneficiary_name_snapshot),''),'—') as beneficiary_name,
            count(distinct e.trip_id) as trip_count,
            count(*) as line_count,
            round(sum(e.amount),2) as commission_amount
          from public.sea_vibe_expenses e
          where e.expense_scope='trip'
            and e.is_system_generated=true
            and e.system_key like 'commission:%'
            and e.expense_date<v_month_start
          group by 1,2,3
        ) h
      ),'[]'::jsonb)
    ) into v_result;
    return v_result;
  end if;

  select * into v_employee
  from public.sea_vibe_employees
  where user_id=auth.uid() and is_active=true
  limit 1;

  if not found then
    return jsonb_build_object(
      'mode','employee',
      'employee',null,
      'month',v_month_start,
      'current','[]'::jsonb,
      'history','[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'mode','employee',
    'employee',jsonb_build_object('id',v_employee.id,'name',v_employee.full_name),
    'month',v_month_start,
    'current',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceExpenseId',e.id,
        'tripId',e.trip_id,
        'tripSerial',t.trip_serial,
        'tripDate',t.trip_date,
        'commissionNameAr',coalesce(nullif(btrim(e.commission_name_ar_snapshot),''),'عمولة'),
        'commissionNameEn',coalesce(nullif(btrim(e.commission_name_en_snapshot),''),'Commission'),
        'calculationType',e.commission_calculation_type_snapshot,
        'calculationValue',e.commission_calculation_value_snapshot,
        'tripValue',e.commission_trip_value_snapshot,
        'amount',round(e.amount,2)
      ) order by e.expense_date desc,t.trip_serial desc)
      from public.sea_vibe_expenses e
      join public.sea_vibe_trips t on t.id=e.trip_id
      where e.expense_scope='trip'
        and e.is_system_generated=true
        and e.system_key like 'commission:%'
        and e.commission_beneficiary_type_snapshot='employee'
        and e.commission_employee_id_snapshot=v_employee.id
        and e.expense_date between v_month_start and v_month_end
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'month',h.month_start,
        'tripCount',h.trip_count,
        'lineCount',h.line_count,
        'commissionAmount',h.commission_amount
      ) order by h.month_start desc)
      from (
        select
          date_trunc('month',e.expense_date)::date as month_start,
          count(distinct e.trip_id) as trip_count,
          count(*) as line_count,
          round(sum(e.amount),2) as commission_amount
        from public.sea_vibe_expenses e
        where e.expense_scope='trip'
          and e.is_system_generated=true
          and e.system_key like 'commission:%'
          and e.commission_beneficiary_type_snapshot='employee'
          and e.commission_employee_id_snapshot=v_employee.id
          and e.expense_date<v_month_start
        group by 1
      ) h
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.get_sea_vibe_commission_statement_workspace_r44r15() from public,anon;
grant execute on function public.get_sea_vibe_commission_statement_workspace_r44r15() to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 4) Verification helper — read-only and Super-Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.get_sea_vibe_commission_customer_verification_r44r15()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if public.current_user_role()<>'super_admin'::public.app_role then
    raise exception 'SEA_VIBE_R44R15_SUPER_ADMIN_REQUIRED';
  end if;
  return jsonb_build_object(
    'phase','R44R15',
    'customerCount',(select count(*) from public.sea_vibe_customers),
    'usedCustomerCount',(select count(*) from public.sea_vibe_customer_usage_r44r15),
    'commissionExpenseCount',(select count(*) from public.sea_vibe_expenses where is_system_generated=true and system_key like 'commission:%'),
    'employeeCommissionExpenseCount',(select count(*) from public.sea_vibe_expenses where is_system_generated=true and system_key like 'commission:%' and commission_beneficiary_type_snapshot='employee'),
    'brokerCommissionExpenseCount',(select count(*) from public.sea_vibe_expenses where is_system_generated=true and system_key like 'commission:%' and commission_beneficiary_type_snapshot='broker'),
    'globalPayrollChanged',false,
    'pruningChanged',false
  );
end;
$$;
revoke all on function public.get_sea_vibe_commission_customer_verification_r44r15() from public,anon;
grant execute on function public.get_sea_vibe_commission_customer_verification_r44r15() to authenticated,service_role;

comment on table public.sea_vibe_customer_usage_r44r15 is
'R44R15 immutable SEA VIBE customer-use marker. Once a customer is used by a trip, deletion remains blocked permanently.';
comment on function public.get_sea_vibe_commission_management_workspace_r44r15(date,date) is
'R44R15 read-only SEA VIBE commission management workspace sourced exclusively from automatic trip commission expense snapshots.';
comment on function public.get_sea_vibe_commission_statement_workspace_r44r15() is
'R44R15 independent SEA VIBE commission statement. Ordinary users see only their linked employee record; Super Admin sees all beneficiaries.';

notify pgrst,'reload schema';
commit;

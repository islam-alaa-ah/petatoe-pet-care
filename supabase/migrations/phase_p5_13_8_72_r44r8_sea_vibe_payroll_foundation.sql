-- PETATOE P5.13.8.72R44R8 — SEA VIBE payroll & commissions foundation
-- Scope:
--   * Independent SEA VIBE employee master and payroll navigation foundation.
--   * Rebind R44R7 employee commission beneficiaries from global payroll_employees to sea_vibe_employees.
--   * No payroll salary/commission statement calculations yet; those remain a later controlled phase.
--   * Global payroll domain remains untouched.
-- No pruning / retention / shared sync-engine changes.
begin;

-- ---------------------------------------------------------------------------
-- Permission screens: independent SEA VIBE payroll domain.
-- ---------------------------------------------------------------------------
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active) values
('seaVibePayrollManagement','إدارة الرواتب SEA VIBE','SEA VIBE - الرواتب والعمولات',158,true),
('seaVibeSalaryStatement','كشف الراتب SEA VIBE','SEA VIBE - الرواتب والعمولات',159,true),
('seaVibeCommissionManagement','إدارة العمولات SEA VIBE','SEA VIBE - الرواتب والعمولات',160,true),
('seaVibeCommissionStatement','كشف العمولة SEA VIBE','SEA VIBE - الرواتب والعمولات',161,true),
('seaVibePayrollReference','البيانات المرجعية للرواتب SEA VIBE','SEA VIBE - الرواتب والعمولات',162,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

-- New SEA VIBE payroll screens stay opt-in except Super Admin.
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,s.screen_key,true,true,true,true,true
from (values
  ('seaVibePayrollManagement'),
  ('seaVibeSalaryStatement'),
  ('seaVibeCommissionManagement'),
  ('seaVibeCommissionStatement'),
  ('seaVibePayrollReference')
) s(screen_key)
on conflict(role,screen_key) do update set
  can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true,updated_at=now();

-- ---------------------------------------------------------------------------
-- Canonical independent SEA VIBE employee master.
-- ---------------------------------------------------------------------------
create table if not exists public.sea_vibe_employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check(nullif(btrim(full_name),'') is not null),
  user_id uuid unique references public.user_profiles(id) on delete set null,
  base_salary numeric(14,2) not null default 0 check(base_salary>=0),
  allowances numeric(14,2) not null default 0 check(allowances>=0),
  payment_method text not null default 'تحويل بنكي' check(nullif(btrim(payment_method),'') is not null),
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sea_vibe_employees_active_name on public.sea_vibe_employees(is_active,full_name);

create or replace function public.sea_vibe_touch_employee_r44r8()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at:=now();
  new.updated_by:=auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_sea_vibe_employee_touch_r44r8 on public.sea_vibe_employees;
create trigger trg_sea_vibe_employee_touch_r44r8
before update on public.sea_vibe_employees
for each row execute function public.sea_vibe_touch_employee_r44r8();

alter table public.sea_vibe_employees enable row level security;
drop policy if exists "sea vibe payroll employees read" on public.sea_vibe_employees;
create policy "sea vibe payroll employees read" on public.sea_vibe_employees
for select to authenticated using(
  public.has_screen_permission('seaVibePayrollReference','view')
  or public.has_screen_permission('seaVibeReference','view')
  or public.has_screen_permission('seaVibeCommissionManagement','view')
  or user_id=auth.uid()
);

-- Direct writes are intentionally disabled; employee changes go through the server-side RPC.
revoke insert,update,delete on public.sea_vibe_employees from authenticated;
grant select on public.sea_vibe_employees to authenticated;

-- ---------------------------------------------------------------------------
-- Foundation reference workspace and employee save RPC.
-- ---------------------------------------------------------------------------
create or replace function public.get_sea_vibe_payroll_reference_workspace_r44r8()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.has_screen_permission('seaVibePayrollReference','view') then
    raise exception 'SEA_VIBE_PAYROLL_REFERENCE_VIEW_PERMISSION_REQUIRED';
  end if;
  select jsonb_build_object(
    'employees',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,
      'fullName',e.full_name,
      'userId',e.user_id,
      'baseSalary',e.base_salary,
      'allowances',e.allowances,
      'paymentMethod',e.payment_method,
      'isActive',e.is_active,
      'notes',coalesce(e.notes,''),
      'createdAt',e.created_at,
      'updatedAt',e.updated_at
    ) order by e.full_name) from public.sea_vibe_employees e),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object(
      'id',u.id,'fullName',u.full_name,'email',u.email,'isActive',u.is_active
    ) order by u.full_name) from public.user_profiles u where u.is_active=true),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_sea_vibe_payroll_reference_workspace_r44r8() from public,anon;
grant execute on function public.get_sea_vibe_payroll_reference_workspace_r44r8() to authenticated,service_role;

create or replace function public.save_sea_vibe_employee_r44r8(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_name text:=btrim(coalesce(p_record->>'fullName',''));
  v_user_id uuid;
  v_base numeric:=greatest(coalesce(nullif(p_record->>'baseSalary','')::numeric,0),0);
  v_allowances numeric:=greatest(coalesce(nullif(p_record->>'allowances','')::numeric,0),0);
  v_payment_method text:=btrim(coalesce(nullif(p_record->>'paymentMethod',''),'تحويل بنكي'));
  v_is_active boolean:=coalesce(nullif(p_record->>'isActive','')::boolean,true);
  v_notes text:=nullif(btrim(coalesce(p_record->>'notes','')),'');
begin
  begin v_id:=nullif(p_record->>'id','')::uuid; exception when others then v_id:=null; end;
  begin v_user_id:=nullif(p_record->>'userId','')::uuid; exception when others then v_user_id:=null; end;

  if v_id is null then
    if not public.has_screen_permission('seaVibePayrollReference','add') then
      raise exception 'SEA_VIBE_PAYROLL_REFERENCE_ADD_PERMISSION_REQUIRED';
    end if;
  else
    if not public.has_screen_permission('seaVibePayrollReference','edit') then
      raise exception 'SEA_VIBE_PAYROLL_REFERENCE_EDIT_PERMISSION_REQUIRED';
    end if;
    if not exists(select 1 from public.sea_vibe_employees where id=v_id) then
      raise exception 'SEA_VIBE_EMPLOYEE_NOT_FOUND';
    end if;
  end if;

  if v_name='' then raise exception 'SEA_VIBE_EMPLOYEE_NAME_REQUIRED'; end if;
  if v_payment_method='' then raise exception 'SEA_VIBE_EMPLOYEE_PAYMENT_METHOD_REQUIRED'; end if;
  if v_user_id is not null and not exists(select 1 from public.user_profiles where id=v_user_id and is_active=true) then
    raise exception 'SEA_VIBE_EMPLOYEE_USER_INVALID';
  end if;
  if v_user_id is not null and exists(
    select 1 from public.sea_vibe_employees e where e.user_id=v_user_id and (v_id is null or e.id<>v_id)
  ) then raise exception 'SEA_VIBE_EMPLOYEE_USER_ALREADY_LINKED'; end if;

  if v_id is null then
    insert into public.sea_vibe_employees(
      full_name,user_id,base_salary,allowances,payment_method,is_active,notes,created_by,updated_by
    ) values(
      v_name,v_user_id,round(v_base,2),round(v_allowances,2),v_payment_method,v_is_active,v_notes,auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.sea_vibe_employees set
      full_name=v_name,
      user_id=v_user_id,
      base_salary=round(v_base,2),
      allowances=round(v_allowances,2),
      payment_method=v_payment_method,
      is_active=v_is_active,
      notes=v_notes,
      updated_by=auth.uid(),
      updated_at=now()
    where id=v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_sea_vibe_employee_r44r8(jsonb) from public,anon;
grant execute on function public.save_sea_vibe_employee_r44r8(jsonb) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- R44R7 employee commission beneficiary rebind.
-- Fail closed if Production already contains employee-based R44R7 rules because
-- an independent SEA VIBE employee cannot be inferred safely from global payroll.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists(
    select 1 from public.sea_vibe_commission_rules
    where beneficiary_type='employee' and employee_id is not null
  ) then
    raise exception 'R44R8_EXISTING_EMPLOYEE_COMMISSION_RULES_REQUIRE_EXPLICIT_MAPPING';
  end if;
end;
$$;

do $$
declare v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  join pg_class t on t.oid=c.conrelid
  join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public'
    and t.relname='sea_vibe_commission_rules'
    and c.contype='f'
    and pg_get_constraintdef(c.oid) ilike '%employee_id%payroll_employees%'
  limit 1;
  if v_constraint is not null then
    execute format('alter table public.sea_vibe_commission_rules drop constraint %I',v_constraint);
  end if;
end;
$$;

alter table public.sea_vibe_commission_rules
  drop constraint if exists sea_vibe_commission_rules_employee_id_fkey;
alter table public.sea_vibe_commission_rules
  add constraint sea_vibe_commission_rules_employee_id_fkey
  foreign key(employee_id) references public.sea_vibe_employees(id) on delete restrict;

-- Keep the R44R7 RPC name stable so existing SEA VIBE UI/service contracts do not fork.
create or replace function public.sea_vibe_commission_employee_options_r44r7()
returns table(id uuid,full_name text)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not (
    public.has_screen_permission('seaVibeReference','view')
    or public.has_screen_permission('seaVibeCommissionManagement','view')
    or public.has_screen_permission('seaVibePayrollReference','view')
  ) then
    raise exception 'SEA_VIBE_COMMISSION_EMPLOYEE_VIEW_PERMISSION_REQUIRED';
  end if;
  return query
    select e.id,e.full_name
    from public.sea_vibe_employees e
    where e.is_active=true
    order by e.full_name;
end;
$$;
revoke all on function public.sea_vibe_commission_employee_options_r44r7() from public,anon;
grant execute on function public.sea_vibe_commission_employee_options_r44r7() to authenticated;

create or replace function public.sea_vibe_save_commission_rule_r44r7(
  p_id uuid,
  p_name_ar text,
  p_name_en text,
  p_beneficiary_type text,
  p_employee_id uuid,
  p_broker_name text,
  p_calculation_type text,
  p_calculation_value numeric,
  p_trip_type_ids uuid[],
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid:=p_id;
  v_name_ar text:=btrim(coalesce(p_name_ar,''));
  v_name_en text:=btrim(coalesce(p_name_en,''));
  v_beneficiary_type text:=lower(btrim(coalesce(p_beneficiary_type,'')));
  v_calculation_type text:=lower(btrim(coalesce(p_calculation_type,'')));
  v_beneficiary_name text;
  v_broker_name text:=nullif(btrim(coalesce(p_broker_name,'')),'');
  v_trip_type_ids uuid[]:=coalesce(p_trip_type_ids,'{}'::uuid[]);
  v_distinct_count integer;
begin
  if v_id is null then
    if not public.has_screen_permission('seaVibeReference','add') then raise exception 'SEA_VIBE_REFERENCE_ADD_PERMISSION_REQUIRED'; end if;
  else
    if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'SEA_VIBE_REFERENCE_EDIT_PERMISSION_REQUIRED'; end if;
    if not exists(select 1 from public.sea_vibe_commission_rules where id=v_id) then raise exception 'SEA_VIBE_COMMISSION_RULE_NOT_FOUND'; end if;
  end if;
  if v_name_ar='' then raise exception 'SEA_VIBE_COMMISSION_NAME_REQUIRED'; end if;
  if v_beneficiary_type not in ('employee','broker') then raise exception 'SEA_VIBE_COMMISSION_BENEFICIARY_TYPE_INVALID'; end if;
  if v_calculation_type not in ('percentage','fixed') then raise exception 'SEA_VIBE_COMMISSION_CALCULATION_TYPE_INVALID'; end if;
  if coalesce(p_calculation_value,-1)<0 then raise exception 'SEA_VIBE_COMMISSION_VALUE_INVALID'; end if;
  if v_calculation_type='percentage' and p_calculation_value>100 then raise exception 'SEA_VIBE_COMMISSION_PERCENTAGE_INVALID'; end if;

  select count(distinct trip_type_id) into v_distinct_count
  from unnest(v_trip_type_ids) as u(trip_type_id);
  if coalesce(v_distinct_count,0)=0 then raise exception 'SEA_VIBE_COMMISSION_TRIP_TYPE_REQUIRED'; end if;
  if exists(
    select 1 from unnest(v_trip_type_ids) as u(trip_type_id)
    left join public.sea_vibe_trip_types t on t.id=u.trip_type_id
    where t.id is null
  ) then raise exception 'SEA_VIBE_COMMISSION_TRIP_TYPE_INVALID'; end if;

  if v_beneficiary_type='employee' then
    if p_employee_id is null then raise exception 'SEA_VIBE_COMMISSION_EMPLOYEE_REQUIRED'; end if;
    select full_name into v_beneficiary_name
    from public.sea_vibe_employees
    where id=p_employee_id and is_active=true;
    if v_beneficiary_name is null then raise exception 'SEA_VIBE_COMMISSION_EMPLOYEE_INVALID'; end if;
    v_broker_name:=null;
  else
    if v_broker_name is null then raise exception 'SEA_VIBE_COMMISSION_BROKER_REQUIRED'; end if;
    v_beneficiary_name:=v_broker_name;
  end if;

  if v_id is null then
    insert into public.sea_vibe_commission_rules(
      name_ar,name_en,beneficiary_type,employee_id,broker_name,beneficiary_name,
      calculation_type,calculation_value,is_active,created_by,updated_by
    ) values(
      v_name_ar,v_name_en,v_beneficiary_type,case when v_beneficiary_type='employee' then p_employee_id else null end,
      v_broker_name,v_beneficiary_name,v_calculation_type,round(p_calculation_value::numeric,4),coalesce(p_is_active,true),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.sea_vibe_commission_rules set
      name_ar=v_name_ar,
      name_en=v_name_en,
      beneficiary_type=v_beneficiary_type,
      employee_id=case when v_beneficiary_type='employee' then p_employee_id else null end,
      broker_name=v_broker_name,
      beneficiary_name=v_beneficiary_name,
      calculation_type=v_calculation_type,
      calculation_value=round(p_calculation_value::numeric,4),
      is_active=coalesce(p_is_active,true),
      updated_by=auth.uid(),updated_at=now()
    where id=v_id;
    delete from public.sea_vibe_commission_rule_trip_types where commission_rule_id=v_id;
  end if;

  insert into public.sea_vibe_commission_rule_trip_types(commission_rule_id,trip_type_id)
  select v_id,trip_type_id
  from (select distinct trip_type_id from unnest(v_trip_type_ids) as u(trip_type_id)) q;
  return v_id;
end;
$$;
revoke all on function public.sea_vibe_save_commission_rule_r44r7(uuid,text,text,text,uuid,text,text,numeric,uuid[],boolean) from public,anon;
grant execute on function public.sea_vibe_save_commission_rule_r44r7(uuid,text,text,text,uuid,text,text,numeric,uuid[],boolean) to authenticated;

comment on table public.sea_vibe_employees is
'R44R8 canonical independent SEA VIBE employee master. It is intentionally isolated from the global payroll_employees domain.';
comment on column public.sea_vibe_commission_rules.employee_id is
'R44R8 SEA VIBE employee beneficiary reference. No dependency on global payroll_employees remains.';

commit;

-- Phase P5.13.8.71 R1
-- 1) Super Admin sees all commission statements in Commission Statement.
-- 2) Normal employees remain restricted to their own commission statement.
-- 3) Seed full localized names for commission tiers.

begin;

create or replace function public.get_commission_statement_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  emp public.payroll_employees%rowtype;
  v_month date := public.payroll_month_start(current_date);
  result jsonb;
begin
  if not public.has_screen_permission('commissionStatement','view') then
    raise exception 'لا توجد صلاحية عرض كشف العمولة';
  end if;

  -- Commission Statement is self-service for ordinary users, but Super Admin
  -- is the operational exception and must be able to inspect all statements.
  if public.current_user_role() = 'super_admin'::public.app_role then
    select jsonb_build_object(
      'mode','admin',
      'employee',null,
      'current',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',c.id,
            'month',c.payroll_month,
            'employeeId',c.employee_id,
            'employeeName',e.full_name,
            'role',c.commission_role,
            'teamId',c.installation_team_id,
            'carName',coalesce(ac.name,it.car_name,it.name),
            'eligibleSales',c.eligible_sales,
            'commissionAmount',c.commission_amount,
            'tierBreakdown',c.tier_breakdown,
            'locked',c.is_locked
          )
          order by e.full_name,
                   case c.commission_role when 'representative' then 1 when 'driver' then 2 else 3 end,
                   coalesce(ac.name,it.car_name,it.name)
        )
        from public.payroll_commission_statements c
        join public.payroll_employees e on e.id=c.employee_id
        join public.installation_teams it on it.id=c.installation_team_id
        left join public.appointment_cars ac on ac.id=c.appointment_car_id
        where c.payroll_month=v_month
      ),'[]'::jsonb),
      'history',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'month',h.payroll_month,
            'employeeId',h.employee_id,
            'employeeName',h.employee_name,
            'role',h.commission_role,
            'eligibleSales',h.sales,
            'commissionAmount',h.commission
          )
          order by h.payroll_month desc,h.employee_name,
                   case h.commission_role when 'representative' then 1 when 'driver' then 2 else 3 end
        )
        from (
          select c.payroll_month,
                 c.employee_id,
                 e.full_name as employee_name,
                 c.commission_role,
                 round(sum(c.eligible_sales),2) as sales,
                 round(sum(c.commission_amount),2) as commission
          from public.payroll_commission_statements c
          join public.payroll_employees e on e.id=c.employee_id
          where c.payroll_month<v_month
          group by c.payroll_month,c.employee_id,e.full_name,c.commission_role
        ) h
      ),'[]'::jsonb)
    ) into result;

    return result;
  end if;

  select * into emp
  from public.payroll_employees
  where user_id=auth.uid() and is_active=true
  limit 1;

  if not found then
    return jsonb_build_object(
      'mode','employee',
      'employee',null,
      'current','[]'::jsonb,
      'history','[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'mode','employee',
    'employee',jsonb_build_object(
      'id',emp.id,
      'name',emp.full_name,
      'role',emp.commission_role,
      'eligible',emp.commission_eligible
    ),
    'current',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'month',c.payroll_month,
        'teamId',c.installation_team_id,
        'carName',coalesce(ac.name,it.car_name,it.name),
        'eligibleSales',c.eligible_sales,
        'commissionAmount',c.commission_amount,
        'tierBreakdown',c.tier_breakdown,
        'locked',c.is_locked
      ))
      from public.payroll_commission_statements c
      join public.installation_teams it on it.id=c.installation_team_id
      left join public.appointment_cars ac on ac.id=c.appointment_car_id
      where c.employee_id=emp.id and c.payroll_month=v_month
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'month',h.payroll_month,
        'eligibleSales',h.sales,
        'commissionAmount',h.commission
      ) order by h.payroll_month desc)
      from (
        select c.payroll_month,
               round(sum(c.eligible_sales),2) as sales,
               round(sum(c.commission_amount),2) as commission
        from public.payroll_commission_statements c
        where c.employee_id=emp.id and c.payroll_month<v_month
        group by c.payroll_month
      ) h
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_commission_statement_workspace() from public,anon;
grant execute on function public.get_commission_statement_workspace() to authenticated,service_role;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  ar_text,en_text,default_ar,default_en,is_active,updated_at
) values
  ('commission.tierFirst','commissionManagement','payroll','label','الشريحة الأولى','First Tier','الشريحة الأولى','First Tier',true,now()),
  ('commission.tierSecond','commissionManagement','payroll','label','الشريحة الثانية','Second Tier','الشريحة الثانية','Second Tier',true,now()),
  ('commission.tierThird','commissionManagement','payroll','label','الشريحة الثالثة','Third Tier','الشريحة الثالثة','Third Tier',true,now())
on conflict(translation_key) do update set
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;

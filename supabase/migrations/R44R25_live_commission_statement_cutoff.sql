-- R44R25: Read-only live self-service commission statement.
-- No salary transitions, commission tiers, or locked snapshots are modified.
-- Install only after reviewing the read-only checks below on production.
begin;

create or replace function public.get_commission_statement_workspace()
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare
  emp public.payroll_employees%rowtype;
  v_admin boolean := public.current_user_role() = 'super_admin'::public.app_role;
  v_cutoff date;
  v_start date;
  v_current jsonb;
  v_history jsonb;
  v_all_current jsonb := '[]'::jsonb;
  v_all_history jsonb := '[]'::jsonb;
  v_now date := current_date;
begin
  if not public.has_screen_permission('commissionStatement','view') then
    raise exception 'لا توجد صلاحية عرض كشف العمولة';
  end if;

  for emp in
    select e.* from public.payroll_employees e
    where e.is_active = true
      and (v_admin or e.user_id = auth.uid())
    order by e.full_name,e.id
  loop
    -- Approved salary snapshots, not draft previews, define a completed cut.
    select max(s.commission_period_to) into v_cutoff
      from public.payroll_salary_statements s
      where s.employee_id=emp.id
        and s.status in ('pending_employee','ready_for_payment','paid');
    v_start := coalesce(v_cutoff + 1, public.payroll_month_start(v_now));

    -- The canonical range engine performs all tier and eligibility calculations.
    -- A completed salary period cannot be counted again in the live window.
    if v_start <= v_now then
      select coalesce(jsonb_agg(jsonb_build_object(
        'month',r.payroll_month,
        'employeeId',r.employee_id,
        'employeeName',emp.full_name,
        'role',r.commission_role,
        'teamId',r.installation_team_id,
        'carName',r.car_name,
        'eligibleSales',r.eligible_sales,
        'commissionAmount',r.commission_amount,
        'tierBreakdown',r.tier_breakdown,
        'locked',false
      ) order by r.car_name,r.commission_role),'[]'::jsonb) into v_current
      from public.payroll_live_commission_rows_range(v_start,v_now) r
      where r.employee_id=emp.id;
    else
      v_current:='[]'::jsonb;
    end if;

    -- History stays based on stored payroll-period snapshots, never the live rows.
    select coalesce(jsonb_agg(jsonb_build_object(
        'month',h.payroll_month,
        'employeeId',emp.id,
        'employeeName',emp.full_name,
        'role',h.commission_role,
        'eligibleSales',h.sales,
        'commissionAmount',h.commission
      ) order by h.payroll_month desc,h.commission_role),'[]'::jsonb)
    into v_history
    from (
      select c.payroll_month,c.commission_role,
             round(sum(c.eligible_sales),2) sales,
             round(sum(c.commission_amount),2) commission
      from public.payroll_commission_statements c
      where c.employee_id=emp.id
        and c.payroll_month < public.payroll_month_start(v_now)
      group by c.payroll_month,c.commission_role
    ) h;

    if v_admin then
      v_all_current:=v_all_current || v_current;
      v_all_history:=v_all_history || v_history;
    else
      return jsonb_build_object(
        'mode','employee',
        'employee',jsonb_build_object('id',emp.id,'name',emp.full_name,'role',emp.commission_role,'eligible',emp.commission_eligible),
        'current',v_current,'history',v_history,
        'periodFrom',v_start,'periodTo',v_now
      );
    end if;
  end loop;

  if v_admin then
    return jsonb_build_object('mode','admin','employee',null,'current',v_all_current,'history',v_all_history);
  end if;
  return jsonb_build_object('mode','employee','employee',null,'current','[]'::jsonb,'history','[]'::jsonb);
end;
$$;

revoke all on function public.get_commission_statement_workspace() from public,anon;
grant execute on function public.get_commission_statement_workspace() to authenticated,service_role;
notify pgrst,'reload schema';
commit;

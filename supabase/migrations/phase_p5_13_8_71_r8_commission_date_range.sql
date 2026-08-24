-- Phase P5.13.8.71 R8
-- Commission Management date range support.
-- Keeps payroll commission persistence monthly; custom ranges are read-only management views.

begin;

create or replace function public.payroll_live_commission_rows_range(p_from date,p_to date)
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
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_from date:=p_from;
  v_to date:=p_to;
  v_month date;
begin
  if v_from is null or v_to is null or v_from>v_to then
    raise exception 'يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.';
  end if;
  v_month:=public.payroll_month_start(v_from);

  return query
  with team_master as (
    select t.id team_id,t.name team_name,t.appointment_car_id,
           coalesce(nullif(btrim(c.name),''),nullif(btrim(t.car_name),''),t.name) car_name,
           c.plate_number,t.groomer_employee_id,t.driver_employee_id
    from public.installation_teams t
    left join public.appointment_cars c on c.id=t.appointment_car_id
    where t.status<>'غير نشطة'
  ),
  team_sales as (
    select b.installation_team_id,round(sum(b.eligible_sales_before_vat),2) sales
    from public.payroll_commission_invoice_base b
    where b.invoice_date between v_from and v_to
    group by b.installation_team_id
  ),
  rep_sales as (
    select b.installation_team_id,b.representative_id,round(sum(b.eligible_sales_before_vat),2) sales
    from public.payroll_commission_invoice_base b
    where b.invoice_date between v_from and v_to and b.representative_id is not null
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
  ),
  calc as (
    select roles.*,public.payroll_calc_progressive_commission(roles.commission_role,roles.sales) calc
    from roles
  )
  select v_month,calc.team_id,calc.team_name,calc.appointment_car_id,calc.car_name,calc.plate_number,
         calc.employee_id,calc.employee_name,calc.commission_role,round(calc.sales,2),
         case when calc.linked and calc.commission_eligible then coalesce((calc.calc->>'total')::numeric,0) else 0 end,
         case when calc.linked and calc.commission_eligible then coalesce(calc.calc->'breakdown','[]'::jsonb) else '[]'::jsonb end,
         calc.linked,calc.commission_eligible
  from calc
  where public.has_screen_permission('commissionManagement','view')
     or public.has_screen_permission('payrollManagement','add')
     or public.has_screen_permission('payrollManagement','edit')
     or (calc.employee_id is not null and exists(
       select 1 from public.payroll_employees own
       where own.id=calc.employee_id and own.user_id=auth.uid()
     ))
  order by calc.car_name,case calc.commission_role when 'representative' then 1 when 'driver' then 2 else 3 end,calc.employee_name;
end;
$$;

revoke all on function public.payroll_live_commission_rows_range(date,date) from public,anon;
grant execute on function public.payroll_live_commission_rows_range(date,date) to authenticated,service_role;

-- Keep the original monthly contract and make it reuse the same canonical range engine.
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
  select *
  from public.payroll_live_commission_rows_range(
    public.payroll_month_start(p_month),
    (public.payroll_month_start(p_month)+interval '1 month - 1 day')::date
  );
$$;

revoke all on function public.payroll_live_commission_rows(date) from public,anon;
grant execute on function public.payroll_live_commission_rows(date) to authenticated,service_role;

create or replace function public.get_commission_management_workspace_range(p_from date,p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_from date:=p_from;
  v_to date:=p_to;
  result jsonb;
begin
  if not public.has_screen_permission('commissionManagement','view') then
    raise exception 'لا توجد صلاحية عرض إدارة العمولات';
  end if;
  if v_from is null or v_to is null or v_from>v_to then
    raise exception 'يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.';
  end if;

  with rows as (
    select * from public.payroll_live_commission_rows_range(v_from,v_to)
  )
  select jsonb_build_object(
    'month',public.payroll_month_start(v_from),
    'fromDate',v_from,
    'toDate',v_to,
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

revoke all on function public.get_commission_management_workspace_range(date,date) from public,anon;
grant execute on function public.get_commission_management_workspace_range(date,date) to authenticated,service_role;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  ar_text,en_text,default_ar,default_en,is_active,updated_at
) values
  ('commission.filter.fromDate','commissionManagement','payroll','label','من تاريخ','From Date','من تاريخ','From Date',true,now()),
  ('commission.filter.toDate','commissionManagement','payroll','label','إلى تاريخ','To Date','إلى تاريخ','To Date',true,now()),
  ('commission.range.invalid','commissionManagement','payroll','validation','يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.','From date must be on or before To date.','يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.','From date must be on or before To date.',true,now()),
  ('commission.recalculate.fullMonthOnly','commissionManagement','payroll','help','إعادة احتساب العمولات وربطها بالرواتب متاحة عند اختيار الشهر كاملًا فقط.','Recalculating commissions for payroll is available only when the full month is selected.','إعادة احتساب العمولات وربطها بالرواتب متاحة عند اختيار الشهر كاملًا فقط.','Recalculating commissions for payroll is available only when the full month is selected.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;

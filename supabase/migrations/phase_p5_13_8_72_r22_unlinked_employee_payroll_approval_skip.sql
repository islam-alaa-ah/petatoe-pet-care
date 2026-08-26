-- PETATOE P5.13.8.72 R22
-- Payroll approval flow: employees without a linked application user do not
-- require the employee self-approval stage. Chairman approval moves them
-- directly to ready_for_payment. Existing stranded pending_employee rows for
-- unlinked employees are reconciled once by this migration.

-- ---------------------------------------------------------------------------
-- Reconcile existing salary statements that cannot be self-approved because
-- their payroll employee is not linked to any auth/application user.
-- ---------------------------------------------------------------------------
with advanced as (
  update public.payroll_salary_statements s
  set
    status='ready_for_payment',
    employee_approved_at=null,
    employee_approved_by=null,
    updated_at=now()
  from public.payroll_employees e
  where e.id=s.employee_id
    and e.user_id is null
    and s.status='pending_employee'
  returning s.id
)
insert into public.payroll_salary_audit(
  salary_statement_id,action_key,from_status,to_status,details
)
select
  id,
  'auto_skip_employee_approval_unlinked',
  'pending_employee',
  'ready_for_payment',
  jsonb_build_object('reason','employee_has_no_linked_user')
from advanced;

-- ---------------------------------------------------------------------------
-- Keep the rule true after deployment as well: if an employee is unlinked
-- while a salary is waiting for employee approval, that salary immediately
-- becomes ready for payment because there is no account that can self-approve.
-- ---------------------------------------------------------------------------
create or replace function public.save_payroll_employee(p_record jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_role text;
  v_appointment uuid;
  v_rep uuid;
  v_type text;
  v_user uuid;
begin
  if not (public.has_screen_permission('payrollReference','add') or public.has_screen_permission('payrollReference','edit')) then raise exception 'لا توجد صلاحية حفظ الموظفين'; end if;
  begin v_id:=nullif(p_record->>'id','')::uuid; exception when others then v_id:=null; end;
  v_user:=nullif(p_record->>'userId','')::uuid;
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
      v_user,
      greatest(coalesce((p_record->>'baseSalary')::numeric,0),0),greatest(coalesce((p_record->>'allowances')::numeric,0),0),
      btrim(coalesce(nullif(p_record->>'paymentMethod',''),'تحويل بنكي')),v_role,v_appointment,v_rep,
      coalesce((p_record->>'commissionEligible')::boolean,false),coalesce((p_record->>'isActive')::boolean,true),
      nullif(btrim(coalesce(p_record->>'notes','')),''),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.payroll_employees set
      full_name=btrim(coalesce(p_record->>'fullName',full_name)),user_id=v_user,
      base_salary=greatest(coalesce((p_record->>'baseSalary')::numeric,base_salary),0),allowances=greatest(coalesce((p_record->>'allowances')::numeric,allowances),0),
      payment_method=btrim(coalesce(nullif(p_record->>'paymentMethod',''),payment_method)),commission_role=v_role,appointment_employee_id=v_appointment,representative_id=v_rep,
      commission_eligible=coalesce((p_record->>'commissionEligible')::boolean,false),is_active=coalesce((p_record->>'isActive')::boolean,true),
      notes=nullif(btrim(coalesce(p_record->>'notes','')),''),updated_by=auth.uid(),updated_at=now()
    where id=v_id;
    if not found then raise exception 'الموظف غير موجود'; end if;
  end if;

  if v_user is null then
    with advanced as (
      update public.payroll_salary_statements s
      set
        status='ready_for_payment',
        employee_approved_at=null,
        employee_approved_by=null,
        updated_by=auth.uid(),
        updated_at=now()
      where s.employee_id=v_id and s.status='pending_employee'
      returning s.id
    )
    insert into public.payroll_salary_audit(
      salary_statement_id,action_key,from_status,to_status,details
    )
    select
      id,
      'auto_skip_employee_approval_unlinked',
      'pending_employee',
      'ready_for_payment',
      jsonb_build_object('reason','employee_user_link_removed')
    from advanced;
  end if;

  return v_id;
end;
$$;
revoke all on function public.save_payroll_employee(jsonb) from public,anon;
grant execute on function public.save_payroll_employee(jsonb) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Canonical salary state machine.
-- ---------------------------------------------------------------------------
create or replace function public.payroll_salary_transition(
  p_statement_id uuid,p_action text,p_reference text default null
)
returns public.payroll_salary_statements
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.payroll_salary_statements%rowtype;
  own_user uuid;
  next_status text;
  old_status text;
  employee_approval_skipped boolean:=false;
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
    if own_user is null then
      next_status:='ready_for_payment';
      employee_approval_skipped:=true;
      update public.payroll_salary_statements set
        status=next_status,
        chairman_approved_at=now(),
        chairman_approved_by=auth.uid(),
        employee_approved_at=null,
        employee_approved_by=null,
        updated_by=auth.uid(),
        updated_at=now()
      where id=s.id;
    else
      next_status:='pending_employee';
      update public.payroll_salary_statements set status=next_status,chairman_approved_at=now(),chairman_approved_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=s.id;
    end if;
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
    if own_user is null then raise exception 'هذا الراتب لا يتطلب موافقة موظف؛ ألغِ اعتماد رئيس مجلس الإدارة مباشرة'; end if;
    next_status:='pending_employee';
    update public.payroll_salary_statements set status=next_status,employee_approved_at=null,employee_approved_by=null,updated_by=auth.uid(),updated_at=now() where id=s.id;
  elsif p_action='reverse_chairman_ready' then
    if not public.has_screen_permission('payrollManagement','delete') or s.status<>'ready_for_payment' or own_user is not null then raise exception 'إلغاء اعتماد رئيس مجلس الإدارة مباشرة متاح فقط لراتب موظف غير مرتبط بمستخدم وجاهز للصرف'; end if;
    next_status:='pending_chairman';
    update public.payroll_salary_statements set
      status=next_status,
      chairman_approved_at=null,
      chairman_approved_by=null,
      employee_approved_at=null,
      employee_approved_by=null,
      updated_by=auth.uid(),
      updated_at=now()
    where id=s.id;
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
  values(
    s.id,
    p_action,
    old_status,
    next_status,
    jsonb_build_object(
      'reference',nullif(btrim(coalesce(p_reference,'')),''),
      'employeeApprovalSkipped',employee_approval_skipped,
      'employeeLinkedUserId',own_user
    )
  );
  select * into s from public.payroll_salary_statements where id=p_statement_id;
  return s;
end;
$$;
revoke all on function public.payroll_salary_transition(uuid,text,text) from public,anon;
grant execute on function public.payroll_salary_transition(uuid,text,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Management workspace: expose whether the current employee link requires
-- self-approval so management renders the correct reverse action.
-- This preserves all R9 commission-period and adjustment-item fields.
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
      'employeeApprovedAt',s.employee_approved_at,'paidAt',s.paid_at,'paymentReference',coalesce(s.payment_reference,''),
      'requiresEmployeeApproval',exists(select 1 from public.payroll_employees e where e.id=s.employee_id and e.user_id is not null)
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

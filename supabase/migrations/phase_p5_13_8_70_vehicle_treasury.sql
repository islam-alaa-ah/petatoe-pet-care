-- P5.13.8.70 — Vehicle Treasury
begin;

create sequence if not exists public.vehicle_treasury_movement_seq;

create table if not exists public.vehicle_treasury_expenses(
  id uuid primary key default gen_random_uuid(),
  movement_serial text not null unique default ('VT-EXP-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.vehicle_treasury_movement_seq')::text,6,'0')),
  installation_team_id uuid not null references public.installation_teams(id) on delete restrict,
  appointment_car_id uuid not null references public.appointment_cars(id) on delete restrict,
  expense_date date not null default current_date,
  description text not null check(nullif(btrim(description),'') is not null),
  amount numeric(14,2) not null check(amount>0),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vehicle_treasury_expenses_team_date on public.vehicle_treasury_expenses(installation_team_id,expense_date desc);
create index if not exists idx_vehicle_treasury_expenses_car_date on public.vehicle_treasury_expenses(appointment_car_id,expense_date desc);

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values('vehicleTreasury','خزينة السيارة','إدارة المواعيد',188,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select distinct role,'vehicleTreasury',role='super_admin',role='super_admin',role='super_admin',role='super_admin',role='super_admin'
from public.role_screen_permissions
on conflict(role,screen_key) do nothing;

alter table public.vehicle_treasury_expenses enable row level security;
drop policy if exists "vehicle treasury expenses view" on public.vehicle_treasury_expenses;
drop policy if exists "vehicle treasury expenses add" on public.vehicle_treasury_expenses;
drop policy if exists "vehicle treasury expenses edit" on public.vehicle_treasury_expenses;
drop policy if exists "vehicle treasury expenses delete" on public.vehicle_treasury_expenses;
create policy "vehicle treasury expenses view" on public.vehicle_treasury_expenses for select to authenticated using(
  public.has_screen_permission('vehicleTreasury','view') and public.can_access_installation_team(installation_team_id)
);
create policy "vehicle treasury expenses add" on public.vehicle_treasury_expenses for insert to authenticated with check(
  public.has_screen_permission('vehicleTreasury','add') and public.can_access_installation_team(installation_team_id)
);
create policy "vehicle treasury expenses edit" on public.vehicle_treasury_expenses for update to authenticated using(
  public.has_screen_permission('vehicleTreasury','edit') and public.can_access_installation_team(installation_team_id)
) with check(public.has_screen_permission('vehicleTreasury','edit') and public.can_access_installation_team(installation_team_id));
create policy "vehicle treasury expenses delete" on public.vehicle_treasury_expenses for delete to authenticated using(
  public.has_screen_permission('vehicleTreasury','delete') and public.can_access_installation_team(installation_team_id)
);
grant select,insert,update,delete on public.vehicle_treasury_expenses to authenticated;

create or replace function public.vehicle_treasury_team_for_invoice(p_invoice_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select coalesce(v.installation_team_id,r.installation_team_id)
  from public.sales_invoices si
  left join public.installation_execution_visits v on v.id=si.installation_execution_visit_id
  left join public.installation_requests r on r.id=si.installation_request_id
  where si.id=p_invoice_id
$$;
grant execute on function public.vehicle_treasury_team_for_invoice(uuid) to authenticated;

create or replace function public.get_vehicle_treasury_workspace(p_team_id uuid default null,p_from date default null,p_to date default null,p_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  if not public.has_screen_permission('vehicleTreasury','view') then raise exception 'لا توجد صلاحية عرض خزينة السيارة'; end if;
  if p_team_id is not null and not public.can_access_installation_team(p_team_id) then raise exception 'الفرقة / السيارة خارج نطاقك المسموح'; end if;

  with allowed_teams as (
    select t.id,t.name team_name,t.car_name,c.id car_id,c.name car_name,c.plate_number
    from public.installation_teams t
    left join public.appointment_cars c on c.id=t.appointment_car_id
    where t.appointment_car_id is not null and t.status<>'غير نشطة' and public.can_access_installation_team(t.id)
  ), revenue as (
    select si.id source_id,'revenue'::text movement_type,
      ('VT-REV-'||replace(si.id::text,'-',''))::text movement_serial,
      si.invoice_date movement_date,
      coalesce(nullif(si.invoice_number,''),si.request_number,'—') reference,
      ('فاتورة نقدية — '||coalesce(si.request_number,'بدون رقم طلب'))::text description,
      coalesce(si.final_amount,round(si.invoice_amount*1.15,2))::numeric amount,
      coalesce(v.installation_team_id,r.installation_team_id) team_id,
      null::text notes,false editable,si.created_at sort_at
    from public.sales_invoices si
    left join public.installation_execution_visits v on v.id=si.installation_execution_visit_id
    left join public.installation_requests r on r.id=si.installation_request_id
    left join public.installation_request_collection c on c.installation_request_id=si.installation_request_id
    where si.status='صادرة' and si.source_type='installation' and btrim(coalesce(c.payment_method,si.payment_method,''))='نقدي'
      and coalesce(v.installation_team_id,r.installation_team_id) is not null
      and public.can_access_installation_team(coalesce(v.installation_team_id,r.installation_team_id))
  ), expense as (
    select e.id source_id,'expense'::text movement_type,e.movement_serial,e.expense_date movement_date,e.movement_serial reference,e.description,
      (-e.amount)::numeric amount,e.installation_team_id team_id,e.notes,true editable,e.created_at sort_at
    from public.vehicle_treasury_expenses e
    where public.can_access_installation_team(e.installation_team_id)
  ), movements as (
    select * from revenue union all select * from expense
  ), filtered as (
    select m.*,a.team_name,a.car_name,a.plate_number
    from movements m join allowed_teams a on a.id=m.team_id
    where (p_team_id is null or m.team_id=p_team_id)
      and (p_from is null or m.movement_date>=p_from) and (p_to is null or m.movement_date<=p_to)
      and (v_search='' or lower(coalesce(m.reference,'')||' '||coalesce(m.description,'')||' '||coalesce(a.car_name,'')||' '||coalesce(a.team_name,'')) like '%'||v_search||'%')
  )
  select jsonb_build_object(
    'teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'teamName',team_name,'carId',car_id,'carName',coalesce(car_name,team_name),'plateNumber',plate_number) order by coalesce(car_name,team_name)) from allowed_teams),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(jsonb_build_object('id',source_id,'sourceId',source_id,'movementType',movement_type,'movementSerial',movement_serial,'movementDate',movement_date,'reference',reference,'description',description,'amount',amount,'teamId',team_id,'teamName',team_name,'carName',car_name,'plateNumber',plate_number,'notes',notes,'editable',editable) order by movement_date desc,sort_at desc) from filtered),'[]'::jsonb),
    'summary',jsonb_build_object('revenue',coalesce((select sum(amount) from filtered where amount>0),0),'expense',abs(coalesce((select sum(amount) from filtered where amount<0),0)),'balance',coalesce((select sum(amount) from filtered),0),'count',(select count(*) from filtered))
  ) into result;
  return result;
end;$$;
grant execute on function public.get_vehicle_treasury_workspace(uuid,date,date,text) to authenticated;

create or replace function public.add_vehicle_treasury_expense(p_team_id uuid,p_expense_date date,p_description text,p_amount numeric,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_car uuid;
begin
  if not public.has_screen_permission('vehicleTreasury','add') then raise exception 'لا توجد صلاحية صرف من خزينة السيارة'; end if;
  if not public.can_access_installation_team(p_team_id) then raise exception 'الفرقة / السيارة خارج نطاقك المسموح'; end if;
  select appointment_car_id into v_car from public.installation_teams where id=p_team_id and status<>'غير نشطة';
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'بيان المصروف مطلوب'; end if;
  insert into public.vehicle_treasury_expenses(installation_team_id,appointment_car_id,expense_date,description,amount,notes,created_by,updated_by)
  values(p_team_id,v_car,coalesce(p_expense_date,current_date),btrim(p_description),p_amount,nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()) returning id into v_id;
  return v_id;
end;$$;
grant execute on function public.add_vehicle_treasury_expense(uuid,date,text,numeric,text) to authenticated;

create or replace function public.update_vehicle_treasury_expense(p_id uuid,p_team_id uuid,p_expense_date date,p_description text,p_amount numeric,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_old public.vehicle_treasury_expenses%rowtype; v_car uuid;
begin
  if not public.has_screen_permission('vehicleTreasury','edit') then raise exception 'لا توجد صلاحية تعديل خزينة السيارة'; end if;
  select * into v_old from public.vehicle_treasury_expenses where id=p_id for update;
  if not found or not public.can_access_installation_team(v_old.installation_team_id) then raise exception 'حركة الصرف غير مسموحة'; end if;
  if not public.can_access_installation_team(p_team_id) then raise exception 'الفرقة / السيارة الجديدة خارج نطاقك المسموح'; end if;
  select appointment_car_id into v_car from public.installation_teams where id=p_team_id and status<>'غير نشطة';
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة'; end if;
  update public.vehicle_treasury_expenses set installation_team_id=p_team_id,appointment_car_id=v_car,expense_date=coalesce(p_expense_date,current_date),description=btrim(p_description),amount=p_amount,notes=nullif(btrim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now() where id=p_id;
  return p_id;
end;$$;
grant execute on function public.update_vehicle_treasury_expense(uuid,uuid,date,text,numeric,text) to authenticated;

create or replace function public.delete_vehicle_treasury_expense(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.vehicle_treasury_expenses%rowtype;
begin
  if not public.has_screen_permission('vehicleTreasury','delete') then raise exception 'لا توجد صلاحية حذف حركة من خزينة السيارة'; end if;
  select * into r from public.vehicle_treasury_expenses where id=p_id for update;
  if not found or not public.can_access_installation_team(r.installation_team_id) then raise exception 'حركة الصرف غير مسموحة'; end if;
  delete from public.vehicle_treasury_expenses where id=p_id;
end;$$;
grant execute on function public.delete_vehicle_treasury_expense(uuid) to authenticated;

commit;

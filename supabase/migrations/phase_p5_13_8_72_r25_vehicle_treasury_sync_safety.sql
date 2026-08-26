-- P5.13.8.72R25 — Vehicle Treasury Sync Safety Foundation
-- Scope only:
--   1) Idempotent expense create for retry-safe offline queue replay.
--   2) Atomic optimistic-concurrency guard for queued expense updates.
-- No balance formulas, invoice revenue rules, permissions, RLS, delete behavior, or appointment logic changes.
begin;

alter table public.vehicle_treasury_expenses
  add column if not exists client_operation_key text;

create unique index if not exists ux_vehicle_treasury_expenses_client_operation_key
  on public.vehicle_treasury_expenses(client_operation_key)
  where client_operation_key is not null;

create or replace function public.add_vehicle_treasury_expense_idempotent(
  p_team_id uuid,
  p_expense_date date,
  p_description text,
  p_amount numeric,
  p_notes text,
  p_client_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_car uuid;
  v_existing public.vehicle_treasury_expenses%rowtype;
  v_key text := nullif(btrim(coalesce(p_client_operation_key,'')), '');
begin
  if not public.has_screen_permission('vehicleTreasury','add') then
    raise exception 'لا توجد صلاحية صرف من خزينة السيارة';
  end if;
  if v_key is null then
    raise exception 'VEHICLE_TREASURY_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select * into v_existing
  from public.vehicle_treasury_expenses
  where client_operation_key = v_key;

  if found then
    if not public.can_access_installation_team(v_existing.installation_team_id) then
      raise exception 'حركة الصرف غير مسموحة';
    end if;
    return v_existing.id;
  end if;

  if not public.can_access_installation_team(p_team_id) then
    raise exception 'الفرقة / السيارة خارج نطاقك المسموح';
  end if;
  select appointment_car_id into v_car
  from public.installation_teams
  where id=p_team_id and status<>'غير نشطة';
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'بيان المصروف مطلوب'; end if;

  insert into public.vehicle_treasury_expenses(
    installation_team_id,
    appointment_car_id,
    expense_date,
    description,
    amount,
    notes,
    created_by,
    updated_by,
    client_operation_key
  ) values(
    p_team_id,
    v_car,
    coalesce(p_expense_date,current_date),
    btrim(p_description),
    p_amount,
    nullif(btrim(coalesce(p_notes,'')),''),
    auth.uid(),
    auth.uid(),
    v_key
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing
    from public.vehicle_treasury_expenses
    where client_operation_key = v_key;
    if not found then raise exception 'تعذر تثبيت عملية صرف خزينة السيارة'; end if;
    if not public.can_access_installation_team(v_existing.installation_team_id) then
      raise exception 'حركة الصرف غير مسموحة';
    end if;
    v_id := v_existing.id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.add_vehicle_treasury_expense_idempotent(uuid,date,text,numeric,text,text) to authenticated;

create or replace function public.update_vehicle_treasury_expense_guarded(
  p_id uuid,
  p_team_id uuid,
  p_expense_date date,
  p_description text,
  p_amount numeric,
  p_notes text,
  p_base_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old public.vehicle_treasury_expenses%rowtype;
  v_car uuid;
  v_date date := coalesce(p_expense_date,current_date);
  v_description text := btrim(coalesce(p_description,''));
  v_notes text := nullif(btrim(coalesce(p_notes,'')),'');
begin
  if not public.has_screen_permission('vehicleTreasury','edit') then
    raise exception 'لا توجد صلاحية تعديل خزينة السيارة';
  end if;

  select * into v_old
  from public.vehicle_treasury_expenses
  where id=p_id
  for update;

  if not found or not public.can_access_installation_team(v_old.installation_team_id) then
    raise exception 'حركة الصرف غير مسموحة';
  end if;
  if not public.can_access_installation_team(p_team_id) then
    raise exception 'الفرقة / السيارة الجديدة خارج نطاقك المسموح';
  end if;
  select appointment_car_id into v_car
  from public.installation_teams
  where id=p_team_id and status<>'غير نشطة';
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  if nullif(v_description,'') is null then raise exception 'بيان المصروف مطلوب'; end if;

  -- Retry after an ambiguous network failure is safe: if the server already has exactly
  -- the requested values, treat the mutation as successfully applied even if updated_at changed.
  if v_old.installation_team_id = p_team_id
     and v_old.appointment_car_id = v_car
     and v_old.expense_date = v_date
     and v_old.description = v_description
     and v_old.amount = p_amount
     and coalesce(v_old.notes,'') = coalesce(v_notes,'') then
    return p_id;
  end if;

  if p_base_updated_at is null then
    raise exception 'VT_SYNC_BASE_REQUIRED';
  end if;
  if v_old.updated_at <> p_base_updated_at then
    raise exception using
      message = 'VEHICLE_TREASURY_SYNC_CONFLICT',
      detail = jsonb_build_object(
        'id', p_id,
        'base_updated_at', p_base_updated_at,
        'server_updated_at', v_old.updated_at
      )::text;
  end if;

  update public.vehicle_treasury_expenses
  set installation_team_id=p_team_id,
      appointment_car_id=v_car,
      expense_date=v_date,
      description=v_description,
      amount=p_amount,
      notes=v_notes,
      updated_by=auth.uid(),
      updated_at=now()
  where id=p_id;

  return p_id;
end;
$$;

grant execute on function public.update_vehicle_treasury_expense_guarded(uuid,uuid,date,text,numeric,text,timestamptz) to authenticated;

commit;

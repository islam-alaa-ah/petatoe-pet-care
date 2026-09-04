begin;

-- R44R12: keep manual trip-expense dates canonical to the selected trip date.
-- General and asset expenses retain their existing explicit expense-date behavior.

create or replace function public.sea_vibe_add_expense_batch(
  p_scope text,
  p_trip_id uuid,
  p_asset_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_group uuid:=gen_random_uuid();
  v_serial text;
  v_status text;
  v_trip_date date;
  v_line jsonb;
  v_id uuid;
  v_ids jsonb:='[]'::jsonb;
begin
  if not public.has_screen_permission('seaVibeExpenseNew','add') then
    raise exception 'permission_denied';
  end if;
  if p_scope not in ('general','trip','asset') then
    raise exception 'invalid_scope';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'expense_lines_required';
  end if;

  if p_scope='trip' then
    select status,trip_date into v_status,v_trip_date
    from public.sea_vibe_trips
    where id=p_trip_id
    for update;
    if v_status is null then raise exception 'trip_not_found'; end if;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
    v_serial:=public.sea_vibe_next_treasury_movement_serial(v_trip_date);
  else
    v_serial:=public.sea_vibe_next_treasury_movement_serial(coalesce(nullif(p_lines->0->>'date','')::date,current_date));
    if p_scope='asset' and not exists(select 1 from public.sea_vibe_assets where id=p_asset_id) then
      raise exception 'asset_not_found';
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if nullif(v_line->>'catalog_id','') is null then raise exception 'expense_catalog_required'; end if;
    insert into public.sea_vibe_expenses(
      expense_scope,trip_id,asset_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
      movement_group_id,movement_serial,created_by,updated_by
    ) values(
      p_scope,
      case when p_scope='trip' then p_trip_id else null end,
      case when p_scope='asset' then p_asset_id else null end,
      nullif(v_line->>'catalog_id','')::uuid,
      case when p_scope='trip' then v_trip_date else nullif(v_line->>'date','')::date end,
      coalesce((v_line->>'amount')::numeric,0),
      nullif(v_line->>'payment_method_id','')::uuid,
      nullif(btrim(v_line->>'notes'),''),
      v_group,v_serial,auth.uid(),auth.uid()
    ) returning id into v_id;
    v_ids:=v_ids||jsonb_build_array(v_id);
  end loop;

  return jsonb_build_object('movement_group_id',v_group,'movement_serial',v_serial,'expense_ids',v_ids);
end;
$$;

revoke all on function public.sea_vibe_add_expense_batch(text,uuid,uuid,jsonb) from public;
grant execute on function public.sea_vibe_add_expense_batch(text,uuid,uuid,jsonb) to authenticated;

create or replace function public.sea_vibe_update_expense_batch(
  p_group_id uuid,
  p_scope text,
  p_trip_id uuid,
  p_asset_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_serial text;
  v_status text;
  v_old_trip uuid;
  v_trip_date date;
  v_line jsonb;
  v_id uuid;
  v_ids jsonb:='[]'::jsonb;
  v_keep uuid[]:=array[]::uuid[];
begin
  if not public.has_screen_permission('seaVibeExpenseNew','edit') then
    raise exception 'permission_denied';
  end if;
  if p_scope not in ('general','trip','asset') then
    raise exception 'invalid_scope';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'expense_lines_required';
  end if;

  select movement_serial,trip_id into v_serial,v_old_trip
  from public.sea_vibe_expenses
  where movement_group_id=p_group_id and coalesce(is_system_generated,false)=false
  order by created_at,id
  limit 1;
  if v_serial is null then raise exception 'EXPENSE_MOVEMENT_NOT_FOUND'; end if;

  if v_old_trip is not null then
    select status into v_status from public.sea_vibe_trips where id=v_old_trip for update;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
  end if;

  if p_scope='trip' then
    select status,trip_date into v_status,v_trip_date
    from public.sea_vibe_trips
    where id=p_trip_id
    for update;
    if v_status is null then raise exception 'trip_not_found'; end if;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
  elsif p_scope='asset' and not exists(select 1 from public.sea_vibe_assets where id=p_asset_id) then
    raise exception 'asset_not_found';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if nullif(v_line->>'catalog_id','') is null then raise exception 'expense_catalog_required'; end if;
    v_id:=nullif(v_line->>'id','')::uuid;
    if v_id is not null then
      if not exists(
        select 1 from public.sea_vibe_expenses
        where id=v_id and movement_group_id=p_group_id and coalesce(is_system_generated,false)=false
      ) then
        raise exception 'EXPENSE_LINE_NOT_IN_MOVEMENT';
      end if;
      update public.sea_vibe_expenses set
        expense_scope=p_scope,
        trip_id=case when p_scope='trip' then p_trip_id else null end,
        asset_id=case when p_scope='asset' then p_asset_id else null end,
        expense_catalog_id=nullif(v_line->>'catalog_id','')::uuid,
        expense_date=case when p_scope='trip' then v_trip_date else nullif(v_line->>'date','')::date end,
        amount=coalesce((v_line->>'amount')::numeric,0),
        payment_method_id=nullif(v_line->>'payment_method_id','')::uuid,
        notes=nullif(btrim(v_line->>'notes'),''),
        updated_by=auth.uid(),updated_at=now()
      where id=v_id;
    else
      insert into public.sea_vibe_expenses(
        expense_scope,trip_id,asset_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
        movement_group_id,movement_serial,created_by,updated_by
      ) values(
        p_scope,
        case when p_scope='trip' then p_trip_id else null end,
        case when p_scope='asset' then p_asset_id else null end,
        nullif(v_line->>'catalog_id','')::uuid,
        case when p_scope='trip' then v_trip_date else nullif(v_line->>'date','')::date end,
        coalesce((v_line->>'amount')::numeric,0),
        nullif(v_line->>'payment_method_id','')::uuid,
        nullif(btrim(v_line->>'notes'),''),
        p_group_id,v_serial,auth.uid(),auth.uid()
      ) returning id into v_id;
    end if;
    v_keep:=array_append(v_keep,v_id);
    v_ids:=v_ids||jsonb_build_array(v_id);
  end loop;

  delete from public.sea_vibe_expenses
  where movement_group_id=p_group_id
    and coalesce(is_system_generated,false)=false
    and not (id=any(v_keep));

  return jsonb_build_object('movement_group_id',p_group_id,'movement_serial',v_serial,'expense_ids',v_ids);
end;
$$;

revoke all on function public.sea_vibe_update_expense_batch(uuid,text,uuid,uuid,jsonb) from public;
grant execute on function public.sea_vibe_update_expense_batch(uuid,text,uuid,uuid,jsonb) to authenticated;

comment on function public.sea_vibe_add_expense_batch(text,uuid,uuid,jsonb) is
'R44R12 canonical expense-batch create. Trip expenses always inherit sea_vibe_trips.trip_date; general/asset expense dates remain explicit.';
comment on function public.sea_vibe_update_expense_batch(uuid,text,uuid,uuid,jsonb) is
'R44R12 canonical expense-batch update. Trip expenses always inherit sea_vibe_trips.trip_date; general/asset expense dates remain explicit.';

commit;

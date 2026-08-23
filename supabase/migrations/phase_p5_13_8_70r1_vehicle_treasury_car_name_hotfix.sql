-- P5.13.8.70R1 — Vehicle Treasury ambiguous car_name hotfix
-- Scope: replace only the workspace RPC. No table, permission, RLS, or business-rule changes.
begin;

create or replace function public.get_vehicle_treasury_workspace(
  p_team_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result jsonb;
  v_search text := lower(btrim(coalesce(p_search,'')));
begin
  if not public.has_screen_permission('vehicleTreasury','view') then
    raise exception 'لا توجد صلاحية عرض خزينة السيارة';
  end if;

  if p_team_id is not null and not public.can_access_installation_team(p_team_id) then
    raise exception 'الفرقة / السيارة خارج نطاقك المسموح';
  end if;

  with allowed_teams as (
    select
      t.id,
      t.name as team_name,
      c.id as car_id,
      coalesce(nullif(btrim(c.name),''), nullif(btrim(t.car_name),''), t.name) as car_name,
      c.plate_number
    from public.installation_teams t
    left join public.appointment_cars c on c.id = t.appointment_car_id
    where t.appointment_car_id is not null
      and t.status <> 'غير نشطة'
      and public.can_access_installation_team(t.id)
  ), revenue as (
    select
      si.id as source_id,
      'revenue'::text as movement_type,
      ('VT-REV-' || replace(si.id::text,'-',''))::text as movement_serial,
      si.invoice_date as movement_date,
      coalesce(nullif(si.invoice_number,''), si.request_number, '—') as reference,
      ('فاتورة نقدية — ' || coalesce(si.request_number,'بدون رقم طلب'))::text as description,
      coalesce(si.final_amount, round(si.invoice_amount * 1.15, 2))::numeric as amount,
      coalesce(v.installation_team_id, r.installation_team_id) as team_id,
      null::text as notes,
      false as editable,
      si.created_at as sort_at
    from public.sales_invoices si
    left join public.installation_execution_visits v on v.id = si.installation_execution_visit_id
    left join public.installation_requests r on r.id = si.installation_request_id
    left join public.installation_request_collection c on c.installation_request_id = si.installation_request_id
    where si.status = 'صادرة'
      and si.source_type = 'installation'
      and btrim(coalesce(c.payment_method, si.payment_method, '')) = 'نقدي'
      and coalesce(v.installation_team_id, r.installation_team_id) is not null
      and public.can_access_installation_team(coalesce(v.installation_team_id, r.installation_team_id))
  ), expense as (
    select
      e.id as source_id,
      'expense'::text as movement_type,
      e.movement_serial,
      e.expense_date as movement_date,
      e.movement_serial as reference,
      e.description,
      (-e.amount)::numeric as amount,
      e.installation_team_id as team_id,
      e.notes,
      true as editable,
      e.created_at as sort_at
    from public.vehicle_treasury_expenses e
    where public.can_access_installation_team(e.installation_team_id)
  ), movements as (
    select * from revenue
    union all
    select * from expense
  ), filtered as (
    select
      m.source_id,
      m.movement_type,
      m.movement_serial,
      m.movement_date,
      m.reference,
      m.description,
      m.amount,
      m.team_id,
      m.notes,
      m.editable,
      m.sort_at,
      a.team_name,
      a.car_name,
      a.plate_number
    from movements m
    join allowed_teams a on a.id = m.team_id
    where (p_team_id is null or m.team_id = p_team_id)
      and (p_from is null or m.movement_date >= p_from)
      and (p_to is null or m.movement_date <= p_to)
      and (
        v_search = ''
        or lower(
          coalesce(m.reference,'') || ' ' ||
          coalesce(m.description,'') || ' ' ||
          coalesce(a.car_name,'') || ' ' ||
          coalesce(a.team_name,'')
        ) like '%' || v_search || '%'
      )
  )
  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', at.id,
          'teamName', at.team_name,
          'carId', at.car_id,
          'carName', at.car_name,
          'plateNumber', at.plate_number
        )
        order by at.car_name, at.team_name
      )
      from allowed_teams at
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.source_id,
          'sourceId', f.source_id,
          'movementType', f.movement_type,
          'movementSerial', f.movement_serial,
          'movementDate', f.movement_date,
          'reference', f.reference,
          'description', f.description,
          'amount', f.amount,
          'teamId', f.team_id,
          'teamName', f.team_name,
          'carName', f.car_name,
          'plateNumber', f.plate_number,
          'notes', f.notes,
          'editable', f.editable
        )
        order by f.movement_date desc, f.sort_at desc
      )
      from filtered f
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'revenue', coalesce((select sum(f.amount) from filtered f where f.amount > 0), 0),
      'expense', abs(coalesce((select sum(f.amount) from filtered f where f.amount < 0), 0)),
      'balance', coalesce((select sum(f.amount) from filtered f), 0),
      'count', (select count(*) from filtered f)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.get_vehicle_treasury_workspace(uuid,date,date,text) to authenticated;

commit;

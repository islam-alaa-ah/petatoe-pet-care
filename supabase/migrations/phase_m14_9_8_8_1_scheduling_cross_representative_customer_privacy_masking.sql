-- Phase M14.9.8.8.1 — Scheduling Cross-Representative Customer Privacy Masking
begin;

create or replace function public.get_installation_schedule_global()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.has_screen_permission('installationSchedule','view') then
    raise exception 'Missing installation schedule view permission' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      item
      order by item->>'scheduled_date' nulls last,
               item->>'scheduled_time' nulls last,
               item->>'request_number'
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select jsonb_build_object(
      'id', r.id,
      'request_number', r.request_number,
      'customer_order_number', coalesce(r.customer_order_number,''),
      'customer_name', case when scope.can_operate then coalesce(c.customer_name,'') else '' end,
      'customer_phone', case when scope.can_operate then coalesce(c.phone,'') else '' end,
      'customer_masked', not scope.can_operate,
      'representative_id', r.representative_id,
      'representative_name', coalesce(rep.full_name,''),
      'scheduled_date', r.scheduled_date,
      'scheduled_time', r.scheduled_time,
      'time_slot', coalesce(r.time_slot,''),
      'status', coalesce(r.status,'جديد'),
      'priority', coalesce(r.priority,'عادية'),
      'technician_id', r.technician_id,
      'technician_name', coalesce(r.assigned_technician_name, tech.full_name, ''),
      'technician_status', coalesce(tech.status,''),
      'team_id', r.installation_team_id,
      'team_name', coalesce(team.name,''),
      'installation_address', coalesce(r.installation_address,''),
      'total_services_count', coalesce(r.total_services_count,0),
      'total_services_amount', coalesce(r.total_services_amount,0),
      'assignment_notes', coalesce(r.assignment_notes,''),
      'can_operate', scope.can_operate,
      'services', coalesce(s.services,'[]'::jsonb)
    ) as item
    from public.installation_requests r
    cross join lateral (
      select public.can_access_installation_representative(r.representative_id) as can_operate
    ) scope
    left join public.customers c on c.id = r.customer_id
    left join public.sales_representatives rep on rep.id = r.representative_id
    left join public.installation_technicians tech on tech.id = r.technician_id
    left join public.installation_teams team on team.id = r.installation_team_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', rs.id,
          'name', coalesce(st.name,'خدمة'),
          'quantity', coalesce(rs.quantity,0),
          'unit_price', coalesce(rs.unit_price,0),
          'line_total', coalesce(rs.line_total,0)
        ) order by rs.id
      ) as services
      from public.installation_request_services rs
      left join public.installation_service_types st on st.id = rs.service_type_id
      where rs.installation_request_id = r.id
    ) s on true
  ) q;

  return v_result;
end;
$$;

grant execute on function public.get_installation_schedule_global() to authenticated;

comment on function public.get_installation_schedule_global() is
'Global scheduling feed. Customer name and phone are returned only when the caller can access the request representative; cross-representative rows remain operationally visible with customer identity masked.';

commit;

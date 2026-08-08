begin;

create table if not exists public.installation_schedule_day_locks (
  schedule_date date primary key,
  is_locked boolean not null default true,
  locked_by uuid references auth.users(id),
  locked_at timestamptz,
  unlocked_by uuid references auth.users(id),
  unlocked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.installation_schedule_day_locks enable row level security;
drop policy if exists "installation schedule day locks view" on public.installation_schedule_day_locks;
drop policy if exists "installation schedule day locks manage" on public.installation_schedule_day_locks;
create policy "installation schedule day locks view" on public.installation_schedule_day_locks for select to authenticated using (public.has_screen_permission('installationSchedule','view'));
create policy "installation schedule day locks manage" on public.installation_schedule_day_locks for all to authenticated using (public.has_screen_permission('installationSchedule','edit')) with check (public.has_screen_permission('installationSchedule','edit'));

create or replace function public.is_installation_schedule_day_locked(p_schedule_date date)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select is_locked from public.installation_schedule_day_locks where schedule_date=p_schedule_date),false)
$$;
grant execute on function public.is_installation_schedule_day_locked(date) to authenticated;

create or replace function public.get_installation_schedule_day_locks(p_date_from date,p_date_to date)
returns table(schedule_date date,is_locked boolean,locked_by_name text,locked_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_screen_permission('installationSchedule','view') then raise exception 'ليس لديك صلاحية عرض جدولة التركيبات'; end if;
  return query select l.schedule_date,l.is_locked,coalesce(u.full_name,u.email,''),l.locked_at
  from public.installation_schedule_day_locks l left join public.user_profiles u on u.id=l.locked_by
  where l.schedule_date between p_date_from and p_date_to;
end $$;
grant execute on function public.get_installation_schedule_day_locks(date,date) to authenticated;

create or replace function public.set_installation_schedule_day_lock(p_schedule_date date,p_is_locked boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.has_screen_permission('installationSchedule','edit') then raise exception 'ليس لديك صلاحية تعديل جدولة التركيبات'; end if;
  insert into public.installation_schedule_day_locks(schedule_date,is_locked,locked_by,locked_at,unlocked_by,unlocked_at,updated_at)
  values(p_schedule_date,p_is_locked,case when p_is_locked then auth.uid() end,case when p_is_locked then now() end,case when not p_is_locked then auth.uid() end,case when not p_is_locked then now() end,now())
  on conflict(schedule_date) do update set is_locked=excluded.is_locked,locked_by=case when excluded.is_locked then auth.uid() else installation_schedule_day_locks.locked_by end,locked_at=case when excluded.is_locked then now() else installation_schedule_day_locks.locked_at end,unlocked_by=case when not excluded.is_locked then auth.uid() else installation_schedule_day_locks.unlocked_by end,unlocked_at=case when not excluded.is_locked then now() else installation_schedule_day_locks.unlocked_at end,updated_at=now();
  return p_is_locked;
end $$;
grant execute on function public.set_installation_schedule_day_lock(date,boolean) to authenticated;

create or replace function public.get_installation_technician_booked_times(p_schedule_date date,p_technician_name text,p_exclude_request_id uuid default null)
returns table(scheduled_time time,request_number text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_screen_permission('installationSchedule','view') then raise exception 'ليس لديك صلاحية عرض جدولة التركيبات'; end if;
  return query select r.scheduled_time,r.request_number
  from public.installation_requests r
  where r.scheduled_date=p_schedule_date and r.scheduled_time is not null
    and lower(regexp_replace(trim(coalesce(r.assigned_technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(p_technician_name,'')),'\s+',' ','g'))
    and (p_exclude_request_id is null or r.id<>p_exclude_request_id)
    and coalesce(r.status,'') not in ('ملغى','ملغاة');
end $$;
grant execute on function public.get_installation_technician_booked_times(date,text,uuid) to authenticated;

create or replace function public.guard_installation_schedule_write()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.scheduled_date is not null and (tg_op='INSERT' or old.scheduled_date is distinct from new.scheduled_date or old.scheduled_time is distinct from new.scheduled_time or old.assigned_technician_name is distinct from new.assigned_technician_name or old.installation_team_id is distinct from new.installation_team_id) then
    if public.is_installation_schedule_day_locked(new.scheduled_date) then raise exception 'هذا اليوم مغلق. افتح اليوم أولًا قبل الجدولة.'; end if;
    if new.scheduled_time is not null and nullif(trim(new.assigned_technician_name),'') is not null and exists(
      select 1 from public.installation_requests x where x.id<>new.id and x.scheduled_date=new.scheduled_date and x.scheduled_time=new.scheduled_time
      and lower(regexp_replace(trim(coalesce(x.assigned_technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(new.assigned_technician_name),'\s+',' ','g'))
      and coalesce(x.status,'') not in ('ملغى','ملغاة')
    ) then raise exception 'هذا الموعد محجوز للفني المحدد. اختر موعدًا آخر.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_installation_schedule_write on public.installation_requests;
create trigger trg_guard_installation_schedule_write before insert or update of scheduled_date,scheduled_time,assigned_technician_name,installation_team_id on public.installation_requests for each row execute function public.guard_installation_schedule_write();

commit;

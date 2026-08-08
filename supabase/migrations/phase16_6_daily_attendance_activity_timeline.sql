-- KYUM Phase 16.6 — Daily Attendance & Activity Timeline
-- Run once in Supabase SQL Editor.

begin;

create table if not exists public.daily_employee_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  work_date date not null default current_date,
  first_activity_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  heartbeat_count integer not null default 1,
  event_count integer not null default 1,
  last_event_type text not null default 'login',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,work_date)
);

create index if not exists daily_employee_sessions_date_idx
  on public.daily_employee_sessions(work_date,last_activity_at desc);

alter table public.daily_employee_sessions enable row level security;

drop policy if exists "daily sessions own read" on public.daily_employee_sessions;
create policy "daily sessions own read"
on public.daily_employee_sessions for select to authenticated
using(
  user_id = auth.uid()
  or public.current_user_role() in (
    'super_admin','sales_manager','sales_supervisor','viewer'
  )
);

drop policy if exists "daily sessions own insert" on public.daily_employee_sessions;
create policy "daily sessions own insert"
on public.daily_employee_sessions for insert to authenticated
with check(user_id = auth.uid());

drop policy if exists "daily sessions own update" on public.daily_employee_sessions;
create policy "daily sessions own update"
on public.daily_employee_sessions for update to authenticated
using(user_id = auth.uid())
with check(user_id = auth.uid());

create or replace function public.touch_daily_employee_session(
  p_event_type text default 'heartbeat',
  p_representative_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.daily_employee_sessions%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  insert into public.daily_employee_sessions(
    user_id,representative_id,work_date,
    first_activity_at,last_activity_at,heartbeat_count,event_count,last_event_type
  )
  values(
    v_user,p_representative_id,current_date,
    now(),now(),1,1,coalesce(p_event_type,'heartbeat')
  )
  on conflict(user_id,work_date) do update
  set
    representative_id=coalesce(excluded.representative_id,daily_employee_sessions.representative_id),
    last_activity_at=now(),
    ended_at=null,
    heartbeat_count=daily_employee_sessions.heartbeat_count+1,
    event_count=daily_employee_sessions.event_count+1,
    last_event_type=coalesce(p_event_type,'heartbeat'),
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'success',true,
    'session_id',v_row.id,
    'work_date',v_row.work_date,
    'first_activity_at',v_row.first_activity_at,
    'last_activity_at',v_row.last_activity_at
  );
end;
$$;

create or replace function public.end_daily_employee_session()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.daily_employee_sessions%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.daily_employee_sessions
  set
    last_activity_at=now(),
    ended_at=now(),
    event_count=event_count+1,
    last_event_type='end_day',
    updated_at=now()
  where user_id=v_user
    and work_date=current_date
  returning * into v_row;

  if not found then
    raise exception 'No active daily session found';
  end if;

  return jsonb_build_object(
    'success',true,
    'session_id',v_row.id,
    'ended_at',v_row.ended_at
  );
end;
$$;

insert into public.app_screens(
  screen_key,screen_name,group_name,display_order,is_active
)
values(
  'dailyAttendanceActivity',
  'الحضور والنشاط اليومي',
  'التقارير والتحليلات',
  68,
  true
)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export
)
values
  ('super_admin','dailyAttendanceActivity',true,false,false,false,true),
  ('sales_manager','dailyAttendanceActivity',true,false,false,false,true),
  ('sales_supervisor','dailyAttendanceActivity',true,false,false,false,true),
  ('sales_representative','dailyAttendanceActivity',false,false,false,false,false),
  ('customer_service','dailyAttendanceActivity',false,false,false,false,false),
  ('viewer','dailyAttendanceActivity',true,false,false,false,true)
on conflict(role,screen_key) do update set
  can_view=excluded.can_view,
  can_export=excluded.can_export;

grant select,insert,update on public.daily_employee_sessions to authenticated;
grant execute on function public.touch_daily_employee_session(text,uuid) to authenticated;
grant execute on function public.end_daily_employee_session() to authenticated;

commit;
notify pgrst,'reload schema';

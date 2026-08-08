begin;

alter table public.installation_requests
  add column if not exists scheduled_time time without time zone,
  add column if not exists assigned_technician_name text;

alter table public.installation_requests
  drop constraint if exists installation_requests_scheduled_time_range_check;

alter table public.installation_requests
  add constraint installation_requests_scheduled_time_range_check
  check (
    scheduled_time is null
    or (
      scheduled_time >= time '10:00:00'
      and scheduled_time <= time '21:00:00'
      and extract(minute from scheduled_time) = 0
      and extract(second from scheduled_time) = 0
    )
  );

create table if not exists public.installation_technician_name_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists idx_installation_technician_name_suggestions_active_name
  on public.installation_technician_name_suggestions(is_active,name);

insert into public.installation_technician_name_suggestions(name,normalized_name,is_active)
select distinct trim(t.full_name), lower(regexp_replace(trim(t.full_name),'\\s+',' ','g')), true
from public.installation_technicians t
where nullif(trim(t.full_name),'') is not null
on conflict (normalized_name) do update set name=excluded.name,is_active=true;

update public.installation_requests r
set assigned_technician_name=t.full_name
from public.installation_technicians t
where r.technician_id=t.id
  and nullif(trim(r.assigned_technician_name),'') is null;

insert into public.installation_technician_name_suggestions(name,normalized_name,is_active)
select distinct trim(r.assigned_technician_name),lower(regexp_replace(trim(r.assigned_technician_name),'\\s+',' ','g')),true
from public.installation_requests r
where nullif(trim(r.assigned_technician_name),'') is not null
on conflict (normalized_name) do update set name=excluded.name,is_active=true;

create or replace function public.stamp_manual_installation_assignment()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if new.assigned_technician_name is distinct from old.assigned_technician_name
     or new.scheduled_date is distinct from old.scheduled_date
     or new.scheduled_time is distinct from old.scheduled_time then
    new.assigned_at = case
      when nullif(trim(new.assigned_technician_name),'') is null then null
      else now()
    end;
    new.assigned_by = case
      when nullif(trim(new.assigned_technician_name),'') is null then null
      else auth.uid()
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_manual_installation_assignment on public.installation_requests;
create trigger trg_stamp_manual_installation_assignment
before update of assigned_technician_name,scheduled_date,scheduled_time
on public.installation_requests
for each row execute function public.stamp_manual_installation_assignment();

alter table public.installation_technician_name_suggestions enable row level security;

drop policy if exists "installation technician names view" on public.installation_technician_name_suggestions;
drop policy if exists "installation technician names add" on public.installation_technician_name_suggestions;
drop policy if exists "installation technician names edit" on public.installation_technician_name_suggestions;

create policy "installation technician names view"
on public.installation_technician_name_suggestions
for select to authenticated
using (public.has_screen_permission('installationSchedule','view'));

create policy "installation technician names add"
on public.installation_technician_name_suggestions
for insert to authenticated
with check (public.has_screen_permission('installationSchedule','edit'));

create policy "installation technician names edit"
on public.installation_technician_name_suggestions
for update to authenticated
using (public.has_screen_permission('installationSchedule','edit'))
with check (public.has_screen_permission('installationSchedule','edit'));

grant select,insert,update on public.installation_technician_name_suggestions to authenticated;

commit;

-- Phase M14.9.1 — Team Daily Tasks & Active Installation Workflow
begin;
alter table public.installation_requests add column if not exists arrived_at timestamptz;

create table if not exists public.installation_execution_files(
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  mime_type text check(mime_type is null or mime_type in ('image/jpeg','image/png','image/webp')),
  file_size bigint check(file_size is null or file_size between 1 and 10485760),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_installation_execution_files_request on public.installation_execution_files(installation_request_id,uploaded_at desc);
alter table public.installation_execution_files enable row level security;
drop policy if exists "installation execution files view" on public.installation_execution_files;
drop policy if exists "installation execution files add" on public.installation_execution_files;
create policy "installation execution files view" on public.installation_execution_files for select to authenticated using(
 public.has_screen_permission('installationExecution','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
create policy "installation execution files add" on public.installation_execution_files for insert to authenticated with check(
 public.has_screen_permission('installationExecution','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
grant select,insert on public.installation_execution_files to authenticated;

-- Keep the execution state timestamps consistent.
create or replace function public.track_installation_execution_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status then
  new.last_status_changed_at=now(); new.last_status_changed_by=auth.uid();
  if new.status='في الطريق' and new.on_route_at is null then new.on_route_at=now(); end if;
  if new.status='وصل إلى العميل' and new.arrived_at is null then new.arrived_at=now(); end if;
  if new.status='قيد التنفيذ' and new.started_at is null then new.started_at=now(); end if;
  if new.status='مكتمل' and new.completed_at is null then new.completed_at=now(); end if;
  insert into public.installation_status_history(installation_request_id,old_status,new_status,notes,failure_reason,changed_by)
  values(new.id,old.status,new.status,new.execution_notes,new.execution_failure_reason,auth.uid());
 end if;
 return new;
end;$$;
commit;

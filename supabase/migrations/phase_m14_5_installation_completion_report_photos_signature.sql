-- Phase M14.5 — Installation Completion Report, Photos & Customer Signature
begin;

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('installationCompletion','محاضر التركيبات','إدارة التركيبات',69,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin'::public.app_role,'installationCompletion',true,false,true,false,true)
on conflict(role,screen_key) do update set can_view=true,can_edit=true,can_export=true,updated_at=now();

create table if not exists public.installation_completion_reports(
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null unique references public.installation_requests(id) on delete cascade,
  work_summary text not null check(length(trim(work_summary)) > 0),
  recipient_name text not null check(length(trim(recipient_name)) > 0),
  recipient_role text,
  customer_notes text,
  signed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installation_completion_files(
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  file_kind text not null check(file_kind in ('before','after','signature')),
  storage_path text not null unique,
  original_name text,
  mime_type text check(mime_type is null or mime_type in ('image/jpeg','image/png','image/webp')),
  file_size bigint check(file_size is null or file_size between 1 and 10485760),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_installation_completion_reports_request on public.installation_completion_reports(installation_request_id);
create index if not exists idx_installation_completion_files_request_kind on public.installation_completion_files(installation_request_id,file_kind);

drop trigger if exists trg_installation_completion_reports_updated_at on public.installation_completion_reports;
create trigger trg_installation_completion_reports_updated_at before update on public.installation_completion_reports for each row execute function public.set_updated_at();

create or replace function public.validate_installation_completion_report()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.installation_requests r where r.id=new.installation_request_id and r.status='مكتمل') then
    raise exception 'Installation request must be completed before creating its completion report' using errcode='23514';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_validate_installation_completion_report on public.installation_completion_reports;
create trigger trg_validate_installation_completion_report before insert or update on public.installation_completion_reports for each row execute function public.validate_installation_completion_report();

alter table public.installation_completion_reports enable row level security;
alter table public.installation_completion_files enable row level security;

drop policy if exists "installation completion scoped select" on public.installation_completion_reports;
drop policy if exists "installation completion scoped insert" on public.installation_completion_reports;
drop policy if exists "installation completion scoped update" on public.installation_completion_reports;
create policy "installation completion scoped select" on public.installation_completion_reports for select to authenticated using(
  public.has_screen_permission('installationCompletion','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
);
create policy "installation completion scoped insert" on public.installation_completion_reports for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل' and public.can_access_representative(r.representative_id))
);
create policy "installation completion scoped update" on public.installation_completion_reports for update to authenticated using(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
) with check(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل' and public.can_access_representative(r.representative_id))
);

drop policy if exists "installation files scoped select" on public.installation_completion_files;
drop policy if exists "installation files scoped insert" on public.installation_completion_files;
create policy "installation files scoped select" on public.installation_completion_files for select to authenticated using(
  public.has_screen_permission('installationCompletion','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
);
create policy "installation files scoped insert" on public.installation_completion_files for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل' and public.can_access_representative(r.representative_id))
);

grant select,insert,update on public.installation_completion_reports to authenticated;
grant select,insert on public.installation_completion_files to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('installation-evidence','installation-evidence',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "installation evidence scoped read" on storage.objects;
drop policy if exists "installation evidence scoped upload" on storage.objects;
create policy "installation evidence scoped read" on storage.objects for select to authenticated using(
  bucket_id='installation-evidence' and public.has_screen_permission('installationCompletion','view') and exists(
    select 1 from public.installation_requests r where r.id::text=split_part(name,'/',1) and public.can_access_representative(r.representative_id)
  )
);
create policy "installation evidence scoped upload" on storage.objects for insert to authenticated with check(
  bucket_id='installation-evidence' and public.has_screen_permission('installationCompletion','edit') and exists(
    select 1 from public.installation_requests r where r.id::text=split_part(name,'/',1) and r.status='مكتمل' and public.can_access_representative(r.representative_id)
  )
);

commit;

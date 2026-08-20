-- Phase P5.13.8.45 — Completion attachment permission-safe read
-- Scope: read-only attachment retrieval for installationCompletion.
-- Do not broaden installation_execution_files RLS; execution keeps its own screen permission boundary.
begin;

create or replace function public.get_installation_completion_execution_files()
returns table(
  id uuid,
  installation_request_id uuid,
  execution_visit_id uuid,
  storage_path text,
  original_name text,
  mime_type text,
  file_size bigint,
  file_kind text,
  uploaded_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول.';
  end if;
  if not public.has_screen_permission('installationCompletion','view') then
    raise exception 'لا توجد صلاحية لعرض تأكيد انتهاء المواعيد.';
  end if;

  return query
  select
    f.id,
    f.installation_request_id,
    f.execution_visit_id,
    f.storage_path,
    f.original_name,
    f.mime_type,
    f.file_size,
    coalesce(f.file_kind,'execution')::text as file_kind,
    f.uploaded_at
  from public.installation_execution_files f
  join public.installation_requests r
    on r.id=f.installation_request_id
  left join public.installation_execution_visits v
    on v.id=f.execution_visit_id
   and v.installation_request_id=f.installation_request_id
  where public.can_access_installation_request_scope(
    r.representative_id,
    coalesce(v.installation_team_id,r.installation_team_id)
  )
  order by f.uploaded_at asc, f.id;
end;
$$;

revoke all on function public.get_installation_completion_execution_files() from public,anon;
grant execute on function public.get_installation_completion_execution_files() to authenticated,service_role;

notify pgrst,'reload schema';
commit;

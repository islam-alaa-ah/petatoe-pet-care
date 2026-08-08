-- Phase M14.9.2 — Completion Work Queue & Representative Scope
begin;

drop policy if exists "installation completion scoped select" on public.installation_completion_reports;
drop policy if exists "installation completion scoped insert" on public.installation_completion_reports;
drop policy if exists "installation completion scoped update" on public.installation_completion_reports;
create policy "installation completion scoped select" on public.installation_completion_reports for select to authenticated using(
  public.has_screen_permission('installationCompletion','view') and exists(
    select 1 from public.installation_requests r where r.id=installation_request_id
      and public.can_access_installation_representative(r.representative_id)
      and public.can_access_installation_team(r.installation_team_id)
  )
);
create policy "installation completion scoped insert" on public.installation_completion_reports for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit') and exists(
    select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل'
      and public.can_access_installation_representative(r.representative_id)
      and public.can_access_installation_team(r.installation_team_id)
  )
);
create policy "installation completion scoped update" on public.installation_completion_reports for update to authenticated using(
  public.has_screen_permission('installationCompletion','edit') and exists(
    select 1 from public.installation_requests r where r.id=installation_request_id
      and public.can_access_installation_representative(r.representative_id)
      and public.can_access_installation_team(r.installation_team_id)
  )
) with check(
  public.has_screen_permission('installationCompletion','edit') and exists(
    select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل'
      and public.can_access_installation_representative(r.representative_id)
      and public.can_access_installation_team(r.installation_team_id)
  )
);

drop policy if exists "installation files scoped select" on public.installation_completion_files;
drop policy if exists "installation files scoped insert" on public.installation_completion_files;
create policy "installation files scoped select" on public.installation_completion_files for select to authenticated using(
  public.has_screen_permission('installationCompletion','view') and exists(
    select 1 from public.installation_requests r where r.id=installation_request_id
      and public.can_access_installation_representative(r.representative_id)
      and public.can_access_installation_team(r.installation_team_id)
  )
);
create policy "installation files scoped insert" on public.installation_completion_files for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit') and exists(
    select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل'
      and public.can_access_installation_representative(r.representative_id)
      and public.can_access_installation_team(r.installation_team_id)
  )
);

commit;

-- Phase M14.8.5 — Independent Installation Representative Visibility Scope
begin;

create table if not exists public.installation_data_access_profiles (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  access_mode text not null default 'own' check (access_mode in ('own','selected','all')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.installation_data_access_representatives (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  representative_id uuid not null references public.sales_representatives(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,representative_id)
);

create index if not exists idx_installation_access_representatives_rep on public.installation_data_access_representatives(representative_id);

create or replace function public.can_access_installation_representative(p_representative_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when auth.uid() is null then false
    when public.current_user_role() = 'super_admin' then true
    when p_representative_id is null then false
    else exists (
      select 1
      from public.user_profiles up
      left join public.installation_data_access_profiles ap on ap.user_id=up.id
      where up.id=auth.uid() and up.is_active=true
        and (
          coalesce(ap.access_mode,'own')='all'
          or up.representative_id=p_representative_id
          or (
            coalesce(ap.access_mode,'own')='selected'
            and exists (
              select 1 from public.installation_data_access_representatives ar
              where ar.user_id=up.id and ar.representative_id=p_representative_id
            )
          )
        )
    )
  end
$$;

grant execute on function public.can_access_installation_representative(uuid) to authenticated;

alter table public.installation_data_access_profiles enable row level security;
alter table public.installation_data_access_representatives enable row level security;

drop policy if exists installation_access_profiles_manage on public.installation_data_access_profiles;
create policy installation_access_profiles_manage on public.installation_data_access_profiles
for all to authenticated
using (public.has_screen_permission('users','edit'))
with check (public.has_screen_permission('users','edit'));

drop policy if exists installation_access_profiles_self_read on public.installation_data_access_profiles;
create policy installation_access_profiles_self_read on public.installation_data_access_profiles
for select to authenticated using(user_id=auth.uid() or public.has_screen_permission('users','view'));

drop policy if exists installation_access_reps_manage on public.installation_data_access_representatives;
create policy installation_access_reps_manage on public.installation_data_access_representatives
for all to authenticated
using (public.has_screen_permission('users','edit'))
with check (public.has_screen_permission('users','edit'));

drop policy if exists installation_access_reps_self_read on public.installation_data_access_representatives;
create policy installation_access_reps_self_read on public.installation_data_access_representatives
for select to authenticated using(user_id=auth.uid() or public.has_screen_permission('users','view'));

grant select,insert,update,delete on public.installation_data_access_profiles to authenticated;
grant select,insert,update,delete on public.installation_data_access_representatives to authenticated;

-- Core installation requests: independent scope, unrelated to customer-management scope.
drop policy if exists "installation requests scoped select" on public.installation_requests;
drop policy if exists "installation requests scoped insert" on public.installation_requests;
drop policy if exists "installation requests scoped update" on public.installation_requests;
drop policy if exists "installation requests scoped delete" on public.installation_requests;
create policy "installation requests scoped select" on public.installation_requests for select to authenticated
using (
  (public.has_screen_permission('installationRequests','view')
   or public.has_screen_permission('installationSchedule','view')
   or public.has_screen_permission('installationExecution','view')
   or public.has_screen_permission('installationCompletion','view')
   or public.has_screen_permission('installationExceptions','view')
   or public.has_screen_permission('installationReports','view')
   or public.has_screen_permission('installationsOverview','view'))
  and public.can_access_installation_representative(representative_id)
);
create policy "installation requests scoped insert" on public.installation_requests for insert to authenticated
with check (public.has_screen_permission('installationRequestNew','add') and public.can_access_installation_representative(representative_id));
create policy "installation requests scoped update" on public.installation_requests for update to authenticated
using (
  (public.has_screen_permission('installationRequests','edit') or public.has_screen_permission('installationSchedule','edit') or public.has_screen_permission('installationExecution','edit'))
  and public.can_access_installation_representative(representative_id)
)
with check (
  (public.has_screen_permission('installationRequests','edit') or public.has_screen_permission('installationSchedule','edit') or public.has_screen_permission('installationExecution','edit'))
  and public.can_access_installation_representative(representative_id)
);
create policy "installation requests scoped delete" on public.installation_requests for delete to authenticated
using (public.has_screen_permission('installationRequests','delete') and public.can_access_installation_representative(representative_id));

-- Child records inherit the installation scope from the parent request.
drop policy if exists "installation request services scoped select" on public.installation_request_services;
drop policy if exists "installation request services scoped insert" on public.installation_request_services;
drop policy if exists "installation request services scoped update" on public.installation_request_services;
drop policy if exists "installation request services scoped delete" on public.installation_request_services;
create policy "installation request services scoped select" on public.installation_request_services for select to authenticated using(
  exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
create policy "installation request services scoped insert" on public.installation_request_services for insert to authenticated with check(
  public.has_screen_permission('installationRequestNew','add') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
create policy "installation request services scoped update" on public.installation_request_services for update to authenticated using(
  public.has_screen_permission('installationRequests','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
) with check(
  public.has_screen_permission('installationRequests','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
create policy "installation request services scoped delete" on public.installation_request_services for delete to authenticated using(
  public.has_screen_permission('installationRequests','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);

-- Completion reports and files.
drop policy if exists "installation completion scoped select" on public.installation_completion_reports;
drop policy if exists "installation completion scoped insert" on public.installation_completion_reports;
drop policy if exists "installation completion scoped update" on public.installation_completion_reports;
create policy "installation completion scoped select" on public.installation_completion_reports for select to authenticated using(
  public.has_screen_permission('installationCompletion','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
create policy "installation completion scoped insert" on public.installation_completion_reports for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل' and public.can_access_installation_representative(r.representative_id))
);
create policy "installation completion scoped update" on public.installation_completion_reports for update to authenticated using(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
) with check(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل' and public.can_access_installation_representative(r.representative_id))
);

drop policy if exists "installation files scoped select" on public.installation_completion_files;
drop policy if exists "installation files scoped insert" on public.installation_completion_files;
create policy "installation files scoped select" on public.installation_completion_files for select to authenticated using(
  public.has_screen_permission('installationCompletion','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
create policy "installation files scoped insert" on public.installation_completion_files for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل' and public.can_access_installation_representative(r.representative_id))
);

-- Revisit workflow.
drop policy if exists installation_revisits_select on public.installation_revisits;
drop policy if exists installation_revisits_write on public.installation_revisits;
create policy installation_revisits_select on public.installation_revisits for select to authenticated using(
  public.has_screen_permission('installationExceptions','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);
create policy installation_revisits_write on public.installation_revisits for all to authenticated using(
  public.has_screen_permission('installationExceptions','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
) with check(
  public.has_screen_permission('installationExceptions','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);

-- Status history must also respect the parent request scope.
drop policy if exists "installation execution history view" on public.installation_status_history;
create policy "installation execution history view" on public.installation_status_history for select to authenticated using(
  public.has_screen_permission('installationExecution','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id))
);

-- Permit only the basic related records needed to render installation screens.
-- This does not grant access to the customer-management screens or their actions.
drop policy if exists "installation linked customers read" on public.customers;
create policy "installation linked customers read" on public.customers for select to authenticated using(
  exists(select 1 from public.installation_requests r where r.customer_id=customers.id and public.can_access_installation_representative(r.representative_id))
  and (public.has_screen_permission('installationRequests','view') or public.has_screen_permission('installationSchedule','view') or public.has_screen_permission('installationExecution','view') or public.has_screen_permission('installationCompletion','view') or public.has_screen_permission('installationExceptions','view'))
);

drop policy if exists "installation linked quotations read" on public.quotations;
create policy "installation linked quotations read" on public.quotations for select to authenticated using(
  exists(select 1 from public.installation_requests r where r.quotation_id=quotations.id and public.can_access_installation_representative(r.representative_id))
  and public.has_screen_permission('installationRequests','view')
);

drop policy if exists "installation scoped representatives read" on public.sales_representatives;
create policy "installation scoped representatives read" on public.sales_representatives for select to authenticated using(
  public.can_access_installation_representative(sales_representatives.id)
  and (public.has_screen_permission('installationRequests','view') or public.has_screen_permission('installationSchedule','view') or public.has_screen_permission('installationReports','view'))
);

commit;

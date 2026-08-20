-- Phase P5.13.8.42 — Completion group invoice authority
-- Scope: completion invoice visibility only.
-- Canonical identity remains the same execution identity used by execution:
-- request + team + scheduled date. One execution group -> one completion row -> one invoice.
begin;

create or replace function public.get_installation_completion_invoice_markers()
returns table(
  installation_request_id uuid,
  installation_execution_visit_id uuid
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

  -- Request-level legacy invoices remain request-level markers.
  return query
  select distinct
    si.installation_request_id,
    null::uuid
  from public.sales_invoices si
  join public.installation_requests r on r.id=si.installation_request_id
  where si.source_type='installation'
    and coalesce(si.status,'') <> 'ملغاة'
    and si.installation_execution_visit_id is null
    and public.can_access_installation_representative(r.representative_id);

  -- A visit-backed invoice is authoritative for the whole canonical execution group,
  -- even though sales_invoices stores one canonical/anchor visit id.
  return query
  with visible_invoices as (
    select
      si.installation_request_id,
      si.installation_execution_visit_id
    from public.sales_invoices si
    join public.installation_requests r on r.id=si.installation_request_id
    where si.source_type='installation'
      and coalesce(si.status,'') <> 'ملغاة'
      and si.installation_execution_visit_id is not null
      and public.can_access_installation_representative(r.representative_id)
  ), expanded as (
    select
      vi.installation_request_id,
      coalesce(g.visit_id,vi.installation_execution_visit_id) as visit_id
    from visible_invoices vi
    left join lateral (
      select unnest(public.get_installation_execution_group_visit_ids(
        vi.installation_request_id,
        vi.installation_execution_visit_id
      )) as visit_id
    ) g on true
  )
  select distinct
    e.installation_request_id,
    e.visit_id
  from expanded e;
end;
$$;

grant execute on function public.get_installation_completion_invoice_markers() to authenticated;

notify pgrst,'reload schema';
commit;

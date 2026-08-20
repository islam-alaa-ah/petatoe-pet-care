-- Phase P5.13.8.41 — Completion invoice visibility recovery
-- Scope: completion queue invoice markers only. No appointment, execution, collection or invoice write behavior changes.
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

  return query
  select
    si.installation_request_id,
    si.installation_execution_visit_id
  from public.sales_invoices si
  join public.installation_requests r on r.id=si.installation_request_id
  where si.source_type='installation'
    and coalesce(si.status,'') <> 'ملغاة'
    and public.can_access_installation_representative(r.representative_id);
end;
$$;

grant execute on function public.get_installation_completion_invoice_markers() to authenticated;

commit;

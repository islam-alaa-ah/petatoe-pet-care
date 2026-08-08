-- KYUM Phase 07 — Reference data audit policy
-- Run once in the Kyum Trading Company Supabase project.

drop policy if exists "authenticated insert own audit logs" on public.audit_logs;

create policy "authenticated insert own audit logs"
on public.audit_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and action in ('insert', 'update')
  and entity_type in (
    'sales_representatives',
    'interest_categories',
    'no_sale_reasons'
  )
);

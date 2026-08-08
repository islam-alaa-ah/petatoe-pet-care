
-- Basic authenticated-user policies for Phase 1.
-- These are intentionally simple and will be replaced by role-based policies in a later phase.

alter table public.sales_representatives enable row level security;
alter table public.interest_categories enable row level security;
alter table public.no_sale_reasons enable row level security;
alter table public.customers enable row level security;
alter table public.customer_interests enable row level security;

drop policy if exists "authenticated read representatives" on public.sales_representatives;
create policy "authenticated read representatives"
on public.sales_representatives for select
to authenticated
using (true);

drop policy if exists "authenticated read interests" on public.interest_categories;
create policy "authenticated read interests"
on public.interest_categories for select
to authenticated
using (true);

drop policy if exists "authenticated read reasons" on public.no_sale_reasons;
create policy "authenticated read reasons"
on public.no_sale_reasons for select
to authenticated
using (true);

drop policy if exists "authenticated manage customers" on public.customers;
create policy "authenticated manage customers"
on public.customers for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated manage customer interests" on public.customer_interests;
create policy "authenticated manage customer interests"
on public.customer_interests for all
to authenticated
using (true)
with check (true);

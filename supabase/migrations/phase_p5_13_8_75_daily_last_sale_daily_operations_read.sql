-- R44R26 Daily last sale: dedicated read-only scope for Daily Operations.
-- Do not grant Sales Reports or Customer Reports; do not modify those RPCs.
begin;
create or replace function public.daily_last_sale_snapshot_r44r26()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_cutoff date := (now() at time zone 'Asia/Riyadh')::date;
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view' using errcode = '42501';
  end if;

  -- Same current and historical documented sales sources used by A17.
  -- A dedicated projection intentionally exposes no financial amounts.
  with sales_dates as (
    select si.customer_id,si.invoice_date::date as sale_date
      from public.sales_invoices si
     where si.customer_id is not null and si.invoice_date<=v_cutoff
    union all
    select h.customer_id,h.sales_date::date
      from public.appointment_historical_sales_reporting h
     where h.customer_id is not null and h.sales_date<=v_cutoff
  ), aggregated as (
    select s.customer_id,max(s.sale_date) as last_sale,count(*) as transactions
    from sales_dates s group by s.customer_id
  )
  select jsonb_build_object('cutoff',v_cutoff::text,'customers',coalesce(jsonb_agg(
    jsonb_build_object(
      'id',c.id::text,'name',coalesce(c.customer_name,''),
      'phone',coalesce(c.phone,''),'customer_number',coalesce(c.customer_number,''),
      'last_sale',a.last_sale::text,'gap_days',v_cutoff-a.last_sale,
      'transactions',coalesce(a.transactions,0)
    ) order by c.id), '[]'::jsonb))
    into v_result
    from public.customers c left join aggregated a on a.customer_id=c.id;
  return v_result;
end;
$$;
revoke all on function public.daily_last_sale_snapshot_r44r26() from public,anon;
grant execute on function public.daily_last_sale_snapshot_r44r26() to authenticated,service_role;
notify pgrst,'reload schema';
commit;

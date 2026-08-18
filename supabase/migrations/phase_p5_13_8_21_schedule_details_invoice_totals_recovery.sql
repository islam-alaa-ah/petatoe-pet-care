-- Phase P5.13.8.21 — schedule details runtime recovery + canonical grouped invoice amount backfill.
begin;

-- Repair existing appointment invoices so a same-day/same-team execution group carries
-- the complete executed value once, rather than the value of only the canonical visit.
do $$
declare
  inv record;
  ids uuid[];
  amount numeric(14,2);
  cost numeric(14,2);
begin
  for inv in
    select id,installation_request_id,installation_execution_visit_id
    from public.sales_invoices
    where source_type='installation'
      and status<>'ملغاة'
      and installation_request_id is not null
      and installation_execution_visit_id is not null
  loop
    ids:=public.get_installation_execution_group_visit_ids(inv.installation_request_id,inv.installation_execution_visit_id);
    if coalesce(cardinality(ids),0)=0 then ids:=array[inv.installation_execution_visit_id]; end if;

    with service_qty as (
      select rs.id,rs.unit_price,coalesce(st.default_cost,0) default_cost,rs.quantity requested_qty,
             least(rs.quantity,coalesce(sum(coalesce(vs.executed_quantity,0)),0)) invoiced_qty
      from public.installation_request_services rs
      left join public.installation_service_types st on st.id=rs.service_type_id
      left join public.installation_execution_visit_services vs
        on vs.request_service_id=rs.id and vs.visit_id=any(ids)
      where rs.installation_request_id=inv.installation_request_id
      group by rs.id,rs.unit_price,st.default_cost,rs.quantity
    )
    select coalesce(sum(invoiced_qty*unit_price),0)::numeric(14,2),
           coalesce(sum(invoiced_qty*default_cost),0)::numeric(14,2)
      into amount,cost
    from service_qty;

    if amount>0 then
      update public.sales_invoices
      set invoice_amount=amount,installation_expenses=cost,updated_at=now()
      where id=inv.id;
    end if;
  end loop;
end;
$$;

notify pgrst,'reload schema';
commit;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name='update_installation_request_with_services';

select column_name,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='installation_requests'
  and column_name in ('customer_id','quotation_id','neighborhood_id','customer_map_url','priority','notes')
order by column_name;

select count(*) as orphan_service_rows
from public.installation_request_services s
left join public.installation_requests r on r.id=s.installation_request_id
where r.id is null;

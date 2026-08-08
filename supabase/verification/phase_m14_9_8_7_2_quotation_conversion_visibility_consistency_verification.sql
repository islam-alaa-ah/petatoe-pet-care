-- Phase M14.9.8.7.2 verification

select q.id as quotation_id, q.quotation_number,
       q.installation_request_id as quotation_pointer,
       r.id as canonical_request_id
from public.quotations q
left join public.installation_requests r on r.quotation_id = q.id
where q.installation_request_id is distinct from r.id;

select quotation_id, count(*) as request_count
from public.installation_requests
where quotation_id is not null
group by quotation_id
having count(*) > 1;

select r.id, r.request_number, r.customer_id, r.customer_order_number, r.created_at
from public.installation_requests r
where r.quotation_id is null
  and nullif(btrim(coalesce(r.customer_order_number, '')), '') is not null
order by r.created_at desc;

select q.quotation_number, q.customer_id, q.status,
       q.installation_request_id, q.installation_converted_at
from public.quotations q
where q.status = 'مقبول'
order by q.quotation_date desc, q.created_at desc;

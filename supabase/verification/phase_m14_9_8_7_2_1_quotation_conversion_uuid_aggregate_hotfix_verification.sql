-- Phase M14.9.8.7.2.1 verification

-- 1) Every quotation-side link must match the request-side relationship.
-- Expected: 0 rows
select
  q.id as quotation_id,
  q.quotation_number,
  q.installation_request_id,
  r.id as actual_request_id
from public.quotations q
left join public.installation_requests r
  on r.quotation_id = q.id
where q.installation_request_id is distinct from r.id;

-- 2) No quotation may be linked to more than one installation request.
-- Expected: 0 rows
select
  quotation_id,
  count(*) as request_count
from public.installation_requests
where quotation_id is not null
group by quotation_id
having count(*) > 1;

-- 3) Accepted quotations with a confirmed installation relationship
-- must have workflow markers populated.
-- Expected: 0 rows
select
  q.id,
  q.quotation_number,
  q.installation_request_id,
  q.installation_converted_at
from public.quotations q
where exists (
  select 1
  from public.installation_requests r
  where r.quotation_id = q.id
)
and (
  q.installation_request_id is null
  or q.installation_converted_at is null
);

-- 4) Review legacy installation requests that are still not linked.
-- Informational: inspect any returned rows manually.
select
  r.id,
  r.request_number,
  r.customer_id,
  r.customer_order_number,
  r.quotation_id,
  r.created_at
from public.installation_requests r
where r.quotation_id is null
order by r.created_at desc;

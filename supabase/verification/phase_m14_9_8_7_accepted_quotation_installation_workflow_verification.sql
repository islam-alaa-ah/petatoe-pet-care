-- Must return 0 rows: duplicated quotation links.
select quotation_id, count(*) from public.installation_requests where quotation_id is not null group by quotation_id having count(*) > 1;
-- Must return 0 rows: linked quotations not accepted.
select r.id, r.request_number, q.quotation_number, q.status from public.installation_requests r join public.quotations q on q.id=r.quotation_id where q.status <> 'مقبول';
-- Must return 0 rows: denormalized link mismatch.
select q.id, q.quotation_number, q.installation_request_id, r.id as actual_request_id from public.quotations q left join public.installation_requests r on r.quotation_id=q.id where q.installation_request_id is distinct from r.id;

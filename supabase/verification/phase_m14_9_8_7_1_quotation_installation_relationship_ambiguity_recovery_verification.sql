-- Phase M14.9.8.7.1 verification

-- 1) Must return exactly one relationship between the two tables.
select
  con.conname,
  con.conrelid::regclass as source_table,
  con.confrelid::regclass as target_table,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.contype = 'f'
  and (
    (con.conrelid = 'public.installation_requests'::regclass and con.confrelid = 'public.quotations'::regclass)
    or
    (con.conrelid = 'public.quotations'::regclass and con.confrelid = 'public.installation_requests'::regclass)
  );

-- 2) Must return 0 rows: reverse FK must not remain.
select con.conname
from pg_constraint con
join pg_attribute att
  on att.attrelid = con.conrelid
 and att.attnum = any(con.conkey)
where con.conrelid = 'public.quotations'::regclass
  and con.contype = 'f'
  and att.attname = 'installation_request_id'
  and con.confrelid = 'public.installation_requests'::regclass;

-- 3) Must return 0 rows: no conflicting workflow pointer values.
select
  q.id as quotation_id,
  q.installation_request_id as quotation_pointer,
  r.id as canonical_request_id
from public.quotations q
join public.installation_requests r on r.quotation_id = q.id
where q.installation_request_id is distinct from r.id;

-- 4) Smoke test the canonical join.
select
  r.id,
  r.request_number,
  r.quotation_id,
  q.quotation_number
from public.installation_requests r
left join public.quotations q on q.id = r.quotation_id
order by r.created_at desc
limit 20;

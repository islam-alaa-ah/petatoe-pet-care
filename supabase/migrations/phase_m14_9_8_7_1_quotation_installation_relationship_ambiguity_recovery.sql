-- Phase M14.9.8.7.1 — Quotation Installation Relationship Ambiguity Recovery
-- Canonical relation: installation_requests.quotation_id -> quotations.id
begin;

-- Remove only the reverse FK from quotations.installation_request_id.
-- Keep the column and its values because the application uses it as a workflow pointer.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any(con.conkey)
    where con.conrelid = 'public.quotations'::regclass
      and con.contype = 'f'
      and att.attname = 'installation_request_id'
      and con.confrelid = 'public.installation_requests'::regclass
  loop
    execute format('alter table public.quotations drop constraint if exists %I', v_constraint.conname);
  end loop;
end $$;

comment on column public.quotations.installation_request_id is
'Workflow pointer maintained by triggers. It is intentionally not a foreign key; the canonical database relationship is installation_requests.quotation_id -> quotations.id.';

-- Ensure the canonical FK exists and has a stable name used by PostgREST embeds.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.installation_requests'::regclass
      and conname = 'installation_requests_quotation_id_fkey'
      and contype = 'f'
  ) then
    alter table public.installation_requests
      add constraint installation_requests_quotation_id_fkey
      foreign key (quotation_id)
      references public.quotations(id)
      on delete set null;
  end if;
end $$;

commit;

-- Phase M14.9.2.1 — Completion Invoice & Delivery Authorization
begin;

alter table public.installation_completion_reports
  add column if not exists invoice_number text,
  add column if not exists invoice_date date;

alter table public.installation_completion_reports
  drop constraint if exists installation_completion_reports_invoice_number_check;
alter table public.installation_completion_reports
  add constraint installation_completion_reports_invoice_number_check
  check(invoice_number is null or length(trim(invoice_number)) > 0);

alter table public.installation_completion_files
  drop constraint if exists installation_completion_files_file_kind_check;
alter table public.installation_completion_files
  add constraint installation_completion_files_file_kind_check
  check(file_kind in ('before','after','signature','delivery_authorization'));

create or replace function public.validate_installation_completion_report()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.installation_requests r where r.id=new.installation_request_id and r.status='مكتمل') then
    raise exception 'Installation request must be completed before creating its completion report' using errcode='23514';
  end if;
  if nullif(trim(new.invoice_number),'') is null then
    raise exception 'Invoice number is required' using errcode='23514';
  end if;
  if new.invoice_date is null then
    raise exception 'Invoice date is required' using errcode='23514';
  end if;
  new.recipient_role := null;
  new.customer_notes := null;
  new.signed_at := null;
  new.updated_by := auth.uid();
  return new;
end;
$$;

comment on column public.installation_completion_reports.invoice_number is 'Required invoice number for installation completion report';
comment on column public.installation_completion_reports.invoice_date is 'Required invoice date for installation completion report';

commit;

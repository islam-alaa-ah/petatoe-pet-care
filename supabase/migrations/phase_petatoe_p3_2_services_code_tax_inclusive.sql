-- PETATOE P3.2 — Service Code + Tax-Inclusive Pricing Presentation
-- Keeps installation_service_types.default_price as the net/base price used by appointment tax logic.
-- Adds a mandatory unique service_code and leaves tax calculation centralized at 15% in appointments.

begin;

alter table public.installation_service_types
  add column if not exists service_code text;

-- Backfill any pre-existing rows safely before enforcing NOT NULL.
update public.installation_service_types
set service_code = 'SVC-' || upper(substr(replace(id::text,'-',''),1,8))
where nullif(btrim(service_code),'') is null;

alter table public.installation_service_types
  alter column service_code set not null;

-- Normalize whitespace/case uniqueness without changing the stored code text.
create unique index if not exists uq_installation_service_types_service_code_ci
  on public.installation_service_types (lower(btrim(service_code)));

alter table public.installation_service_types
  drop constraint if exists installation_service_types_service_code_not_blank;

alter table public.installation_service_types
  add constraint installation_service_types_service_code_not_blank
  check (btrim(service_code) <> '');

comment on column public.installation_service_types.default_price is
  'Net/base service price before VAT. UI may display VAT-inclusive price; appointment tax logic applies tax_rate separately.';

comment on column public.installation_service_types.service_code is
  'Mandatory unique business code for the service.';

notify pgrst,'reload schema';

commit;

-- Verification
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema='public'
  and table_name='installation_service_types'
  and column_name in('service_code','name','default_price','default_cost','is_active')
order by ordinal_position;

select
  count(*)::bigint as services_count,
  count(*) filter(where nullif(btrim(service_code),'') is null)::bigint as missing_codes,
  count(distinct lower(btrim(service_code)))::bigint as distinct_codes
from public.installation_service_types;

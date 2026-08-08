-- Phase M14.8.2 — Installation Request Business Workflow & Multi-Service Form
begin;

create table if not exists public.installation_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installation_service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_price numeric(14,2) not null default 0 check(default_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.installation_neighborhoods(name)
select distinct trim(c.district)
from public.customers c
where nullif(trim(c.district),'') is not null
on conflict(name) do nothing;

alter table public.installation_requests
  add column if not exists neighborhood_id uuid references public.installation_neighborhoods(id) on delete restrict,
  add column if not exists total_services_count integer not null default 0 check(total_services_count >= 0),
  add column if not exists total_services_amount numeric(14,2) not null default 0 check(total_services_amount >= 0);

alter table public.installation_requests alter column status set default 'بانتظار المراجعة';

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid='public.installation_requests'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.installation_requests drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.installation_requests
  add constraint installation_requests_status_check
  check(status in ('بانتظار المراجعة','جديد','مجدول','مسند','في الطريق','وصل إلى العميل','قيد التنفيذ','مكتمل','مؤجل','متعذر','ملغي'));

create table if not exists public.installation_request_services (
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  service_type_id uuid not null references public.installation_service_types(id) on delete restrict,
  quantity integer not null check(quantity > 0),
  unit_price numeric(14,2) not null check(unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_installation_request_services_request on public.installation_request_services(installation_request_id);
create index if not exists idx_installation_request_services_type on public.installation_request_services(service_type_id);
create index if not exists idx_installation_requests_neighborhood on public.installation_requests(neighborhood_id);

create or replace function public.refresh_installation_request_totals(p_request_id uuid)
returns void language sql security definer set search_path=public
as $$
  update public.installation_requests r
  set total_services_count=coalesce(x.total_quantity,0),
      total_services_amount=coalesce(x.total_amount,0),
      updated_at=now()
  from (
    select p_request_id request_id, sum(quantity)::integer total_quantity, sum(line_total)::numeric(14,2) total_amount
    from public.installation_request_services
    where installation_request_id=p_request_id
  ) x
  where r.id=x.request_id;
$$;

create or replace function public.sync_installation_request_totals()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_request_id uuid;
begin
  if tg_op='DELETE' then
    v_request_id := old.installation_request_id;
  else
    v_request_id := new.installation_request_id;
  end if;
  perform public.refresh_installation_request_totals(v_request_id);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_installation_request_services_totals on public.installation_request_services;
create trigger trg_installation_request_services_totals
after insert or update or delete on public.installation_request_services
for each row execute function public.sync_installation_request_totals();

alter table public.installation_neighborhoods enable row level security;
alter table public.installation_service_types enable row level security;
alter table public.installation_request_services enable row level security;

drop policy if exists "installation neighborhoods authenticated read" on public.installation_neighborhoods;
create policy "installation neighborhoods authenticated read" on public.installation_neighborhoods for select to authenticated using(true);
drop policy if exists "installation service types authenticated read" on public.installation_service_types;
create policy "installation service types authenticated read" on public.installation_service_types for select to authenticated using(true);

drop policy if exists "installation request services scoped select" on public.installation_request_services;
drop policy if exists "installation request services scoped insert" on public.installation_request_services;
drop policy if exists "installation request services scoped update" on public.installation_request_services;
drop policy if exists "installation request services scoped delete" on public.installation_request_services;
create policy "installation request services scoped select" on public.installation_request_services for select to authenticated using(
  exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
);
create policy "installation request services scoped insert" on public.installation_request_services for insert to authenticated with check(
  public.has_screen_permission('installationRequestNew','add') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
);
create policy "installation request services scoped update" on public.installation_request_services for update to authenticated using(
  public.has_screen_permission('installationRequests','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
) with check(
  public.has_screen_permission('installationRequests','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
);
create policy "installation request services scoped delete" on public.installation_request_services for delete to authenticated using(
  public.has_screen_permission('installationRequests','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_representative(r.representative_id))
);

-- The create screen owns insertion; the requests screen remains responsible for later edits.
drop policy if exists "installation requests scoped insert" on public.installation_requests;
create policy "installation requests scoped insert" on public.installation_requests for insert to authenticated with check(
  public.has_screen_permission('installationRequestNew','add') and public.can_access_representative(representative_id)
);

create or replace function public.create_installation_request_with_services(
  p_customer_id uuid,
  p_quotation_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_priority text,
  p_installation_address text,
  p_notes text,
  p_services jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_request_id uuid;
  v_request_number text;
begin
  if not public.has_screen_permission('installationRequestNew','add') then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if p_services is null or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 then
    raise exception 'At least one service is required' using errcode='23514';
  end if;

  insert into public.installation_requests(
    customer_id,quotation_id,representative_id,neighborhood_id,status,priority,installation_address,notes,scheduled_date,time_slot
  ) values (
    p_customer_id,p_quotation_id,p_representative_id,p_neighborhood_id,'بانتظار المراجعة',p_priority,p_installation_address,p_notes,null,null
  ) returning installation_requests.id,installation_requests.request_number into v_request_id,v_request_number;

  insert into public.installation_request_services(installation_request_id,service_type_id,quantity,unit_price)
  select v_request_id,x.service_type_id,x.quantity,x.unit_price
  from jsonb_to_recordset(p_services) as x(service_type_id uuid,quantity integer,unit_price numeric);

  if not exists(select 1 from public.installation_request_services where installation_request_id=v_request_id) then
    raise exception 'At least one valid service is required' using errcode='23514';
  end if;

  return query select v_request_id,v_request_number;
end;
$$;

grant select on public.installation_neighborhoods, public.installation_service_types to authenticated;
grant select,insert,update,delete on public.installation_request_services to authenticated;
grant execute on function public.refresh_installation_request_totals(uuid) to authenticated;
grant execute on function public.create_installation_request_with_services(uuid,uuid,uuid,uuid,text,text,text,jsonb) to authenticated;

commit;

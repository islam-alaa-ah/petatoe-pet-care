-- Phase M14.2 — Installation Requests Data Model & Core Screen
begin;

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('installationRequests','طلبات التركيبات','إدارة التركيبات',66,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin'::public.app_role,'installationRequests',true,true,true,true,true)
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true,updated_at=now();

create sequence if not exists public.installation_request_number_seq start 1;
create or replace function public.generate_installation_request_number()
returns text language sql volatile set search_path=public
as $$ select 'INS-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.installation_request_number_seq')::text,6,'0') $$;

create table if not exists public.installation_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default public.generate_installation_request_number(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete set null,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  scheduled_date date,
  time_slot text check(time_slot is null or time_slot in ('صباحي','مسائي')),
  status text not null default 'جديد' check(status in ('جديد','مجدول','مسند','في الطريق','قيد التنفيذ','مكتمل','مؤجل','متعذر','ملغي')),
  priority text not null default 'عادية' check(priority in ('عادية','عاجلة','حرجة')),
  installation_address text,
  description text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installation_request_quotation_customer_consistency unique(id,customer_id)
);

create or replace function public.validate_installation_request_links()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.quotation_id is not null and not exists (select 1 from public.quotations q where q.id=new.quotation_id and q.customer_id=new.customer_id) then
    raise exception 'Quotation does not belong to the selected customer' using errcode='23514';
  end if;
  if new.representative_id is null then
    select c.representative_id into new.representative_id from public.customers c where c.id=new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_installation_request_links on public.installation_requests;
create trigger trg_validate_installation_request_links before insert or update of customer_id,quotation_id,representative_id on public.installation_requests for each row execute function public.validate_installation_request_links();

drop trigger if exists trg_installation_requests_updated_at on public.installation_requests;
create trigger trg_installation_requests_updated_at before update on public.installation_requests for each row execute function public.set_updated_at();
create index if not exists idx_installation_requests_customer on public.installation_requests(customer_id);
create index if not exists idx_installation_requests_quotation on public.installation_requests(quotation_id);
create index if not exists idx_installation_requests_representative on public.installation_requests(representative_id);
create index if not exists idx_installation_requests_schedule on public.installation_requests(scheduled_date,status);

alter table public.installation_requests enable row level security;
drop policy if exists "installation requests scoped select" on public.installation_requests;
drop policy if exists "installation requests scoped insert" on public.installation_requests;
drop policy if exists "installation requests scoped update" on public.installation_requests;
drop policy if exists "installation requests scoped delete" on public.installation_requests;
create policy "installation requests scoped select" on public.installation_requests for select to authenticated using(public.has_screen_permission('installationRequests','view') and public.can_access_representative(representative_id));
create policy "installation requests scoped insert" on public.installation_requests for insert to authenticated with check(public.has_screen_permission('installationRequests','add') and public.can_access_representative(representative_id));
create policy "installation requests scoped update" on public.installation_requests for update to authenticated using(public.has_screen_permission('installationRequests','edit') and public.can_access_representative(representative_id)) with check(public.has_screen_permission('installationRequests','edit') and public.can_access_representative(representative_id));
create policy "installation requests scoped delete" on public.installation_requests for delete to authenticated using(public.has_screen_permission('installationRequests','delete') and public.can_access_representative(representative_id));

grant select,insert,update,delete on public.installation_requests to authenticated;
grant usage,select on sequence public.installation_request_number_seq to authenticated;

commit;

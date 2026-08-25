-- P5.13.8.72 R13 — reusable payroll addition/deduction item catalog.
-- Keeps statement line items as historical snapshots while maintaining a reusable
-- name-only catalog for future salary adjustments.

begin;

create or replace function public.payroll_adjustment_name_key(p_name text)
returns text
language sql
immutable
strict
as $$
  select lower(regexp_replace(btrim(p_name), '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function public.payroll_adjustment_name_key(text) from public,anon;
grant execute on function public.payroll_adjustment_name_key(text) to authenticated,service_role;

create table if not exists public.payroll_adjustment_catalog (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check(item_type in ('addition','deduction')),
  item_name text not null check(length(btrim(item_name)) between 1 and 200),
  item_name_key text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_payroll_adjustment_catalog_type_name
  on public.payroll_adjustment_catalog(item_type,item_name_key);
create index if not exists idx_payroll_adjustment_catalog_active
  on public.payroll_adjustment_catalog(item_type,is_active,item_name);

-- Seed the reusable catalog from all historical salary adjustment line items.
insert into public.payroll_adjustment_catalog(
  item_type,item_name,item_name_key,is_active,created_by,updated_by,created_at,updated_at
)
select
  src.item_type,
  src.item_name,
  src.item_name_key,
  true,
  src.created_by,
  src.updated_by,
  src.created_at,
  src.updated_at
from (
  select distinct on (i.item_type,public.payroll_adjustment_name_key(i.item_name))
    i.item_type,
    btrim(i.item_name) as item_name,
    public.payroll_adjustment_name_key(i.item_name) as item_name_key,
    i.created_by,
    i.updated_by,
    i.created_at,
    i.updated_at
  from public.payroll_salary_adjustment_items i
  where nullif(btrim(i.item_name),'') is not null
  order by i.item_type,public.payroll_adjustment_name_key(i.item_name),i.updated_at desc,i.created_at desc
) src
on conflict(item_type,item_name_key) do update
set is_active=true,
    updated_at=greatest(payroll_adjustment_catalog.updated_at,excluded.updated_at);

alter table public.payroll_adjustment_catalog enable row level security;

drop policy if exists "payroll adjustment catalog readable" on public.payroll_adjustment_catalog;
create policy "payroll adjustment catalog readable"
on public.payroll_adjustment_catalog for select to authenticated
using(
  public.has_screen_permission('payrollManagement','view')
  or public.has_screen_permission('payrollReference','view')
);

-- Catalog changes are owned by the trigger/RPC path; clients only read it.
revoke insert,update,delete on public.payroll_adjustment_catalog from authenticated;
grant select on public.payroll_adjustment_catalog to authenticated;

create or replace function public.capture_payroll_adjustment_catalog()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text:=nullif(btrim(coalesce(new.item_name,'')),'');
  v_key text;
begin
  if new.item_type not in ('addition','deduction') or v_name is null then
    return new;
  end if;

  v_key:=public.payroll_adjustment_name_key(v_name);

  insert into public.payroll_adjustment_catalog(
    item_type,item_name,item_name_key,is_active,created_by,updated_by,created_at,updated_at
  ) values(
    new.item_type,v_name,v_key,true,coalesce(new.created_by,auth.uid()),coalesce(new.updated_by,auth.uid()),now(),now()
  )
  on conflict(item_type,item_name_key) do update
  set is_active=true,
      updated_by=coalesce(auth.uid(),payroll_adjustment_catalog.updated_by),
      updated_at=now();

  return new;
end;
$$;
revoke all on function public.capture_payroll_adjustment_catalog() from public,anon;

drop trigger if exists trg_capture_payroll_adjustment_catalog on public.payroll_salary_adjustment_items;
create trigger trg_capture_payroll_adjustment_catalog
after insert or update of item_type,item_name on public.payroll_salary_adjustment_items
for each row execute function public.capture_payroll_adjustment_catalog();

create or replace function public.get_payroll_adjustment_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  result jsonb;
begin
  if not (
    public.has_screen_permission('payrollManagement','view')
    or public.has_screen_permission('payrollReference','view')
  ) then
    raise exception 'لا توجد صلاحية عرض بنود الإضافات والخصومات المحفوظة';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'type',c.item_type,
    'name',c.item_name
  ) order by c.item_type,c.item_name),'[]'::jsonb)
  into result
  from public.payroll_adjustment_catalog c
  where c.is_active=true;

  return result;
end;
$$;
revoke all on function public.get_payroll_adjustment_catalog() from public,anon;
grant execute on function public.get_payroll_adjustment_catalog() to authenticated,service_role;

commit;

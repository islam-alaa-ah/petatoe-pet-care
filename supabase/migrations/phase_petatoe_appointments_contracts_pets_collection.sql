-- PETATOE — Appointments / Customer Contracts / Pet Data / Collection
-- Display terminology changes stay in the client; technical installation/quotation identifiers remain stable.
begin;

alter table public.installation_requests
  add column if not exists discount_amount numeric(14,2) not null default 0 check(discount_amount >= 0),
  add column if not exists tax_rate numeric(5,2) not null default 15 check(tax_rate between 0 and 100),
  add column if not exists tax_amount numeric(14,2) not null default 0 check(tax_amount >= 0),
  add column if not exists final_amount numeric(14,2) not null default 0 check(final_amount >= 0);

create or replace function public.recalculate_installation_request_financials()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_subtotal numeric(14,2);
  v_discount numeric(14,2);
  v_taxable numeric(14,2);
begin
  v_subtotal := greatest(coalesce(new.total_services_amount,0),0);
  v_discount := least(greatest(coalesce(new.discount_amount,0),0),v_subtotal);
  v_taxable := greatest(v_subtotal-v_discount,0);
  new.discount_amount := v_discount;
  new.tax_rate := coalesce(new.tax_rate,15);
  new.tax_amount := round(v_taxable*new.tax_rate/100.0,2);
  new.final_amount := round(v_taxable+new.tax_amount,2);
  return new;
end;
$$;

drop trigger if exists trg_installation_request_financials on public.installation_requests;
create trigger trg_installation_request_financials
before insert or update of total_services_amount,discount_amount,tax_rate
on public.installation_requests
for each row execute function public.recalculate_installation_request_financials();

-- Recalculate any current rows safely.
update public.installation_requests
set discount_amount=discount_amount,
    tax_rate=tax_rate;

create table if not exists public.installation_request_animals (
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  pet_name text not null default '',
  pet_type text not null default '',
  breed text,
  pet_size text,
  quantity integer not null default 1 check(quantity > 0),
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_installation_request_animals_request
  on public.installation_request_animals(installation_request_id,display_order,id);

create table if not exists public.installation_request_collection (
  installation_request_id uuid primary key references public.installation_requests(id) on delete cascade,
  session_value numeric(14,2) not null default 0 check(session_value >= 0),
  total_discount numeric(14,2) not null default 0 check(total_discount >= 0),
  amount_collected numeric(14,2) not null default 0 check(amount_collected >= 0),
  collection_status text not null default 'غير محصل'
    check(collection_status in('غير محصل','محصل جزئيًا','محصل بالكامل')),
  payment_method text,
  appointment_status text not null default 'بانتظار المراجعة',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.installation_request_animals enable row level security;
alter table public.installation_request_collection enable row level security;

drop policy if exists "appointment animals view" on public.installation_request_animals;
create policy "appointment animals view"
on public.installation_request_animals for select to authenticated
using(exists(
  select 1 from public.installation_requests r
  where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
));

drop policy if exists "appointment animals manage" on public.installation_request_animals;
create policy "appointment animals manage"
on public.installation_request_animals for all to authenticated
using(
  public.has_screen_permission('installationRequests','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
)
with check(
  (public.has_screen_permission('installationRequestNew','add') or public.has_screen_permission('installationRequests','edit'))
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

drop policy if exists "appointment collection view" on public.installation_request_collection;
create policy "appointment collection view"
on public.installation_request_collection for select to authenticated
using(exists(
  select 1 from public.installation_requests r
  where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
));

drop policy if exists "appointment collection manage" on public.installation_request_collection;
create policy "appointment collection manage"
on public.installation_request_collection for all to authenticated
using(
  public.has_screen_permission('installationRequests','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
)
with check(
  (public.has_screen_permission('installationRequestNew','add') or public.has_screen_permission('installationRequests','edit'))
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

grant select,insert,update,delete on public.installation_request_animals to authenticated;
grant select,insert,update,delete on public.installation_request_collection to authenticated;

create or replace function public.save_petatoe_appointment_details(
  p_request_id uuid,
  p_discount_amount numeric,
  p_animals jsonb,
  p_collection jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.installation_requests%rowtype;
  v_final numeric(14,2);
  v_discount numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;

  select * into v_row from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'Appointment not found' using errcode='P0002'; end if;

  if not (
    public.has_screen_permission('installationRequestNew','add')
    or public.has_screen_permission('installationRequests','edit')
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not public.can_access_installation_request_scope(v_row.representative_id,v_row.installation_team_id) then
    raise exception 'Appointment is outside your permitted scope' using errcode='42501';
  end if;

  update public.installation_requests
  set discount_amount=greatest(coalesce(p_discount_amount,0),0),
      tax_rate=15,
      customer_order_number=null,
      priority='عادية',
      updated_at=now()
  where id=p_request_id
  returning final_amount,discount_amount into v_final,v_discount;

  delete from public.installation_request_animals where installation_request_id=p_request_id;
  if p_animals is not null and jsonb_typeof(p_animals)='array' then
    insert into public.installation_request_animals(
      installation_request_id,pet_name,pet_type,breed,pet_size,quantity,display_order
    )
    select p_request_id,
           btrim(coalesce(a.value->>'pet_name','')),
           btrim(coalesce(a.value->>'pet_type','')),
           nullif(btrim(coalesce(a.value->>'breed','')),''),
           nullif(btrim(coalesce(a.value->>'pet_size','')),''),
           greatest(coalesce(nullif(a.value->>'quantity','')::integer,1),1),
           a.ord::integer
    from jsonb_array_elements(p_animals) with ordinality as a(value,ord)
    where btrim(coalesce(a.value->>'pet_name',''))<>''
       or btrim(coalesce(a.value->>'pet_type',''))<>'';
  end if;

  insert into public.installation_request_collection(
    installation_request_id,session_value,total_discount,amount_collected,
    collection_status,payment_method,appointment_status,updated_at
  ) values(
    p_request_id,
    v_final,
    v_discount,
    greatest(coalesce((p_collection->>'amount_collected')::numeric,0),0),
    coalesce(nullif(p_collection->>'collection_status',''),'غير محصل'),
    nullif(p_collection->>'payment_method',''),
    coalesce(nullif(p_collection->>'appointment_status',''),v_row.status,'بانتظار المراجعة'),
    now()
  )
  on conflict(installation_request_id) do update set
    session_value=excluded.session_value,
    total_discount=excluded.total_discount,
    amount_collected=excluded.amount_collected,
    collection_status=excluded.collection_status,
    payment_method=excluded.payment_method,
    appointment_status=excluded.appointment_status,
    updated_at=now();
end;
$$;

create or replace function public.create_petatoe_appointment(
  p_customer_id uuid,
  p_contract_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb,
  p_discount_amount numeric,
  p_animals jsonb,
  p_collection jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_number text;
  v_address text;
begin
  select name into v_address from public.installation_neighborhoods where id=p_neighborhood_id;

  select r.id,r.request_number into v_id,v_number
  from public.create_installation_request_with_services(
    p_customer_id,p_contract_id,p_representative_id,p_neighborhood_id,
    'عادية',v_address,null,p_customer_map_url,p_notes,p_services
  ) r;

  perform public.save_petatoe_appointment_details(
    v_id,p_discount_amount,p_animals,p_collection
  );

  return query select v_id,v_number;
end;
$$;

create or replace function public.update_petatoe_appointment(
  p_request_id uuid,
  p_customer_id uuid,
  p_contract_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb,
  p_discount_amount numeric,
  p_animals jsonb,
  p_collection jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_number text;
  v_address text;
begin
  select name into v_address from public.installation_neighborhoods where id=p_neighborhood_id;

  select r.id,r.request_number into v_id,v_number
  from public.update_installation_request_with_services(
    p_request_id,p_customer_id,p_contract_id,p_representative_id,p_neighborhood_id,
    'عادية',v_address,null,p_customer_map_url,p_notes,p_services
  ) r;

  perform public.save_petatoe_appointment_details(
    p_request_id,p_discount_amount,p_animals,p_collection
  );

  return query select v_id,v_number;
end;
$$;

revoke all on function public.save_petatoe_appointment_details(uuid,numeric,jsonb,jsonb) from public,anon;
revoke all on function public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) from public,anon;
revoke all on function public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) from public,anon;
grant execute on function public.save_petatoe_appointment_details(uuid,numeric,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.create_petatoe_appointment(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.update_petatoe_appointment(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,numeric,jsonb,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';
commit;

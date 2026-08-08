begin;

create table if not exists public.business_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete set null,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  event_type text not null,
  section_key text not null,
  action_key text not null,
  entity_type text,
  entity_id text,
  entity_display_name text,
  customer_id uuid,
  customer_name text,
  request_number text,
  quotation_number text,
  invoice_number text,
  status text not null default 'success',
  details jsonb not null default '{}'::jsonb,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_business_activity_events_time on public.business_activity_events(occurred_at desc);
create index if not exists idx_business_activity_events_user_time on public.business_activity_events(user_id, occurred_at desc);
create index if not exists idx_business_activity_events_customer on public.business_activity_events(customer_id, occurred_at desc);

alter table public.business_activity_events enable row level security;

-- Self-contained permission helper.
-- It intentionally does not depend on public.is_super_admin(), because that helper
-- is not present in every KYUM database baseline.
create or replace function public.can_read_business_activity_event(p_event_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_role text;
  v_allowed boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  if p_event_user_id = v_uid then
    return true;
  end if;

  select to_jsonb(up)
    into v_profile
  from public.user_profiles up
  where up.id = v_uid
  limit 1;

  v_role := lower(trim(coalesce(
    v_profile->>'role',
    v_profile->>'user_role',
    v_profile->>'account_role',
    ''
  )));

  if coalesce((v_profile->>'is_super_admin')::boolean, false)
     or v_role in (
       'super_admin', 'superadmin', 'super admin',
       'system_admin', 'system admin',
       'سوبر ادمن', 'سوبر أدمن', 'مدير النظام'
     ) then
    return true;
  end if;

  -- Use the existing screen-permission function only when it exists.
  if to_regprocedure('public.has_screen_permission(text,text)') is not null then
    execute
      'select coalesce(public.has_screen_permission($1,$2), false)'
      into v_allowed
      using 'dailyPerformanceReport', 'view';
  end if;

  return coalesce(v_allowed, false);
exception
  when others then
    -- A permission helper must fail closed, not expose audit data.
    return false;
end;
$$;

revoke all on function public.can_read_business_activity_event(uuid) from public;
grant execute on function public.can_read_business_activity_event(uuid) to authenticated;

drop policy if exists "business activity report read" on public.business_activity_events;
create policy "business activity report read"
on public.business_activity_events
for select
to authenticated
using (public.can_read_business_activity_event(user_id));

revoke insert, update, delete on public.business_activity_events from authenticated;
grant select on public.business_activity_events to authenticated;

create or replace function public.log_business_activity_event(
  p_event_type text,
  p_section_key text,
  p_action_key text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_entity_display_name text default null,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_request_number text default null,
  p_quotation_number text default null,
  p_invoice_number text default null,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_rep uuid;
begin
  select nullif(to_jsonb(up)->>'representative_id','')::uuid
    into v_rep
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1;
  insert into public.business_activity_events(
    user_id,representative_id,event_type,section_key,action_key,entity_type,entity_id,
    entity_display_name,customer_id,customer_name,request_number,quotation_number,invoice_number,details
  ) values (
    auth.uid(),v_rep,p_event_type,p_section_key,p_action_key,p_entity_type,p_entity_id,
    p_entity_display_name,p_customer_id,p_customer_name,p_request_number,p_quotation_number,p_invoice_number,coalesce(p_details,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.log_business_activity_event(text,text,text,text,text,text,uuid,text,text,text,text,jsonb) to authenticated;

create or replace function public.capture_business_activity_event() returns trigger
language plpgsql security definer set search_path=public
as $$
declare
  r jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  b jsonb := case when tg_op='INSERT' then null else to_jsonb(old) end;
  uid uuid := auth.uid();
  cid uuid; cname text; display_name text; section text; req text; quote text; inv text; rep uuid;
begin
  if uid is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  begin cid := nullif(r->>'customer_id','')::uuid; exception when others then cid := null; end;
  if tg_table_name='customers' then cid := nullif(r->>'id','')::uuid; cname := coalesce(r->>'name',r->>'customer_name'); section:='customers';
  elsif tg_table_name='customer_followups' then section:='followups'; select name into cname from public.customers where id=cid;
  elsif tg_table_name='quotations' then section:='quotations'; select name into cname from public.customers where id=cid; quote:=coalesce(r->>'quotation_number',r->>'number');
  elsif tg_table_name='installation_requests' then section:='installations'; select name into cname from public.customers where id=cid; req:=r->>'request_number'; quote:=r->>'quotation_number';
  elsif tg_table_name='sales_invoices' then section:='invoices'; select name into cname from public.customers where id=cid; req:=r->>'request_number'; inv:=r->>'invoice_number';
  else section:=tg_table_name; end if;
  display_name:=coalesce(cname,req,quote,inv,r->>'name',r->>'title',r->>'full_name',r->>'id');
  select nullif(to_jsonb(up)->>'representative_id','')::uuid
    into rep
  from public.user_profiles up
  where up.id = uid
  limit 1;
  insert into public.business_activity_events(user_id,representative_id,event_type,section_key,action_key,entity_type,entity_id,entity_display_name,customer_id,customer_name,request_number,quotation_number,invoice_number,before_data,after_data)
  values(uid,rep,'data_change',section,lower(tg_op),tg_table_name,coalesce(r->>'id',''),display_name,cid,cname,req,quote,inv,b,case when tg_op='DELETE' then null else r end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

DO $$ declare t text; begin
  foreach t in array array['customers','customer_followups','quotations','installation_requests','sales_invoices'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_business_activity_%I on public.%I',t,t);
      execute format('create trigger trg_business_activity_%I after insert or update or delete on public.%I for each row execute function public.capture_business_activity_event()',t,t);
    end if;
  end loop;
end $$;
commit;

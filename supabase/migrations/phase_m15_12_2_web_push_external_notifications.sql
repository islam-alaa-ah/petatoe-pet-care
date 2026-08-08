begin;

-- ============================================================
-- KYUM CRM — Phase M15.12.2
-- Web Push / External Notifications
-- Dynamic recipient matrix remains the single source of truth.
-- ============================================================

alter table public.notifications
  add column if not exists in_app_delivery boolean not null default true;

create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text null,
  device_label text null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_push_subscriptions_user_idx
  on public.notification_push_subscriptions(user_id,is_active);

create table if not exists public.notification_push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','no_subscription','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_push_outbox_pending_idx
  on public.notification_push_outbox(status,next_attempt_at,created_at)
  where status='pending';

alter table public.notification_push_subscriptions enable row level security;
alter table public.notification_push_outbox enable row level security;

drop policy if exists "push subscriptions own select" on public.notification_push_subscriptions;
create policy "push subscriptions own select" on public.notification_push_subscriptions
  for select to authenticated using (user_id=auth.uid());
drop policy if exists "push subscriptions own insert" on public.notification_push_subscriptions;
create policy "push subscriptions own insert" on public.notification_push_subscriptions
  for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "push subscriptions own update" on public.notification_push_subscriptions;
create policy "push subscriptions own update" on public.notification_push_subscriptions
  for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "push subscriptions own delete" on public.notification_push_subscriptions;
create policy "push subscriptions own delete" on public.notification_push_subscriptions
  for delete to authenticated using (user_id=auth.uid());

-- The outbox is server-owned. Authenticated users cannot read or mutate it directly.
revoke all on public.notification_push_outbox from authenticated;

create or replace function public.emit_notification_event(
  p_event_key text,
  p_request_id uuid default null,
  p_visit_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurrence_key text default null
) returns integer
language plpgsql security definer set search_path=public set row_security=off as $$
declare
  v_setting public.notification_event_settings%rowtype;
  v_master boolean := true;
  v_request_number text := '';
  v_customer_name text := '';
  v_representative_id uuid;
  v_user_id uuid;
  v_count integer := 0;
  v_occurrence text;
  v_body text;
  v_notification_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select is_enabled into v_master
  from public.notification_system_settings
  where id=1;
  if coalesce(v_master,false)=false then return 0; end if;

  select * into v_setting
  from public.notification_event_settings
  where event_key=p_event_key;

  if not found
     or v_setting.is_enabled=false
     or (coalesce(v_setting.in_app_enabled,false)=false and coalesce(v_setting.push_enabled,false)=false)
  then
    return 0;
  end if;

  if p_request_id is not null then
    select r.request_number,r.representative_id,coalesce(c.customer_name,'')
      into v_request_number,v_representative_id,v_customer_name
    from public.installation_requests r
    left join public.customers c on c.id=r.customer_id
    where r.id=p_request_id;
  end if;

  v_occurrence:=coalesce(nullif(p_occurrence_key,''),p_event_key||':'||coalesce(p_visit_id::text,p_request_id::text,'global'));
  v_body:=trim(both ' — ' from concat_ws(' — ',nullif(v_request_number,''),nullif(v_customer_name,'')));

  for v_user_id in
    select distinct recipient_id from (
      select up.id recipient_id
      from public.notification_event_recipient_rules rr
      join public.user_profiles up on up.id=rr.user_id and coalesce(up.is_active,true)=true
      where rr.event_key=p_event_key and rr.is_active=true and rr.recipient_type='user'

      union all

      select up.id
      from public.notification_event_recipient_rules rr
      join public.user_profiles up on up.role::text=rr.role_key and coalesce(up.is_active,true)=true
      where rr.event_key=p_event_key and rr.is_active=true and rr.recipient_type='role'

      union all

      select up.id
      from public.notification_event_recipient_rules rr
      join public.user_profiles up on up.representative_id=v_representative_id and coalesce(up.is_active,true)=true
      where rr.event_key=p_event_key
        and rr.is_active=true
        and rr.recipient_type='request_owner'
        and v_representative_id is not null
    ) q
  loop
    v_notification_id:=null;

    insert into public.notifications(
      user_id,event_key,request_id,visit_id,title,body,target_view,metadata,dedupe_key,in_app_delivery
    ) values(
      v_user_id,p_event_key,p_request_id,p_visit_id,v_setting.event_name,v_body,v_setting.target_view,
      coalesce(p_metadata,'{}'::jsonb),
      md5(v_user_id::text||'|'||p_event_key||'|'||v_occurrence),
      coalesce(v_setting.in_app_enabled,false)
    )
    on conflict(dedupe_key) do nothing
    returning id into v_notification_id;

    if v_notification_id is not null then
      v_count:=v_count+1;
      if coalesce(v_setting.push_enabled,false) then
        insert into public.notification_push_outbox(notification_id,user_id)
        values(v_notification_id,v_user_id)
        on conflict(notification_id) do nothing;
      end if;
    end if;
  end loop;

  return v_count;
end;$$;

grant execute on function public.emit_notification_event(text,uuid,uuid,jsonb,text) to authenticated;

commit;

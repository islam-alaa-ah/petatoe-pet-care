-- KYUM CRM — Phase M15.12.1
-- Enterprise Notification Center + Dynamic Recipient Matrix + In-App Notifications

begin;

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('notificationCenter','مركز الإشعارات','الإعدادات والخصوصية',105,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,'notificationCenter',true,true,true,true,true
where exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='app_role' and n.nspname='public')
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true;

create table if not exists public.notification_system_settings (
  id smallint primary key default 1 check (id=1),
  is_enabled boolean not null default true,
  updated_by uuid null references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.notification_system_settings(id,is_enabled) values(1,true) on conflict(id) do nothing;

create table if not exists public.notification_event_settings (
  event_key text primary key,
  event_name text not null,
  module_name text not null default 'التركيبات',
  target_view text null,
  display_order integer not null default 0,
  is_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  updated_by uuid null references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_event_recipient_rules (
  id uuid primary key default gen_random_uuid(),
  event_key text not null references public.notification_event_settings(event_key) on delete cascade,
  recipient_type text not null check (recipient_type in ('request_owner','role','user')),
  role_key text null,
  user_id uuid null references public.user_profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (recipient_type='request_owner' and role_key is null and user_id is null) or
    (recipient_type='role' and role_key is not null and user_id is null) or
    (recipient_type='user' and user_id is not null and role_key is null)
  )
);
create index if not exists notification_recipient_rules_event_idx on public.notification_event_recipient_rules(event_key) where is_active=true;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  event_key text not null references public.notification_event_settings(event_key) on delete restrict,
  request_id uuid null references public.installation_requests(id) on delete cascade,
  visit_id uuid null references public.installation_execution_visits(id) on delete cascade,
  title text not null,
  body text not null default '',
  target_view text null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id,is_read,created_at desc);

insert into public.notification_event_settings(event_key,event_name,module_name,target_view,display_order,is_enabled,in_app_enabled,push_enabled) values
('installation.request_created','إنشاء طلب تركيب جديد','التركيبات','installationRequests',10,false,true,false),
('installation.request_updated','تعديل بيانات طلب تركيب','التركيبات','installationRequests',15,false,true,false),
('installation.scheduled','جدولة طلب تركيب','التركيبات','installationSchedule',20,false,true,false),
('installation.rescheduled','إعادة جدولة طلب تركيب','التركيبات','installationSchedule',30,false,true,false),
('installation.schedule_cancelled','إلغاء جدولة طلب تركيب','التركيبات','installationSchedule',40,false,true,false),
('installation.execution_selected','بدء تنفيذ طلب تركيب','التركيبات','installationExecution',50,false,true,false),
('installation.on_route','بدء التحرك للعميل','التركيبات','installationExecution',60,false,true,false),
('installation.map_opened','فتح موقع العميل','التركيبات','installationExecution',70,false,true,false),
('installation.arrived','الوصول إلى موقع العميل','التركيبات','installationExecution',80,false,true,false),
('installation.work_started','بدء أعمال التركيب','التركيبات','installationExecution',90,false,true,false),
('installation.completed','انتهاء أعمال التركيب','التركيبات','installationCompletion',100,false,true,false),
('installation.quantities_confirmed','تأكيد كميات التركيب','التركيبات','installationCompletion',110,false,true,false),
('installation.remaining_added_to_next','إضافة الكمية المتبقية للموعد التالي','التركيبات','installationSchedule',120,false,true,false),
('installation.remaining_to_schedule','إعادة الكمية المتبقية للجدولة','التركيبات','installationSchedule',130,false,true,false),
('installation.revisit_scheduled','جدولة إعادة زيارة','التركيبات','installationExceptions',140,false,true,false)
on conflict(event_key) do update set event_name=excluded.event_name,module_name=excluded.module_name,target_view=excluded.target_view,display_order=excluded.display_order;

alter table public.notification_system_settings enable row level security;
alter table public.notification_event_settings enable row level security;
alter table public.notification_event_recipient_rules enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "notification settings view" on public.notification_system_settings;
create policy "notification settings view" on public.notification_system_settings for select to authenticated using (public.has_screen_permission('notificationCenter','view'));
drop policy if exists "notification settings edit" on public.notification_system_settings;
create policy "notification settings edit" on public.notification_system_settings for all to authenticated using (public.has_screen_permission('notificationCenter','edit')) with check (public.has_screen_permission('notificationCenter','edit'));

drop policy if exists "notification events view" on public.notification_event_settings;
create policy "notification events view" on public.notification_event_settings for select to authenticated using (public.has_screen_permission('notificationCenter','view'));
drop policy if exists "notification events edit" on public.notification_event_settings;
create policy "notification events edit" on public.notification_event_settings for all to authenticated using (public.has_screen_permission('notificationCenter','edit')) with check (public.has_screen_permission('notificationCenter','edit'));

drop policy if exists "notification rules view" on public.notification_event_recipient_rules;
create policy "notification rules view" on public.notification_event_recipient_rules for select to authenticated using (public.has_screen_permission('notificationCenter','view'));
drop policy if exists "notification rules edit" on public.notification_event_recipient_rules;
create policy "notification rules edit" on public.notification_event_recipient_rules for all to authenticated using (public.has_screen_permission('notificationCenter','edit')) with check (public.has_screen_permission('notificationCenter','edit'));

drop policy if exists "notification center user directory" on public.user_profiles;
create policy "notification center user directory" on public.user_profiles for select to authenticated using (public.has_screen_permission('notificationCenter','view'));

drop policy if exists "notifications own select" on public.notifications;
create policy "notifications own select" on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

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
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select is_enabled into v_master from public.notification_system_settings where id=1;
  if coalesce(v_master,false)=false then return 0; end if;
  select * into v_setting from public.notification_event_settings where event_key=p_event_key;
  if not found or v_setting.is_enabled=false or v_setting.in_app_enabled=false then return 0; end if;
  if p_request_id is not null then
    select r.request_number,r.representative_id,coalesce(c.customer_name,'') into v_request_number,v_representative_id,v_customer_name
    from public.installation_requests r left join public.customers c on c.id=r.customer_id where r.id=p_request_id;
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
      where rr.event_key=p_event_key and rr.is_active=true and rr.recipient_type='request_owner' and v_representative_id is not null
    ) q
  loop
    insert into public.notifications(user_id,event_key,request_id,visit_id,title,body,target_view,metadata,dedupe_key)
    values(v_user_id,p_event_key,p_request_id,p_visit_id,v_setting.event_name,v_body,v_setting.target_view,coalesce(p_metadata,'{}'::jsonb),md5(v_user_id::text||'|'||p_event_key||'|'||v_occurrence))
    on conflict(dedupe_key) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;$$;

grant execute on function public.emit_notification_event(text,uuid,uuid,jsonb,text) to authenticated;

-- Enable realtime inserts for the per-user notification bell when possible.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then null; end $$;

commit;

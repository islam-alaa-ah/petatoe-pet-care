-- KYUM Phase 11 — Users & Permissions Enterprise
-- Enum values must be committed before they can be used in later statements.

alter type public.app_role add value if not exists 'sales_supervisor';
alter type public.app_role add value if not exists 'customer_service';

commit;

begin;

alter table public.user_profiles add column if not exists email text;

update public.user_profiles p
set email = u.email
from auth.users u
where u.id = p.id and (p.email is null or p.email <> u.email);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id,full_name,email,role)
  values (new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,'viewer')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create table if not exists public.app_screens (
  screen_key text primary key,
  screen_name text not null,
  group_name text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.role_screen_permissions (
  role public.app_role not null,
  screen_key text not null references public.app_screens(screen_key) on delete cascade,
  can_view boolean not null default false,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_export boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role,screen_key)
);

insert into public.app_screens(screen_key,screen_name,group_name,display_order) values
('dashboard','لوحة التحكم','الرئيسية',10),
('customers','العملاء','إدارة العملاء',20),
('followups','المتابعات','إدارة العملاء',30),
('quotations','عروض الأسعار','إدارة العملاء',40),
('representatives','مندوبو المبيعات','إدارة العملاء',50),
('settings','البيانات المرجعية','إدارة العملاء',60),
('users','المستخدمون','الإعدادات والخصوصية',70),
('permissions','الصلاحيات','الإعدادات والخصوصية',80),
('activityLog','سجل النشاط','الإعدادات والخصوصية',90),
('backups','النسخ الاحتياطي','الإعدادات والخصوصية',100),
('systemSettings','إعدادات النظام','الإعدادات والخصوصية',110)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,screen_key,true,true,true,true,true from public.app_screens
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export) values
('sales_manager','dashboard',true,false,false,false,true),
('sales_manager','customers',true,true,true,true,true),
('sales_manager','followups',true,true,true,true,true),
('sales_manager','quotations',true,true,true,true,true),
('sales_manager','representatives',true,true,true,false,true),
('sales_manager','settings',true,true,true,false,true),
('sales_manager','activityLog',true,false,false,false,true),
('sales_supervisor','dashboard',true,false,false,false,true),
('sales_supervisor','customers',true,true,true,false,true),
('sales_supervisor','followups',true,true,true,false,true),
('sales_supervisor','quotations',true,true,true,false,true),
('sales_representative','dashboard',true,false,false,false,false),
('sales_representative','customers',true,true,true,false,false),
('sales_representative','followups',true,true,true,true,false),
('sales_representative','quotations',true,true,true,true,false),
('customer_service','dashboard',true,false,false,false,false),
('customer_service','customers',true,true,true,false,false),
('customer_service','followups',true,true,true,false,false),
('viewer','dashboard',true,false,false,false,true),
('viewer','customers',true,false,false,false,true),
('viewer','followups',true,false,false,false,true),
('viewer','quotations',true,false,false,false,true)
on conflict(role,screen_key) do nothing;

alter table public.app_screens enable row level security;
alter table public.role_screen_permissions enable row level security;

drop policy if exists "authenticated read app screens" on public.app_screens;
create policy "authenticated read app screens" on public.app_screens for select to authenticated using(true);

drop policy if exists "authenticated read role permissions" on public.role_screen_permissions;
create policy "authenticated read role permissions" on public.role_screen_permissions for select to authenticated using(true);

drop policy if exists "super admin manage role permissions" on public.role_screen_permissions;
create policy "super admin manage role permissions" on public.role_screen_permissions for all to authenticated
using(public.current_user_role()='super_admin') with check(public.current_user_role()='super_admin');

drop policy if exists "profiles update management" on public.user_profiles;
create policy "profiles update management" on public.user_profiles for update to authenticated
using(public.current_user_role()='super_admin') with check(public.current_user_role()='super_admin');

drop policy if exists "authenticated insert own audit logs" on public.audit_logs;
create policy "authenticated insert own audit logs" on public.audit_logs for insert to authenticated
with check(user_id=auth.uid() and action in('insert','update','delete','login','logout')
and entity_type in('sales_representatives','interest_categories','no_sale_reasons','customers','customer_followups','quotations','user_profiles','role_screen_permissions'));

grant select on public.app_screens to authenticated;
grant select,insert,update,delete on public.role_screen_permissions to authenticated;

commit;

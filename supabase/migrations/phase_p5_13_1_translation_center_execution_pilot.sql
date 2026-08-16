-- P5.13.1 — Translation Center pilot for Appointment Execution.
-- Canonical translation storage. Runtime remains safe offline through the bundled default catalog.

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('translationCenter','مركز الترجمه','الإعدادات والخصوصية',115,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin'::public.app_role,'translationCenter',true,true,true,true,true)
on conflict(role,screen_key) do update set
  can_view=true,
  can_add=true,
  can_edit=true,
  can_delete=true,
  can_export=true,
  updated_at=now();

create table if not exists public.app_translations (
  translation_key text primary key,
  screen_key text not null,
  module_name text not null default 'core',
  text_type text not null default 'label',
  ar_text text not null,
  en_text text not null,
  default_ar text not null,
  default_en text not null,
  is_active boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint app_translations_nonempty_key check (length(trim(translation_key)) > 0),
  constraint app_translations_nonempty_ar check (length(trim(ar_text)) > 0),
  constraint app_translations_nonempty_en check (length(trim(en_text)) > 0)
);

create index if not exists idx_app_translations_screen_active
  on public.app_translations(screen_key,is_active,translation_key);

alter table public.app_translations enable row level security;

drop policy if exists app_translations_authenticated_read on public.app_translations;
create policy app_translations_authenticated_read
on public.app_translations
for select
to authenticated
using (true);

drop policy if exists app_translations_translation_center_insert on public.app_translations;
create policy app_translations_translation_center_insert
on public.app_translations
for insert
to authenticated
with check (public.has_screen_permission('translationCenter','edit'));

drop policy if exists app_translations_translation_center_update on public.app_translations;
create policy app_translations_translation_center_update
on public.app_translations
for update
to authenticated
using (public.has_screen_permission('translationCenter','edit'))
with check (public.has_screen_permission('translationCenter','edit'));

drop policy if exists app_translations_translation_center_delete on public.app_translations;
create policy app_translations_translation_center_delete
on public.app_translations
for delete
to authenticated
using (public.has_screen_permission('translationCenter','delete'));

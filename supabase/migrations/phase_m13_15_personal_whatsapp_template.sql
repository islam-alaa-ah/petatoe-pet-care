-- Phase M13.15 — one private WhatsApp template per authenticated user.
create table if not exists public.user_whatsapp_templates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_text text not null default '' check (char_length(message_text) <= 2000),
  image_path text,
  image_name text,
  image_mime text check (image_mime is null or image_mime in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_whatsapp_templates enable row level security;

drop policy if exists "Users read own WhatsApp template" on public.user_whatsapp_templates;
create policy "Users read own WhatsApp template"
on public.user_whatsapp_templates for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own WhatsApp template" on public.user_whatsapp_templates;
create policy "Users insert own WhatsApp template"
on public.user_whatsapp_templates for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own WhatsApp template" on public.user_whatsapp_templates;
create policy "Users update own WhatsApp template"
on public.user_whatsapp_templates for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own WhatsApp template" on public.user_whatsapp_templates;
create policy "Users delete own WhatsApp template"
on public.user_whatsapp_templates for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-whatsapp-templates',
  'user-whatsapp-templates',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own WhatsApp image" on storage.objects;
create policy "Users read own WhatsApp image"
on storage.objects for select
to authenticated
using (
  bucket_id = 'user-whatsapp-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users upload own WhatsApp image" on storage.objects;
create policy "Users upload own WhatsApp image"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user-whatsapp-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own WhatsApp image" on storage.objects;
create policy "Users update own WhatsApp image"
on storage.objects for update
to authenticated
using (
  bucket_id = 'user-whatsapp-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-whatsapp-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own WhatsApp image" on storage.objects;
create policy "Users delete own WhatsApp image"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'user-whatsapp-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

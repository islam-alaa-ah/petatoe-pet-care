begin;

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('installationRequestNew','طلب تركيب جديد','إدارة التركيبات',65,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin'::public.app_role,'installationRequestNew',true,true,false,false,false)
on conflict(role,screen_key) do update set
  can_view=excluded.can_view,
  can_add=excluded.can_add;

-- Compatibility guard: quotation linkage is optional by design.
alter table public.installation_requests alter column quotation_id drop not null;

commit;

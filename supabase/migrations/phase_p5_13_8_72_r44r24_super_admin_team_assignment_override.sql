-- P5.13.8.72 R44R24 — Super Admin existing-team assignment override
-- Scope:
--   1) Keep historical team-period overlap protection unchanged.
--   2) Keep groomer/driver/car collision protection unchanged for every non-super-admin user.
--   3) Allow Super Admin to edit an EXISTING team's effective-dated assignment even when
--      one of the selected resources is still assigned to another team in the overlapping period.
--   4) Do not allow duplicate-resource creation of a NEW team via the override.
--   5) Do not change RLS, screen permissions, appointment calculations, commissions, treasury,
--      offline queue contracts, replay guards, or R44 retention/pruning behavior.

begin;

create or replace function public.guard_installation_team_assignment_history_overlap()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_to date := coalesce(new.effective_to,'infinity'::date);
  v_closing_existing boolean := false;
  v_super_admin_edit_override boolean := false;
begin
  if tg_op='UPDATE' then
    v_closing_existing := old.installation_team_id=new.installation_team_id
      and old.groomer_employee_id is not distinct from new.groomer_employee_id
      and old.driver_employee_id is not distinct from new.driver_employee_id
      and old.appointment_car_id is not distinct from new.appointment_car_id
      and old.effective_from=new.effective_from
      and old.effective_to is null
      and new.effective_to is not null;
  end if;

  -- R44R24: a Super Admin may correct/change an EXISTING team's assignment even if one
  -- of the selected resources is still present on another team for the same period.
  -- The save RPC is the only authenticated write path to this history table, and it sets
  -- these sources only when editing an existing team. New-team source='create' stays guarded.
  v_super_admin_edit_override := public.current_user_role()='super_admin'::public.app_role
    and coalesce(new.source,'') in ('assignment_change','assignment_correction_same_start');

  -- Never bypass overlap inside the same team timeline. Historical periods must remain
  -- non-overlapping even for Super Admin.
  if exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id=new.installation_team_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'فترة ربط الفريق تتداخل مع فترة موجودة بالفعل' using errcode='23514';
  end if;

  if not v_closing_existing and not v_super_admin_edit_override and new.groomer_employee_id is not null and exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id<>new.installation_team_id
      and h.groomer_employee_id=new.groomer_employee_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'الجرومر مرتبط بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  if not v_closing_existing and not v_super_admin_edit_override and new.driver_employee_id is not null and exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id<>new.installation_team_id
      and h.driver_employee_id=new.driver_employee_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'السائق مرتبط بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  if not v_closing_existing and not v_super_admin_edit_override and new.appointment_car_id is not null and exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id<>new.installation_team_id
      and h.appointment_car_id=new.appointment_car_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'السيارة مرتبطة بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  return new;
end;
$$;

-- Localized release metadata only; preserve administrator-customized translations.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
) values
  ('pwa.update.release.r44r24.title','aboutApp','system','title','تجاوز ربط فرق المواعيد للسوبر أدمن','Super Admin Team Assignment Override','تجاوز ربط فرق المواعيد للسوبر أدمن','Super Admin Team Assignment Override',true,now()),
  ('pwa.update.release.r44r24.note1','aboutApp','system','help','السماح للسوبر أدمن بتعديل ربط فريق موجود حتى عند وجود الجرومر أو السائق أو السيارة في فريق آخر خلال نفس الفترة.','Allows Super Admin to edit an existing team assignment even when the groomer, driver, or vehicle is assigned to another team in the same period.','السماح للسوبر أدمن بتعديل ربط فريق موجود حتى عند وجود الجرومر أو السائق أو السيارة في فريق آخر خلال نفس الفترة.','Allows Super Admin to edit an existing team assignment even when the groomer, driver, or vehicle is assigned to another team in the same period.',true,now()),
  ('pwa.update.release.r44r24.note2','aboutApp','system','help','يظل منع تضارب الموارد فعالًا لباقي المستخدمين وعند إنشاء فريق جديد.','Resource collision protection remains active for all other users and when creating a new team.','يظل منع تضارب الموارد فعالًا لباقي المستخدمين وعند إنشاء فريق جديد.','Resource collision protection remains active for all other users and when creating a new team.',true,now()),
  ('pwa.update.release.r44r24.note3','aboutApp','system','help','لا تغيير على الفترات التاريخية داخل نفس الفريق أو الصلاحيات العامة أو العمولات أو خزينة السيارة.','No changes to same-team historical period integrity, global permissions, commissions, or Vehicle Treasury.','لا تغيير على الفترات التاريخية داخل نفس الفريق أو الصلاحيات العامة أو العمولات أو خزينة السيارة.','No changes to same-team historical period integrity, global permissions, commissions, or Vehicle Treasury.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=case when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' or public.app_translations.ar_text=public.app_translations.default_ar then excluded.ar_text else public.app_translations.ar_text end,
  en_text=case when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' or public.app_translations.en_text=public.app_translations.default_en then excluded.en_text else public.app_translations.en_text end,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;

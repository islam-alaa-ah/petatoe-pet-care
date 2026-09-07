-- Phase P5.13.8.72 R44R22
-- Effective-dated team assignment cutover correction.
-- Business rule approved: preserve all pre-2026-09-01 assignment history as frozen legacy data,
-- and start the current assignment timeline at 2026-09-01. Future edits are effective-dated.

begin;

create or replace function public.installation_team_assignment_cutover_date()
returns date
language sql
immutable
as $$ select date '2026-09-01' $$;
revoke all on function public.installation_team_assignment_cutover_date() from public,anon,authenticated;

-- Preflight: the assignment active on the cutover date must be unambiguous. R44R21 seeded
-- the existing current state before its overlap trigger was installed, so detect any pre-existing
-- duplicate resource ownership explicitly and abort instead of silently rewriting it.
do $$
declare
  v_cutover constant date := date '2026-09-01';
begin
  if exists(
    select 1
    from public.installation_team_assignment_history h
    where h.groomer_employee_id is not null
      and h.effective_from<=v_cutover
      and (h.effective_to is null or h.effective_to>=v_cutover)
    group by h.groomer_employee_id
    having count(distinct h.installation_team_id)>1
  ) then
    raise exception 'يوجد جرومر مرتبط بأكثر من فريق في تاريخ 2026-09-01؛ صحح الربط الحالي قبل تشغيل Cutover';
  end if;
  if exists(
    select 1
    from public.installation_team_assignment_history h
    where h.driver_employee_id is not null
      and h.effective_from<=v_cutover
      and (h.effective_to is null or h.effective_to>=v_cutover)
    group by h.driver_employee_id
    having count(distinct h.installation_team_id)>1
  ) then
    raise exception 'يوجد سائق مرتبط بأكثر من فريق في تاريخ 2026-09-01؛ صحح الربط الحالي قبل تشغيل Cutover';
  end if;
  if exists(
    select 1
    from public.installation_team_assignment_history h
    where h.appointment_car_id is not null
      and h.effective_from<=v_cutover
      and (h.effective_to is null or h.effective_to>=v_cutover)
    group by h.appointment_car_id
    having count(distinct h.installation_team_id)>1
  ) then
    raise exception 'توجد سيارة مرتبطة بأكثر من فريق في تاريخ 2026-09-01؛ صحح الربط الحالي قبل تشغيل Cutover';
  end if;
end $$;

-- Split the assignment segment that currently spans the cutover date.
-- The pre-cutover half is frozen exactly as it exists now; the post-cutover half becomes
-- the current effective-dated segment. This does not guess or reconstruct older ownership.
do $$
declare
  v_cutover constant date := date '2026-09-01';
  r public.installation_team_assignment_history%rowtype;
  v_original_to date;
  v_legacy_source text;
begin
  for r in
    select *
    from public.installation_team_assignment_history h
    where h.effective_from < v_cutover
      and (h.effective_to is null or h.effective_to >= v_cutover)
    order by h.installation_team_id,h.effective_from
    for update
  loop
    v_original_to := r.effective_to;
    v_legacy_source := case
      when r.source in ('baseline_current','recovered_current') then 'legacy_frozen_pre_cutover'
      else r.source
    end;

    update public.installation_team_assignment_history
    set effective_to = v_cutover - 1,
        source = v_legacy_source
    where id = r.id;

    if not exists(
      select 1
      from public.installation_team_assignment_history x
      where x.installation_team_id = r.installation_team_id
        and x.effective_from = v_cutover
    ) then
      insert into public.installation_team_assignment_history(
        installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
        groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
        effective_from,effective_to,source,created_by
      ) values(
        r.installation_team_id,r.groomer_employee_id,r.driver_employee_id,r.appointment_car_id,
        r.groomer_name_snapshot,r.driver_name_snapshot,r.car_name_snapshot,r.plate_number_snapshot,r.team_name_snapshot,
        v_cutover,v_original_to,'cutover_current',auth.uid()
      );
    end if;
  end loop;
end $$;

-- Prevent the canonical resolver from leaking the mutable current team into a date that
-- predates the first stored segment. Fallback to installation_teams is permitted only when
-- the team has no history rows at all and the requested date is on/after the cutover.
create or replace function public.installation_team_assignment_at(
  p_team_id uuid,
  p_business_date date
)
returns table(
  assignment_id uuid,
  installation_team_id uuid,
  groomer_employee_id uuid,
  driver_employee_id uuid,
  appointment_car_id uuid,
  groomer_name text,
  driver_name text,
  car_name text,
  plate_number text,
  team_name text,
  effective_from date,
  effective_to date
)
language sql
stable
security definer
set search_path=public
as $$
  with wanted as (
    select coalesce(p_business_date,current_date) as business_date,
           public.installation_team_assignment_cutover_date() as cutover_date
  ), allowed as (
    select (
      auth.role()='service_role'
      or public.has_screen_permission('installationSchedule','view')
      or public.has_screen_permission('installationRequestNew','add')
      or public.has_screen_permission('installationRequests','edit')
      or public.has_screen_permission('installationSettings','view')
      or public.has_screen_permission('commissionManagement','view')
      or public.has_screen_permission('payrollManagement','add')
      or public.has_screen_permission('payrollManagement','edit')
      or public.has_screen_permission('vehicleTreasury','view')
      or public.has_screen_permission('vehicleTreasury','add')
      or public.has_screen_permission('vehicleTreasury','edit')
      or public.can_access_installation_team(p_team_id)
    ) as ok
  ), historical as (
    select
      h.id assignment_id,h.installation_team_id,h.groomer_employee_id,h.driver_employee_id,h.appointment_car_id,
      h.groomer_name_snapshot groomer_name,h.driver_name_snapshot driver_name,h.car_name_snapshot car_name,
      h.plate_number_snapshot plate_number,h.team_name_snapshot team_name,h.effective_from,h.effective_to
    from public.installation_team_assignment_history h,wanted w,allowed a
    where a.ok
      and h.installation_team_id=p_team_id
      and h.effective_from<=w.business_date
      and (h.effective_to is null or h.effective_to>=w.business_date)
    order by h.effective_from desc,h.created_at desc
    limit 1
  ), fallback as (
    select
      null::uuid assignment_id,t.id installation_team_id,t.groomer_employee_id,t.driver_employee_id,t.appointment_car_id,
      coalesce(g.full_name,t.groomer_name,t.leader_name) groomer_name,
      coalesce(d.full_name,t.driver_name) driver_name,
      coalesce(c.name,t.car_name) car_name,
      c.plate_number,
      t.name team_name,
      w.business_date effective_from,null::date effective_to
    from public.installation_teams t
    cross join allowed a
    cross join wanted w
    left join public.appointment_employees g on g.id=t.groomer_employee_id
    left join public.appointment_employees d on d.id=t.driver_employee_id
    left join public.appointment_cars c on c.id=t.appointment_car_id
    where a.ok
      and t.id=p_team_id
      and w.business_date>=w.cutover_date
      and not exists(
        select 1 from public.installation_team_assignment_history x
        where x.installation_team_id=p_team_id
      )
      and not exists(select 1 from historical)
  )
  select * from historical
  union all
  select * from fallback;
$$;
revoke all on function public.installation_team_assignment_at(uuid,date) from public,anon;
grant execute on function public.installation_team_assignment_at(uuid,date) to authenticated,service_role;

-- Canonical team save: no new effective-dated assignment may start before the approved cutover.
create or replace function public.save_installation_team_assignment_v1(
  p_team_id uuid,
  p_groomer_employee_id uuid,
  p_driver_employee_id uuid,
  p_appointment_car_id uuid,
  p_effective_from date,
  p_status text default 'متاحة'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid:=p_team_id;
  v_existing public.installation_teams%rowtype;
  v_open public.installation_team_assignment_history%rowtype;
  v_groomer public.appointment_employees%rowtype;
  v_driver public.appointment_employees%rowtype;
  v_car public.appointment_cars%rowtype;
  v_effective date:=coalesce(p_effective_from,current_date);
  v_cutover constant date:=date '2026-09-01';
  v_changed boolean:=false;
begin
  if p_team_id is null then
    if not public.has_screen_permission('installationSettings','add') then
      raise exception 'لا توجد صلاحية إضافة فريق موعد';
    end if;
  else
    if not public.has_screen_permission('installationSettings','edit') then
      raise exception 'لا توجد صلاحية تعديل فريق موعد';
    end if;
  end if;

  if v_effective<v_cutover then
    raise exception 'تاريخ سريان الربط لا يمكن أن يكون قبل %',to_char(v_cutover,'YYYY-MM-DD');
  end if;
  if v_effective>current_date then
    raise exception 'تاريخ سريان الربط لا يمكن أن يكون بعد تاريخ اليوم';
  end if;

  select * into v_groomer from public.appointment_employees where id=p_groomer_employee_id;
  if not found or v_groomer.employee_type<>'جرومر' or not v_groomer.is_active then
    raise exception 'الجرومر المختار غير صالح أو غير نشط';
  end if;
  select * into v_driver from public.appointment_employees where id=p_driver_employee_id;
  if not found or v_driver.employee_type<>'سائق' or not v_driver.is_active then
    raise exception 'السائق المختار غير صالح أو غير نشط';
  end if;
  select * into v_car from public.appointment_cars where id=p_appointment_car_id;
  if not found or not v_car.is_active then
    raise exception 'السيارة المختارة غير صالحة أو غير نشطة';
  end if;

  if p_team_id is null then
    insert into public.installation_teams(
      groomer_employee_id,driver_employee_id,appointment_car_id,
      groomer_name,driver_name,car_name,leader_name,name,phone,city,status
    ) values(
      v_groomer.id,v_driver.id,v_car.id,
      v_groomer.full_name,v_driver.full_name,v_car.name,v_groomer.full_name,
      v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,null,null,coalesce(nullif(btrim(p_status),''),'متاحة')
    ) returning id into v_id;

    insert into public.installation_team_assignment_history(
      installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
      groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
      effective_from,effective_to,source,created_by
    ) values(
      v_id,v_groomer.id,v_driver.id,v_car.id,
      v_groomer.full_name,v_driver.full_name,v_car.name,v_car.plate_number,
      v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
      v_effective,null,'create',auth.uid()
    );
    return v_id;
  end if;

  select * into v_existing from public.installation_teams where id=p_team_id for update;
  if not found then raise exception 'فريق الموعد غير موجود'; end if;

  v_changed := v_existing.groomer_employee_id is distinct from v_groomer.id
            or v_existing.driver_employee_id is distinct from v_driver.id
            or v_existing.appointment_car_id is distinct from v_car.id;

  if v_changed then
    select * into v_open
    from public.installation_team_assignment_history
    where installation_team_id=p_team_id and effective_to is null
    order by effective_from desc
    limit 1
    for update;

    if not found then
      insert into public.installation_team_assignment_history(
        installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
        groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
        effective_from,effective_to,source,created_by
      ) values(
        p_team_id,v_existing.groomer_employee_id,v_existing.driver_employee_id,v_existing.appointment_car_id,
        coalesce(v_existing.groomer_name,v_existing.leader_name),v_existing.driver_name,v_existing.car_name,null,v_existing.name,
        v_cutover,null,'recovered_current_cutover',auth.uid()
      ) returning * into v_open;
    end if;

    if v_effective<v_open.effective_from then
      raise exception 'تاريخ سريان التعديل لا يمكن أن يسبق بداية الربط الحالي (%)',v_open.effective_from;
    elsif v_effective=v_open.effective_from then
      -- Same-start correction: replace only the current segment. The frozen segment before
      -- the cutover remains untouched, so choosing 2026-09-01 can correct the current linkage
      -- without rewriting anything through 2026-08-31.
      update public.installation_team_assignment_history
      set groomer_employee_id=v_groomer.id,
          driver_employee_id=v_driver.id,
          appointment_car_id=v_car.id,
          groomer_name_snapshot=v_groomer.full_name,
          driver_name_snapshot=v_driver.full_name,
          car_name_snapshot=v_car.name,
          plate_number_snapshot=v_car.plate_number,
          team_name_snapshot=v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
          source='assignment_correction_same_start'
      where id=v_open.id;
    else
      update public.installation_team_assignment_history
      set effective_to=v_effective-1
      where id=v_open.id;

      insert into public.installation_team_assignment_history(
        installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
        groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
        effective_from,effective_to,source,created_by
      ) values(
        p_team_id,v_groomer.id,v_driver.id,v_car.id,
        v_groomer.full_name,v_driver.full_name,v_car.name,v_car.plate_number,
        v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
        v_effective,null,'assignment_change',auth.uid()
      );
    end if;
  end if;

  update public.installation_teams
  set groomer_employee_id=v_groomer.id,
      driver_employee_id=v_driver.id,
      appointment_car_id=v_car.id,
      groomer_name=v_groomer.full_name,
      driver_name=v_driver.full_name,
      car_name=v_car.name,
      leader_name=v_groomer.full_name,
      name=v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
      phone=null,
      city=null,
      status=coalesce(nullif(btrim(p_status),''),v_existing.status,'متاحة')
  where id=p_team_id;

  return p_team_id;
end;
$$;
revoke all on function public.save_installation_team_assignment_v1(uuid,uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.save_installation_team_assignment_v1(uuid,uuid,uuid,uuid,date,text) to authenticated,service_role;

-- Localization additions for the cutover guard and release metadata.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
) values
  ('appointmentSettings.team.cutoverMinimum','installationSettings','appointments','error','تاريخ سريان الربط لا يمكن أن يكون قبل 01/09/2026.','Assignment effective date cannot be before 2026-09-01.','تاريخ سريان الربط لا يمكن أن يكون قبل 01/09/2026.','Assignment effective date cannot be before 2026-09-01.',true,now()),
  ('appointmentSettings.team.cutoverHint','installationSettings','appointments','help','تم تثبيت البيانات السابقة لـ 01/09/2026 كما هي، ويبدأ الربط التاريخي الحالي من 01/09/2026.','Data before 2026-09-01 is frozen as-is; the current effective-dated assignment timeline starts on 2026-09-01.','تم تثبيت البيانات السابقة لـ 01/09/2026 كما هي، ويبدأ الربط التاريخي الحالي من 01/09/2026.','Data before 2026-09-01 is frozen as-is; the current effective-dated assignment timeline starts on 2026-09-01.',true,now()),
  ('pwa.update.release.r44r22.title','aboutApp','system','title','تثبيت نقطة بداية تاريخ ربط فرق المواعيد','Appointment Team Assignment Cutover','تثبيت نقطة بداية تاريخ ربط فرق المواعيد','Appointment Team Assignment Cutover',true,now()),
  ('pwa.update.release.r44r22.note1','aboutApp','system','help','تثبيت بيانات الربط السابقة لـ 01/09/2026 كما هي ومنع أي تعديل لاحق من إعادة تفسيرها.','Freezes assignment data before 2026-09-01 as-is so later team changes cannot reinterpret it.','تثبيت بيانات الربط السابقة لـ 01/09/2026 كما هي ومنع أي تعديل لاحق من إعادة تفسيرها.','Freezes assignment data before 2026-09-01 as-is so later team changes cannot reinterpret it.',true,now()),
  ('pwa.update.release.r44r22.note2','aboutApp','system','help','بدء الربط التاريخي الحالي من 01/09/2026 مع استمرار أي نقل لاحق حسب تاريخ السريان المحدد.','Starts the current effective-dated assignment timeline on 2026-09-01 while future transfers continue to follow their selected effective dates.','بدء الربط التاريخي الحالي من 01/09/2026 مع استمرار أي نقل لاحق حسب تاريخ السريان المحدد.','Starts the current effective-dated assignment timeline on 2026-09-01 while future transfers continue to follow their selected effective dates.',true,now()),
  ('pwa.update.release.r44r22.note3','aboutApp','system','help','منع إنشاء ربط جديد بتاريخ يسبق 01/09/2026 مع الحفاظ على منطق العمولات والتقارير وخزينة السيارة القائم على تاريخ العملية.','Prevents new assignment segments before 2026-09-01 while preserving business-date attribution for commissions, reports, and Vehicle Treasury.','منع إنشاء ربط جديد بتاريخ يسبق 01/09/2026 مع الحفاظ على منطق العمولات والتقارير وخزينة السيارة القائم على تاريخ العملية.','Prevents new assignment segments before 2026-09-01 while preserving business-date attribution for commissions, reports, and Vehicle Treasury.',true,now())
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

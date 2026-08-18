-- Phase P5.13.8.38 — Completion collection-stage reconciliation
-- Purpose:
-- 1) Reconcile historical completed visits whose real collection event exists in
--    installation_request_collection.collected_at but collection_at was not copied
--    to the visit/request execution-stage columns.
-- 2) Keep the mandatory collection gate intact. We never invent a collection
--    timestamp from amount/payment fields alone.
-- 3) Route direct quantity-confirmation + invoice creation through canonical
--    wrappers that reconcile stage timestamps before the atomic confirmation RPC.
begin;

create or replace function public.reconcile_installation_collection_stage_for_completion(
  p_request_id uuid,
  p_visit_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  ids uuid[];
  stage_stamp timestamptz;
  collection_stamp timestamptz;
begin
  if p_request_id is null or p_visit_id is null then
    raise exception 'بيانات زيارة التنفيذ غير مكتملة';
  end if;

  select * into r
  from public.installation_requests
  where id=p_request_id
  for update;
  if not found then raise exception 'الموعد غير موجود'; end if;

  select * into v
  from public.installation_execution_visits
  where id=p_visit_id and installation_request_id=p_request_id
  for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;

  ids:=public.get_installation_execution_group_visit_ids(p_request_id,p_visit_id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[p_visit_id]; end if;

  -- Prefer an already-recorded execution-stage timestamp. If one sibling has it,
  -- synchronize the whole same-day execution group.
  select min(x.collection_at) into stage_stamp
  from public.installation_execution_visits x
  where x.id=any(ids) and x.collection_at is not null;

  stage_stamp:=coalesce(stage_stamp,r.collection_at);

  -- collected_at is the audit proof that the collection stage was actually
  -- confirmed. amount/payment values may be edited later in Completion and are
  -- therefore intentionally NOT sufficient to manufacture a stage timestamp.
  select c.collected_at into collection_stamp
  from public.installation_request_collection c
  where c.installation_request_id=p_request_id;

  stage_stamp:=coalesce(stage_stamp,collection_stamp);

  if stage_stamp is null then
    raise exception 'يجب تأكيد مرحلة التحصيل قبل اعتماد الكمية وإنشاء الفاتورة';
  end if;

  update public.installation_execution_visits
  set collection_at=coalesce(collection_at,stage_stamp),updated_at=now()
  where id=any(ids) and collection_at is null;

  update public.installation_requests
  set collection_at=coalesce(collection_at,stage_stamp)
  where id=p_request_id and collection_at is null;

  return stage_stamp;
end;
$$;

revoke all on function public.reconcile_installation_collection_stage_for_completion(uuid,uuid) from public,anon;
grant execute on function public.reconcile_installation_collection_stage_for_completion(uuid,uuid) to authenticated,service_role;

-- One-time safe repair for historical completed/awaiting-confirmation visits.
-- Only rows with an audited collection event (collected_at) are repaired.
with proven as (
  select c.installation_request_id,c.collected_at
  from public.installation_request_collection c
  where c.collected_at is not null
)
update public.installation_execution_visits v
set collection_at=p.collected_at,updated_at=now()
from proven p
where v.installation_request_id=p.installation_request_id
  and v.collection_at is null
  and v.completed_at is not null
  and v.status in ('بانتظار التأكيد','مؤكدة');

with proven as (
  select c.installation_request_id,c.collected_at
  from public.installation_request_collection c
  where c.collected_at is not null
)
update public.installation_requests r
set collection_at=p.collected_at
from proven p
where r.id=p.installation_request_id
  and r.collection_at is null
  and exists(
    select 1 from public.installation_execution_visits v
    where v.installation_request_id=r.id
      and v.completed_at is not null
  );

create or replace function public.confirm_installation_execution_visit_and_create_invoice_v4(
  p_request_id uuid,
  p_visit_id uuid,
  p_lines jsonb,
  p_remaining_action text,
  p_schedule jsonb default null,
  p_notes text default null,
  p_invoice_number text default null,
  p_invoice_date date default current_date,
  p_without_invoice boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.reconcile_installation_collection_stage_for_completion(p_request_id,p_visit_id);
  return public.confirm_installation_execution_visit_and_create_invoice_v3(
    p_request_id,p_visit_id,p_lines,p_remaining_action,p_schedule,p_notes,
    p_invoice_number,p_invoice_date,p_without_invoice
  );
end;
$$;

grant execute on function public.confirm_installation_execution_visit_and_create_invoice_v4(uuid,uuid,jsonb,text,jsonb,text,text,date,boolean) to authenticated;

create or replace function public.confirm_installation_execution_group_and_create_invoice_v5(
  p_request_id uuid,
  p_anchor_visit_id uuid,
  p_lines jsonb,
  p_remaining_action text,
  p_schedule jsonb default null,
  p_notes text default null,
  p_invoice_number text default null,
  p_invoice_date date default current_date,
  p_without_invoice boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.reconcile_installation_collection_stage_for_completion(p_request_id,p_anchor_visit_id);
  return public.confirm_installation_execution_group_and_create_invoice_v4(
    p_request_id,p_anchor_visit_id,p_lines,p_remaining_action,p_schedule,p_notes,
    p_invoice_number,p_invoice_date,p_without_invoice
  );
end;
$$;

grant execute on function public.confirm_installation_execution_group_and_create_invoice_v5(uuid,uuid,jsonb,text,jsonb,text,text,date,boolean) to authenticated;

notify pgrst,'reload schema';
commit;

-- PETATOE P5.13.8.72 R33 — Safe CRM offline delete + tombstone delta feed
-- Scope: customers, customer_followups, quotations.
-- Canonical hard-delete semantics are preserved; no soft-delete columns are introduced.

begin;

create table if not exists public.crm_sync_tombstones (
  entity text not null check (entity in ('customers','followups','quotations')),
  entity_id uuid not null,
  customer_id uuid,
  representative_id uuid,
  source_updated_at timestamptz,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  operation_key text,
  primary key (entity, entity_id)
);

create index if not exists idx_crm_sync_tombstones_entity_deleted
  on public.crm_sync_tombstones(entity, deleted_at);
create index if not exists idx_crm_sync_tombstones_rep_deleted
  on public.crm_sync_tombstones(entity, representative_id, deleted_at);
create index if not exists idx_crm_sync_tombstones_customer
  on public.crm_sync_tombstones(customer_id, deleted_at);
create unique index if not exists uq_crm_sync_tombstones_operation_entity
  on public.crm_sync_tombstones(operation_key, entity, entity_id)
  where operation_key is not null;

alter table public.crm_sync_tombstones enable row level security;
revoke all on public.crm_sync_tombstones from public, anon, authenticated;
grant all on public.crm_sync_tombstones to service_role;

create or replace function public.capture_crm_sync_tombstone()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entity text;
  v_row jsonb := to_jsonb(old);
  v_operation_key text := nullif(current_setting('petatoe.crm_delete_operation_key', true), '');
  v_customer_id uuid;
  v_representative_id uuid;
  v_source_updated_at timestamptz;
begin
  v_entity := case tg_table_name
    when 'customers' then 'customers'
    when 'customer_followups' then 'followups'
    when 'quotations' then 'quotations'
    else null
  end;
  if v_entity is null then return old; end if;

  v_customer_id := case
    when v_entity='customers' then old.id
    else nullif(v_row->>'customer_id','')::uuid
  end;
  v_representative_id := nullif(v_row->>'representative_id','')::uuid;
  v_source_updated_at := nullif(v_row->>'updated_at','')::timestamptz;

  insert into public.crm_sync_tombstones(
    entity,entity_id,customer_id,representative_id,source_updated_at,
    deleted_at,deleted_by,operation_key
  ) values (
    v_entity,old.id,v_customer_id,v_representative_id,v_source_updated_at,
    now(),auth.uid(),v_operation_key
  )
  on conflict(entity,entity_id) do update set
    customer_id=excluded.customer_id,
    representative_id=excluded.representative_id,
    source_updated_at=excluded.source_updated_at,
    deleted_at=excluded.deleted_at,
    deleted_by=excluded.deleted_by,
    operation_key=coalesce(excluded.operation_key,public.crm_sync_tombstones.operation_key);
  return old;
end;
$$;

revoke all on function public.capture_crm_sync_tombstone() from public, anon, authenticated;

drop trigger if exists trg_customers_sync_tombstone on public.customers;
create trigger trg_customers_sync_tombstone before delete on public.customers
for each row execute function public.capture_crm_sync_tombstone();

drop trigger if exists trg_followups_sync_tombstone on public.customer_followups;
create trigger trg_followups_sync_tombstone before delete on public.customer_followups
for each row execute function public.capture_crm_sync_tombstone();

drop trigger if exists trg_quotations_sync_tombstone on public.quotations;
create trigger trg_quotations_sync_tombstone before delete on public.quotations
for each row execute function public.capture_crm_sync_tombstone();

create or replace function public.list_crm_sync_tombstones(
  p_entity text,
  p_since timestamptz default null
)
returns table(
  entity_id uuid,
  customer_id uuid,
  representative_id uuid,
  source_updated_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_entity not in ('customers','followups','quotations') then raise exception 'CRM_TOMBSTONE_ENTITY_INVALID'; end if;

  if p_entity='customers' then
    if not public.can_read_customer_identity() then raise exception 'CRM_TOMBSTONE_VIEW_DENIED' using errcode='42501'; end if;
    return query
      select t.entity_id,t.customer_id,t.representative_id,t.source_updated_at,t.deleted_at
      from public.crm_sync_tombstones t
      where t.entity='customers' and (p_since is null or t.deleted_at>=p_since)
      order by t.deleted_at asc;
    return;
  end if;

  if p_entity='followups' then
    if not public.has_screen_permission('followups','view') then raise exception 'CRM_TOMBSTONE_VIEW_DENIED' using errcode='42501'; end if;
    return query
      select t.entity_id,t.customer_id,t.representative_id,t.source_updated_at,t.deleted_at
      from public.crm_sync_tombstones t
      where t.entity='followups'
        and (p_since is null or t.deleted_at>=p_since)
        and public.can_access_representative(t.representative_id)
      order by t.deleted_at asc;
    return;
  end if;

  if not public.has_screen_permission('quotations','view') then raise exception 'CRM_TOMBSTONE_VIEW_DENIED' using errcode='42501'; end if;
  return query
    select t.entity_id,t.customer_id,t.representative_id,t.source_updated_at,t.deleted_at
    from public.crm_sync_tombstones t
    where t.entity='quotations'
      and (p_since is null or t.deleted_at>=p_since)
      and public.can_access_representative(t.representative_id)
    order by t.deleted_at asc;
end;
$$;

revoke all on function public.list_crm_sync_tombstones(text,timestamptz) from public, anon;
grant execute on function public.list_crm_sync_tombstones(text,timestamptz) to authenticated,service_role;

create or replace function public.delete_crm_entity_safe(
  p_entity text,
  p_entity_id uuid,
  p_base_updated_at timestamptz,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_screen text;
  v_updated_at timestamptz;
  v_representative_id uuid;
  v_customer_id uuid;
  v_deleted_at timestamptz;
  v_existing_operation text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_entity not in ('customers','followups','quotations') then raise exception 'CRM_DELETE_ENTITY_INVALID'; end if;
  if p_entity_id is null then raise exception 'CRM_DELETE_ID_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_operation_key,'')),'') is null then raise exception 'CRM_DELETE_OPERATION_KEY_REQUIRED'; end if;

  v_screen := case p_entity when 'customers' then 'customers' when 'followups' then 'followups' else 'quotations' end;
  if not public.has_screen_permission(v_screen,'delete') then raise exception 'CRM_DELETE_PERMISSION_DENIED' using errcode='42501'; end if;

  select t.deleted_at,t.operation_key,t.representative_id,t.customer_id
    into v_deleted_at,v_existing_operation,v_representative_id,v_customer_id
  from public.crm_sync_tombstones t
  where t.entity=p_entity and t.entity_id=p_entity_id;

  if v_deleted_at is not null and v_existing_operation=p_operation_key then
    if p_entity in ('followups','quotations') and not public.can_access_representative(v_representative_id) then
      raise exception 'CRM_DELETE_SCOPE_DENIED' using errcode='42501';
    end if;
    return jsonb_build_object('ok',true,'id',p_entity_id,'deletedAt',v_deleted_at,'applied',false,'idempotent',true,'converged',true);
  end if;

  v_updated_at := null;
  if p_entity='customers' then
    select c.updated_at into v_updated_at from public.customers c where c.id=p_entity_id for update;
  elsif p_entity='followups' then
    select f.updated_at,f.representative_id,f.customer_id
      into v_updated_at,v_representative_id,v_customer_id
    from public.customer_followups f where f.id=p_entity_id for update;
    if v_updated_at is not null and not public.can_access_representative(v_representative_id) then raise exception 'CRM_DELETE_SCOPE_DENIED' using errcode='42501'; end if;
  else
    select q.updated_at,q.representative_id,q.customer_id
      into v_updated_at,v_representative_id,v_customer_id
    from public.quotations q where q.id=p_entity_id for update;
    if v_updated_at is not null and not public.can_access_representative(v_representative_id) then raise exception 'CRM_DELETE_SCOPE_DENIED' using errcode='42501'; end if;
  end if;

  if v_updated_at is null then
    if v_deleted_at is not null then
      if p_entity in ('followups','quotations') and not public.can_access_representative(v_representative_id) then raise exception 'CRM_DELETE_SCOPE_DENIED' using errcode='42501'; end if;
      return jsonb_build_object('ok',true,'id',p_entity_id,'deletedAt',v_deleted_at,'applied',false,'idempotent',false,'converged',true);
    end if;
    return jsonb_build_object('ok',true,'id',p_entity_id,'applied',false,'notFound',true,'converged',true);
  end if;

  if p_base_updated_at is null then
    return jsonb_build_object('ok',false,'conflict',true,'code','CRM_DELETE_BASE_VERSION_REQUIRED','id',p_entity_id,'serverUpdatedAt',v_updated_at,
      'message','نسخة السجل المحلية لا تحتوي وقت آخر تحديث ولا يمكن تنفيذ حذف Offline آمن.');
  end if;
  if v_updated_at<>p_base_updated_at then
    return jsonb_build_object('ok',false,'conflict',true,'code','CRM_DELETE_CONFLICT','id',p_entity_id,
      'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',v_updated_at,
      'message','تم تعديل السجل على الخادم بعد آخر مزامنة. راجع التغيير قبل إعادة الحذف.');
  end if;

  perform set_config('petatoe.crm_delete_operation_key',p_operation_key,true);
  if p_entity='customers' then
    delete from public.customers where id=p_entity_id;
  elsif p_entity='followups' then
    delete from public.customer_followups where id=p_entity_id;
  else
    delete from public.quotations where id=p_entity_id;
  end if;

  select t.deleted_at into v_deleted_at from public.crm_sync_tombstones t where t.entity=p_entity and t.entity_id=p_entity_id;
  return jsonb_build_object('ok',true,'id',p_entity_id,'deletedAt',v_deleted_at,'applied',true,'idempotent',false,'converged',true);
end;
$$;

revoke all on function public.delete_crm_entity_safe(text,uuid,timestamptz,text) from public, anon;
grant execute on function public.delete_crm_entity_safe(text,uuid,timestamptz,text) to authenticated,service_role;

commit;

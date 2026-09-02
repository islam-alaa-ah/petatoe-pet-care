-- PETATOE P5.13.8.72 R34 — Sync production hardening: CRM client watermarks + safe tombstone retention
-- Safety model:
--   * CRM remains hard-delete + tombstone delta.
--   * No financial / execution / SEA VIBE idempotency ledger is pruned here.
--   * CRM tombstones are retained for at least 60 days.
--   * Active clients that have not advanced past a tombstone block its pruning.
--   * Clients absent longer than the active window are protected by the existing 6-hour forced full reconciliation on reconnect.

begin;

create table if not exists public.sync_client_watermarks (
  user_id uuid not null,
  client_id text not null,
  entity text not null check (entity in ('customers','followups','quotations')),
  scope_key text not null,
  cursor_at timestamptz,
  last_full_sync_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id, entity, scope_key)
);

create index if not exists idx_sync_client_watermarks_entity_seen
  on public.sync_client_watermarks(entity, last_seen_at desc);
create index if not exists idx_sync_client_watermarks_cursor
  on public.sync_client_watermarks(entity, cursor_at);
create index if not exists idx_sync_client_watermarks_full_sync
  on public.sync_client_watermarks(entity, last_full_sync_at);

alter table public.sync_client_watermarks enable row level security;
revoke all on public.sync_client_watermarks from public, anon, authenticated;
grant all on public.sync_client_watermarks to service_role;

create or replace function public.ack_sync_client_watermark(
  p_client_id text,
  p_entity text,
  p_scope_key text,
  p_cursor timestamptz default null,
  p_last_full_sync_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id text := btrim(coalesce(p_client_id,''));
  v_scope_key text := btrim(coalesce(p_scope_key,''));
  v_cursor timestamptz := p_cursor;
  v_full timestamptz := p_last_full_sync_at;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if p_entity not in ('customers','followups','quotations') then
    raise exception 'SYNC_WATERMARK_ENTITY_INVALID';
  end if;
  if length(v_client_id) < 12 or length(v_client_id) > 128 then
    raise exception 'SYNC_WATERMARK_CLIENT_ID_INVALID';
  end if;
  if length(v_scope_key) < 6 or length(v_scope_key) > 128 then
    raise exception 'SYNC_WATERMARK_SCOPE_INVALID';
  end if;
  if v_cursor is null and v_full is null then
    raise exception 'SYNC_WATERMARK_CURSOR_REQUIRED';
  end if;

  -- Keep obviously corrupt/future clocks from polluting retention decisions.
  if v_cursor is not null and v_cursor > now() + interval '10 minutes' then
    v_cursor := now();
  end if;
  if v_full is not null and v_full > now() + interval '10 minutes' then
    v_full := now();
  end if;

  -- The acknowledgement does not grant data access, but it must come from a user
  -- that is currently allowed to read the corresponding domain.
  if p_entity='customers' and not public.can_read_customer_identity() then
    raise exception 'SYNC_WATERMARK_PERMISSION_DENIED' using errcode='42501';
  elsif p_entity='followups' and not public.has_screen_permission('followups','view') then
    raise exception 'SYNC_WATERMARK_PERMISSION_DENIED' using errcode='42501';
  elsif p_entity='quotations' and not public.has_screen_permission('quotations','view') then
    raise exception 'SYNC_WATERMARK_PERMISSION_DENIED' using errcode='42501';
  end if;

  insert into public.sync_client_watermarks(
    user_id, client_id, entity, scope_key, cursor_at, last_full_sync_at,
    first_seen_at, last_seen_at, updated_at
  ) values (
    v_uid, v_client_id, p_entity, v_scope_key, v_cursor, v_full,
    now(), now(), now()
  )
  on conflict(user_id,client_id,entity,scope_key) do update set
    cursor_at = case
      when excluded.cursor_at is null then public.sync_client_watermarks.cursor_at
      when public.sync_client_watermarks.cursor_at is null then excluded.cursor_at
      else greatest(public.sync_client_watermarks.cursor_at, excluded.cursor_at)
    end,
    last_full_sync_at = case
      when excluded.last_full_sync_at is null then public.sync_client_watermarks.last_full_sync_at
      when public.sync_client_watermarks.last_full_sync_at is null then excluded.last_full_sync_at
      else greatest(public.sync_client_watermarks.last_full_sync_at, excluded.last_full_sync_at)
    end,
    last_seen_at = now(),
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'entity', p_entity,
    'clientId', v_client_id,
    'scopeKey', v_scope_key,
    'acknowledgedAt', now()
  );
end;
$$;

revoke all on function public.ack_sync_client_watermark(text,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.ack_sync_client_watermark(text,text,text,timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.prune_crm_sync_tombstones_safe(
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch integer := least(500, greatest(1, coalesce(p_batch_size,250)));
  v_deleted integer := 0;
  v_watermarks_deleted integer := 0;
  v_lock boolean;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  -- Only one browser/session performs global housekeeping at a time.
  v_lock := pg_try_advisory_xact_lock(hashtext('petatoe.crm.tombstone.retention.r34')::bigint);
  if not v_lock then
    return jsonb_build_object('ok',true,'skipped',true,'reason','maintenance_locked','deletedTombstones',0,'deletedWatermarks',0);
  end if;

  -- Fixed safety windows are intentionally not caller-configurable.
  -- 60 days greatly exceeds the client's mandatory 6-hour full-reconciliation window.
  with candidates as (
    select t.entity, t.entity_id
    from public.crm_sync_tombstones t
    where t.deleted_at < now() - interval '60 days'
      and not exists (
        select 1
        from public.sync_client_watermarks w
        where w.entity=t.entity
          and w.last_seen_at >= now() - interval '45 days'
          and greatest(coalesce(w.cursor_at,'epoch'::timestamptz),coalesce(w.last_full_sync_at,'epoch'::timestamptz)) < t.deleted_at
      )
    order by t.deleted_at asc
    limit v_batch
  ), removed as (
    delete from public.crm_sync_tombstones t
    using candidates c
    where t.entity=c.entity and t.entity_id=c.entity_id
    returning 1
  )
  select count(*) into v_deleted from removed;

  -- Watermarks are metadata only. A client absent for >180 days will necessarily
  -- perform a full reconciliation before relying on delta state when it returns.
  with removed as (
    delete from public.sync_client_watermarks w
    where w.last_seen_at < now() - interval '180 days'
    returning 1
  )
  select count(*) into v_watermarks_deleted from removed;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'deletedTombstones', v_deleted,
    'deletedWatermarks', v_watermarks_deleted,
    'minimumTombstoneRetentionDays', 60,
    'activeClientWindowDays', 45,
    'watermarkRetentionDays', 180,
    'batchSize', v_batch
  );
end;
$$;

revoke all on function public.prune_crm_sync_tombstones_safe(integer) from public, anon;
grant execute on function public.prune_crm_sync_tombstones_safe(integer) to authenticated, service_role;

comment on table public.sync_client_watermarks is
  'R34 per-user/browser CRM sync acknowledgements used only to make tombstone retention more conservative.';
comment on function public.prune_crm_sync_tombstones_safe(integer) is
  'R34 bounded CRM tombstone housekeeping. Never prunes execution, financial, SEA VIBE, or other idempotency ledgers.';

commit;

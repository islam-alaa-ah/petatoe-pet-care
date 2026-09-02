-- PETATOE P5.13.8.72 R35 — Idempotency ledger retention readiness + queue-age safety
-- Safety model:
--   * No execution / financial / SEA VIBE idempotency ledger rows are deleted in this phase.
--   * Browser/PWA clients report only bounded queue-age metadata, never payloads or operation keys.
--   * This creates the observation evidence required for a later, separately approved prune policy.
--   * Queue metadata itself is bounded after 180 days.

begin;

create table if not exists public.sync_queue_client_watermarks (
  user_id uuid not null,
  client_id text not null,
  domain text not null check (domain in ('installation_execution','sea_vibe')),
  open_count integer not null default 0 check (open_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  processing_count integer not null default 0 check (processing_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  oldest_open_at timestamptz,
  newest_open_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id, domain)
);

create index if not exists idx_sync_queue_client_watermarks_domain_seen
  on public.sync_queue_client_watermarks(domain,last_seen_at desc);
create index if not exists idx_sync_queue_client_watermarks_oldest_open
  on public.sync_queue_client_watermarks(domain,oldest_open_at)
  where open_count > 0;

alter table public.sync_queue_client_watermarks enable row level security;
revoke all on public.sync_queue_client_watermarks from public, anon, authenticated;
grant all on public.sync_queue_client_watermarks to service_role;

create or replace function public.ack_sync_queue_watermark(
  p_client_id text,
  p_domain text,
  p_open_count integer default 0,
  p_pending_count integer default 0,
  p_retry_count integer default 0,
  p_processing_count integer default 0,
  p_failed_count integer default 0,
  p_conflict_count integer default 0,
  p_oldest_open_at timestamptz default null,
  p_newest_open_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id text := btrim(coalesce(p_client_id,''));
  v_domain text := btrim(coalesce(p_domain,''));
  v_open integer := greatest(0,coalesce(p_open_count,0));
  v_pending integer := greatest(0,coalesce(p_pending_count,0));
  v_retry integer := greatest(0,coalesce(p_retry_count,0));
  v_processing integer := greatest(0,coalesce(p_processing_count,0));
  v_failed integer := greatest(0,coalesce(p_failed_count,0));
  v_conflict integer := greatest(0,coalesce(p_conflict_count,0));
  v_oldest timestamptz := p_oldest_open_at;
  v_newest timestamptz := p_newest_open_at;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if length(v_client_id) < 12 or length(v_client_id) > 128 then
    raise exception 'SYNC_QUEUE_WATERMARK_CLIENT_ID_INVALID';
  end if;
  if v_domain not in ('installation_execution','sea_vibe') then
    raise exception 'SYNC_QUEUE_WATERMARK_DOMAIN_INVALID';
  end if;
  if v_open <> v_pending + v_retry + v_processing + v_failed + v_conflict then
    raise exception 'SYNC_QUEUE_WATERMARK_COUNT_MISMATCH';
  end if;
  if v_open = 0 then
    v_oldest := null;
    v_newest := null;
  else
    if v_oldest is null or v_newest is null then
      raise exception 'SYNC_QUEUE_WATERMARK_RANGE_REQUIRED';
    end if;
    if v_oldest > v_newest then
      raise exception 'SYNC_QUEUE_WATERMARK_RANGE_INVALID';
    end if;
  end if;
  if v_oldest is not null and v_oldest > now() + interval '10 minutes' then v_oldest := now(); end if;
  if v_newest is not null and v_newest > now() + interval '10 minutes' then v_newest := now(); end if;

  insert into public.sync_queue_client_watermarks(
    user_id,client_id,domain,open_count,pending_count,retry_count,processing_count,
    failed_count,conflict_count,oldest_open_at,newest_open_at,first_seen_at,last_seen_at,updated_at
  ) values (
    v_uid,v_client_id,v_domain,v_open,v_pending,v_retry,v_processing,
    v_failed,v_conflict,v_oldest,v_newest,now(),now(),now()
  )
  on conflict(user_id,client_id,domain) do update set
    open_count=excluded.open_count,
    pending_count=excluded.pending_count,
    retry_count=excluded.retry_count,
    processing_count=excluded.processing_count,
    failed_count=excluded.failed_count,
    conflict_count=excluded.conflict_count,
    oldest_open_at=excluded.oldest_open_at,
    newest_open_at=excluded.newest_open_at,
    last_seen_at=now(),
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'domain',v_domain,
    'clientId',v_client_id,
    'openCount',v_open,
    'oldestOpenAt',v_oldest,
    'acknowledgedAt',now()
  );
end;
$$;

revoke all on function public.ack_sync_queue_watermark(text,text,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz) from public, anon;
grant execute on function public.ack_sync_queue_watermark(text,text,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.prune_sync_queue_watermark_metadata_safe(
  p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch integer := least(1000,greatest(1,coalesce(p_batch_size,500)));
  v_deleted integer := 0;
  v_lock boolean;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  v_lock := pg_try_advisory_xact_lock(hashtext('petatoe.sync.queue.retention.metadata.r35')::bigint);
  if not v_lock then
    return jsonb_build_object('ok',true,'skipped',true,'reason','maintenance_locked','deletedWatermarks',0);
  end if;

  with candidates as (
    select user_id,client_id,domain
    from public.sync_queue_client_watermarks
    where last_seen_at < now() - interval '180 days'
    order by last_seen_at asc
    limit v_batch
  ), removed as (
    delete from public.sync_queue_client_watermarks w
    using candidates c
    where w.user_id=c.user_id and w.client_id=c.client_id and w.domain=c.domain
    returning 1
  )
  select count(*) into v_deleted from removed;

  return jsonb_build_object(
    'ok',true,
    'skipped',false,
    'deletedWatermarks',v_deleted,
    'watermarkRetentionDays',180,
    'batchSize',v_batch,
    'ledgerPruningEnabled',false
  );
end;
$$;

revoke all on function public.prune_sync_queue_watermark_metadata_safe(integer) from public, anon;
grant execute on function public.prune_sync_queue_watermark_metadata_safe(integer) to authenticated, service_role;

create or replace function public.get_sync_ledger_retention_readiness()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_execution_count bigint := 0;
  v_execution_oldest timestamptz;
  v_financial_count bigint := 0;
  v_financial_oldest timestamptz;
  v_sea_count bigint := 0;
  v_sea_oldest timestamptz;
  v_active_clients bigint := 0;
  v_open_clients bigint := 0;
  v_oldest_open timestamptz;
  v_observation_started timestamptz;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  select count(*),min(created_at) into v_execution_count,v_execution_oldest from public.installation_execution_sync_operations;
  select count(*),min(created_at) into v_financial_count,v_financial_oldest from public.installation_financial_operations;
  select count(*),min(created_at) into v_sea_count,v_sea_oldest from public.sea_vibe_sync_operations;
  select count(distinct (user_id,client_id)) into v_active_clients
    from public.sync_queue_client_watermarks where last_seen_at >= now() - interval '45 days';
  select count(distinct (user_id,client_id)) into v_open_clients
    from public.sync_queue_client_watermarks where last_seen_at >= now() - interval '45 days' and open_count > 0;
  select min(oldest_open_at) into v_oldest_open
    from public.sync_queue_client_watermarks where last_seen_at >= now() - interval '45 days' and open_count > 0;
  select min(first_seen_at) into v_observation_started from public.sync_queue_client_watermarks;

  return jsonb_build_object(
    'ok',true,
    'pruningEnabled',false,
    'reason','QUEUE_REPLAY_HORIZON_NOT_YET_BOUNDED',
    'observationStartedAt',v_observation_started,
    'activeQueueClients',v_active_clients,
    'activeClientsWithOpenOperations',v_open_clients,
    'oldestObservedOpenOperationAt',v_oldest_open,
    'ledgers',jsonb_build_object(
      'installationExecution',jsonb_build_object('rows',v_execution_count,'oldestAt',v_execution_oldest,'prune',false),
      'installationFinancial',jsonb_build_object('rows',v_financial_count,'oldestAt',v_financial_oldest,'prune',false),
      'seaVibe',jsonb_build_object('rows',v_sea_count,'oldestAt',v_sea_oldest,'prune',false)
    )
  );
end;
$$;

revoke all on function public.get_sync_ledger_retention_readiness() from public, anon, authenticated;
grant execute on function public.get_sync_ledger_retention_readiness() to authenticated, service_role;

comment on table public.sync_queue_client_watermarks is
  'R35 bounded queue-age telemetry for execution and SEA VIBE. Stores counts/timestamps only; never payloads or operation keys.';
comment on function public.get_sync_ledger_retention_readiness() is
  'R35 super-admin retention readiness report. Explicitly does not prune idempotency ledgers.';

commit;

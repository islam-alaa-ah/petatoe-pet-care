-- PETATOE P5.13.8.72 R38 — Replay Horizon Policy
-- Safety model:
--   * Queue-backed Execution + SEA VIBE manual replay is bounded to 90 days from first server attempt.
--   * Legacy pre-R38 attempted operations receive a 90-day client grace window on first R38 observation.
--   * Operations past the horizon remain visible for manual review/discard; direct retry is blocked.
--   * No idempotency ledger rows are deleted in R38. Financial retry policy remains unchanged.

begin;

alter table public.sync_queue_client_watermarks
  add column if not exists replay_policy_version text,
  add column if not exists replay_horizon_days integer,
  add column if not exists replayable_failed_conflict_count integer not null default 0 check (replayable_failed_conflict_count >= 0),
  add column if not exists expired_failed_conflict_count integer not null default 0 check (expired_failed_conflict_count >= 0),
  add column if not exists oldest_replayable_at timestamptz,
  add column if not exists latest_replay_deadline_at timestamptz;

-- Preserve the R35/R37 acknowledgement contract for stale clients, but explicitly mark
-- those client rows as not proving the R38 bounded replay policy.
create or replace function public.ack_sync_queue_watermark(
  p_client_id text, p_domain text, p_open_count integer default 0,
  p_pending_count integer default 0, p_retry_count integer default 0,
  p_processing_count integer default 0, p_failed_count integer default 0,
  p_conflict_count integer default 0, p_oldest_open_at timestamptz default null,
  p_newest_open_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid(); v_client_id text := btrim(coalesce(p_client_id,'')); v_domain text := btrim(coalesce(p_domain,''));
  v_open integer := greatest(0,coalesce(p_open_count,0)); v_pending integer := greatest(0,coalesce(p_pending_count,0));
  v_retry integer := greatest(0,coalesce(p_retry_count,0)); v_processing integer := greatest(0,coalesce(p_processing_count,0));
  v_failed integer := greatest(0,coalesce(p_failed_count,0)); v_conflict integer := greatest(0,coalesce(p_conflict_count,0));
  v_oldest timestamptz := p_oldest_open_at; v_newest timestamptz := p_newest_open_at;
begin
  if v_uid is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if length(v_client_id) < 12 or length(v_client_id) > 128 then raise exception 'SYNC_QUEUE_WATERMARK_CLIENT_ID_INVALID'; end if;
  if v_domain not in ('installation_execution','sea_vibe') then raise exception 'SYNC_QUEUE_WATERMARK_DOMAIN_INVALID'; end if;
  if v_open <> v_pending + v_retry + v_processing + v_failed + v_conflict then raise exception 'SYNC_QUEUE_WATERMARK_COUNT_MISMATCH'; end if;
  if v_open=0 then v_oldest:=null; v_newest:=null;
  elsif v_oldest is null or v_newest is null then raise exception 'SYNC_QUEUE_WATERMARK_RANGE_REQUIRED';
  elsif v_oldest>v_newest then raise exception 'SYNC_QUEUE_WATERMARK_RANGE_INVALID'; end if;
  if v_oldest is not null and v_oldest > now()+interval '10 minutes' then v_oldest:=now(); end if;
  if v_newest is not null and v_newest > now()+interval '10 minutes' then v_newest:=now(); end if;
  insert into public.sync_queue_client_watermarks(
    user_id,client_id,domain,open_count,pending_count,retry_count,processing_count,failed_count,conflict_count,
    oldest_open_at,newest_open_at,first_seen_at,last_seen_at,updated_at,replay_policy_version,replay_horizon_days,
    replayable_failed_conflict_count,expired_failed_conflict_count,oldest_replayable_at,latest_replay_deadline_at
  ) values (
    v_uid,v_client_id,v_domain,v_open,v_pending,v_retry,v_processing,v_failed,v_conflict,v_oldest,v_newest,now(),now(),now(),null,null,0,0,null,null
  ) on conflict(user_id,client_id,domain) do update set
    open_count=excluded.open_count,pending_count=excluded.pending_count,retry_count=excluded.retry_count,processing_count=excluded.processing_count,
    failed_count=excluded.failed_count,conflict_count=excluded.conflict_count,oldest_open_at=excluded.oldest_open_at,newest_open_at=excluded.newest_open_at,
    last_seen_at=now(),updated_at=now(),replay_policy_version=null,replay_horizon_days=null,replayable_failed_conflict_count=0,
    expired_failed_conflict_count=0,oldest_replayable_at=null,latest_replay_deadline_at=null;
  return jsonb_build_object('ok',true,'domain',v_domain,'openCount',v_open,'boundedReplayPolicy',false,'acknowledgedAt',now());
end; $$;

revoke all on function public.ack_sync_queue_watermark(text,text,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz) from public, anon;
grant execute on function public.ack_sync_queue_watermark(text,text,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.ack_sync_queue_watermark_v2(
  p_client_id text, p_domain text, p_open_count integer default 0,
  p_pending_count integer default 0, p_retry_count integer default 0,
  p_processing_count integer default 0, p_failed_count integer default 0,
  p_conflict_count integer default 0, p_oldest_open_at timestamptz default null,
  p_newest_open_at timestamptz default null, p_replay_policy_version text default null,
  p_replay_horizon_days integer default null, p_replayable_failed_conflict_count integer default 0,
  p_expired_failed_conflict_count integer default 0, p_oldest_replayable_at timestamptz default null,
  p_latest_replay_deadline_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid(); v_client_id text := btrim(coalesce(p_client_id,'')); v_domain text := btrim(coalesce(p_domain,''));
  v_open integer := greatest(0,coalesce(p_open_count,0)); v_pending integer := greatest(0,coalesce(p_pending_count,0));
  v_retry integer := greatest(0,coalesce(p_retry_count,0)); v_processing integer := greatest(0,coalesce(p_processing_count,0));
  v_failed integer := greatest(0,coalesce(p_failed_count,0)); v_conflict integer := greatest(0,coalesce(p_conflict_count,0));
  v_replayable integer := greatest(0,coalesce(p_replayable_failed_conflict_count,0)); v_expired integer := greatest(0,coalesce(p_expired_failed_conflict_count,0));
  v_oldest timestamptz := p_oldest_open_at; v_newest timestamptz := p_newest_open_at;
begin
  if v_uid is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if length(v_client_id) < 12 or length(v_client_id) > 128 then raise exception 'SYNC_QUEUE_WATERMARK_CLIENT_ID_INVALID'; end if;
  if v_domain not in ('installation_execution','sea_vibe') then raise exception 'SYNC_QUEUE_WATERMARK_DOMAIN_INVALID'; end if;
  if p_replay_policy_version <> 'r38-90d-v1' or coalesce(p_replay_horizon_days,0) <> 90 then raise exception 'SYNC_QUEUE_REPLAY_POLICY_INVALID'; end if;
  if v_open <> v_pending + v_retry + v_processing + v_failed + v_conflict then raise exception 'SYNC_QUEUE_WATERMARK_COUNT_MISMATCH'; end if;
  if v_replayable + v_expired > v_failed + v_conflict then raise exception 'SYNC_QUEUE_REPLAY_COUNT_INVALID'; end if;
  if v_open=0 then v_oldest:=null; v_newest:=null;
  elsif v_oldest is null or v_newest is null then raise exception 'SYNC_QUEUE_WATERMARK_RANGE_REQUIRED';
  elsif v_oldest>v_newest then raise exception 'SYNC_QUEUE_WATERMARK_RANGE_INVALID'; end if;
  if v_oldest is not null and v_oldest > now()+interval '10 minutes' then v_oldest:=now(); end if;
  if v_newest is not null and v_newest > now()+interval '10 minutes' then v_newest:=now(); end if;
  insert into public.sync_queue_client_watermarks(
    user_id,client_id,domain,open_count,pending_count,retry_count,processing_count,failed_count,conflict_count,
    oldest_open_at,newest_open_at,first_seen_at,last_seen_at,updated_at,replay_policy_version,replay_horizon_days,
    replayable_failed_conflict_count,expired_failed_conflict_count,oldest_replayable_at,latest_replay_deadline_at
  ) values (
    v_uid,v_client_id,v_domain,v_open,v_pending,v_retry,v_processing,v_failed,v_conflict,v_oldest,v_newest,now(),now(),now(),
    p_replay_policy_version,p_replay_horizon_days,v_replayable,v_expired,p_oldest_replayable_at,p_latest_replay_deadline_at
  ) on conflict(user_id,client_id,domain) do update set
    open_count=excluded.open_count,pending_count=excluded.pending_count,retry_count=excluded.retry_count,processing_count=excluded.processing_count,
    failed_count=excluded.failed_count,conflict_count=excluded.conflict_count,oldest_open_at=excluded.oldest_open_at,newest_open_at=excluded.newest_open_at,
    last_seen_at=now(),updated_at=now(),replay_policy_version=excluded.replay_policy_version,replay_horizon_days=excluded.replay_horizon_days,
    replayable_failed_conflict_count=excluded.replayable_failed_conflict_count,expired_failed_conflict_count=excluded.expired_failed_conflict_count,
    oldest_replayable_at=excluded.oldest_replayable_at,latest_replay_deadline_at=excluded.latest_replay_deadline_at;
  return jsonb_build_object('ok',true,'domain',v_domain,'openCount',v_open,'boundedReplayPolicy',true,'replayHorizonDays',90,'acknowledgedAt',now());
end; $$;

revoke all on function public.ack_sync_queue_watermark_v2(text,text,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz,text,integer,integer,integer,timestamptz,timestamptz) from public, anon;
grant execute on function public.ack_sync_queue_watermark_v2(text,text,integer,integer,integer,integer,integer,integer,timestamptz,timestamptz,text,integer,integer,integer,timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.get_sync_retention_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_observation_started timestamptz;
  v_observation_days integer := 0;
  v_required_observation_days integer := 60;
  v_observation_satisfied boolean := false;

  v_tombstone_total bigint := 0;
  v_tombstone_oldest timestamptz;
  v_tombstone_older_60 bigint := 0;
  v_tombstone_eligible bigint := 0;
  v_crm_active_clients bigint := 0;
  v_crm_watermark_rows bigint := 0;

  v_execution_rows bigint := 0;
  v_execution_oldest timestamptz;
  v_execution_newest timestamptz;
  v_financial_rows bigint := 0;
  v_financial_oldest timestamptz;
  v_financial_newest timestamptz;
  v_sea_rows bigint := 0;
  v_sea_oldest timestamptz;
  v_sea_newest timestamptz;

  v_exec_active_clients bigint := 0;
  v_exec_open_clients bigint := 0;
  v_exec_open bigint := 0;
  v_exec_pending bigint := 0;
  v_exec_retry bigint := 0;
  v_exec_processing bigint := 0;
  v_exec_failed bigint := 0;
  v_exec_conflict bigint := 0;
  v_exec_oldest_open timestamptz;
  v_exec_newest_open timestamptz;
  v_exec_last_seen timestamptz;

  v_sea_active_clients bigint := 0;
  v_sea_open_clients bigint := 0;
  v_sea_open bigint := 0;
  v_sea_pending bigint := 0;
  v_sea_retry bigint := 0;
  v_sea_processing bigint := 0;
  v_sea_failed bigint := 0;
  v_sea_conflict bigint := 0;
  v_sea_oldest_open timestamptz;
  v_sea_newest_open timestamptz;
  v_sea_last_seen timestamptz;

  v_observed_oldest_open timestamptz;
  v_observed_oldest_open_age_days integer;
  v_exec_blockers jsonb := '[]'::jsonb;
  v_sea_blockers jsonb := '[]'::jsonb;
  v_financial_blockers jsonb := '[]'::jsonb;
  v_overall_blockers jsonb := '[]'::jsonb;
  v_replay_policy_version text := 'r38-90d-v1';
  v_replay_horizon_days integer := 90;
  v_replay_safety_buffer_days integer := 30;
  v_candidate_retention_days integer := 120;
  v_exec_policy_clients bigint := 0;
  v_exec_unbounded_clients bigint := 0;
  v_exec_replayable_failed_conflict bigint := 0;
  v_exec_expired_failed_conflict bigint := 0;
  v_exec_oldest_replayable timestamptz;
  v_exec_latest_replay_deadline timestamptz;
  v_sea_policy_clients bigint := 0;
  v_sea_unbounded_clients bigint := 0;
  v_sea_replayable_failed_conflict bigint := 0;
  v_sea_expired_failed_conflict bigint := 0;
  v_sea_oldest_replayable timestamptz;
  v_sea_latest_replay_deadline timestamptz;
  v_exec_policy_observed boolean := false;
  v_sea_policy_observed boolean := false;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  select min(first_seen_at)
    into v_observation_started
    from public.sync_queue_client_watermarks;

  if v_observation_started is not null then
    v_observation_days := greatest(0, floor(extract(epoch from (v_now - v_observation_started)) / 86400)::integer);
    v_observation_satisfied := v_observation_started <= v_now - make_interval(days => v_required_observation_days);
  end if;

  select count(*), min(deleted_at)
    into v_tombstone_total, v_tombstone_oldest
    from public.crm_sync_tombstones;

  select count(*)
    into v_tombstone_older_60
    from public.crm_sync_tombstones
   where deleted_at < v_now - interval '60 days';

  select count(*)
    into v_tombstone_eligible
    from public.crm_sync_tombstones t
   where t.deleted_at < v_now - interval '60 days'
     and not exists (
       select 1
         from public.sync_client_watermarks w
        where w.entity=t.entity
          and w.last_seen_at >= v_now - interval '45 days'
          and greatest(
                coalesce(w.cursor_at,'epoch'::timestamptz),
                coalesce(w.last_full_sync_at,'epoch'::timestamptz)
              ) < t.deleted_at
     );

  select count(distinct (user_id,client_id)), count(*)
    into v_crm_active_clients, v_crm_watermark_rows
    from public.sync_client_watermarks
   where last_seen_at >= v_now - interval '45 days';

  select count(*), min(created_at), max(created_at)
    into v_execution_rows, v_execution_oldest, v_execution_newest
    from public.installation_execution_sync_operations;
  select count(*), min(created_at), max(created_at)
    into v_financial_rows, v_financial_oldest, v_financial_newest
    from public.installation_financial_operations;
  select count(*), min(created_at), max(created_at)
    into v_sea_rows, v_sea_oldest, v_sea_newest
    from public.sea_vibe_sync_operations;

  select
    count(distinct (user_id,client_id)),
    count(distinct (user_id,client_id)) filter (where open_count > 0),
    coalesce(sum(open_count),0),
    coalesce(sum(pending_count),0),
    coalesce(sum(retry_count),0),
    coalesce(sum(processing_count),0),
    coalesce(sum(failed_count),0),
    coalesce(sum(conflict_count),0),
    min(oldest_open_at) filter (where open_count > 0),
    max(newest_open_at) filter (where open_count > 0),
    max(last_seen_at)
  into
    v_exec_active_clients, v_exec_open_clients, v_exec_open,
    v_exec_pending, v_exec_retry, v_exec_processing, v_exec_failed, v_exec_conflict,
    v_exec_oldest_open, v_exec_newest_open, v_exec_last_seen
  from public.sync_queue_client_watermarks
  where domain='installation_execution'
    and last_seen_at >= v_now - interval '45 days';

  select
    count(distinct (user_id,client_id)),
    count(distinct (user_id,client_id)) filter (where open_count > 0),
    coalesce(sum(open_count),0),
    coalesce(sum(pending_count),0),
    coalesce(sum(retry_count),0),
    coalesce(sum(processing_count),0),
    coalesce(sum(failed_count),0),
    coalesce(sum(conflict_count),0),
    min(oldest_open_at) filter (where open_count > 0),
    max(newest_open_at) filter (where open_count > 0),
    max(last_seen_at)
  into
    v_sea_active_clients, v_sea_open_clients, v_sea_open,
    v_sea_pending, v_sea_retry, v_sea_processing, v_sea_failed, v_sea_conflict,
    v_sea_oldest_open, v_sea_newest_open, v_sea_last_seen
  from public.sync_queue_client_watermarks
  where domain='sea_vibe'
    and last_seen_at >= v_now - interval '45 days';

  select
    count(distinct (user_id,client_id)) filter (where replay_policy_version=v_replay_policy_version and replay_horizon_days=v_replay_horizon_days),
    count(distinct (user_id,client_id)) filter (where coalesce(replay_policy_version,'')<>v_replay_policy_version or coalesce(replay_horizon_days,0)<>v_replay_horizon_days),
    coalesce(sum(replayable_failed_conflict_count),0),
    coalesce(sum(expired_failed_conflict_count),0),
    min(oldest_replayable_at),
    max(latest_replay_deadline_at)
  into
    v_exec_policy_clients, v_exec_unbounded_clients, v_exec_replayable_failed_conflict,
    v_exec_expired_failed_conflict, v_exec_oldest_replayable, v_exec_latest_replay_deadline
  from public.sync_queue_client_watermarks
  where domain='installation_execution' and last_seen_at >= v_now - interval '45 days';

  select
    count(distinct (user_id,client_id)) filter (where replay_policy_version=v_replay_policy_version and replay_horizon_days=v_replay_horizon_days),
    count(distinct (user_id,client_id)) filter (where coalesce(replay_policy_version,'')<>v_replay_policy_version or coalesce(replay_horizon_days,0)<>v_replay_horizon_days),
    coalesce(sum(replayable_failed_conflict_count),0),
    coalesce(sum(expired_failed_conflict_count),0),
    min(oldest_replayable_at),
    max(latest_replay_deadline_at)
  into
    v_sea_policy_clients, v_sea_unbounded_clients, v_sea_replayable_failed_conflict,
    v_sea_expired_failed_conflict, v_sea_oldest_replayable, v_sea_latest_replay_deadline
  from public.sync_queue_client_watermarks
  where domain='sea_vibe' and last_seen_at >= v_now - interval '45 days';

  v_exec_policy_observed := v_exec_active_clients > 0 and v_exec_unbounded_clients = 0 and v_exec_policy_clients = v_exec_active_clients;
  v_sea_policy_observed := v_sea_active_clients > 0 and v_sea_unbounded_clients = 0 and v_sea_policy_clients = v_sea_active_clients;

  if v_exec_oldest_open is null then
    v_observed_oldest_open := v_sea_oldest_open;
  elsif v_sea_oldest_open is null then
    v_observed_oldest_open := v_exec_oldest_open;
  else
    v_observed_oldest_open := least(v_exec_oldest_open, v_sea_oldest_open);
  end if;

  if v_observed_oldest_open is not null then
    v_observed_oldest_open_age_days := greatest(0, floor(extract(epoch from (v_now - v_observed_oldest_open)) / 86400)::integer);
  end if;

  -- R38 defines a client-side 90-day replay horizon, but ledger pruning remains disabled.
  -- Server-side enforcement for stale pre-R38 clients is a separate cutover gate before any ledger DELETE can be enabled.
  if not v_observation_satisfied then
    v_exec_blockers := v_exec_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
    v_sea_blockers := v_sea_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
    v_financial_blockers := v_financial_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
  end if;
  if not v_exec_policy_observed then
    v_exec_blockers := v_exec_blockers || jsonb_build_array('REPLAY_POLICY_ROLLOUT_INCOMPLETE');
  end if;
  if not v_sea_policy_observed then
    v_sea_blockers := v_sea_blockers || jsonb_build_array('REPLAY_POLICY_ROLLOUT_INCOMPLETE');
  end if;
  v_exec_blockers := v_exec_blockers || jsonb_build_array('SERVER_REPLAY_ENFORCEMENT_PENDING');
  v_sea_blockers := v_sea_blockers || jsonb_build_array('SERVER_REPLAY_ENFORCEMENT_PENDING');
  v_financial_blockers := v_financial_blockers || jsonb_build_array('FINANCIAL_RETRY_HORIZON_UNBOUNDED');

  v_overall_blockers := jsonb_build_array(
    'LEDGER_PRUNING_REMAINS_DISABLED',
    'SERVER_REPLAY_ENFORCEMENT_PENDING',
    'FINANCIAL_RETRY_POLICY_REQUIRED'
  );
  if not v_observation_satisfied then
    v_overall_blockers := v_overall_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
  end if;
  if not (v_exec_policy_observed and v_sea_policy_observed) then
    v_overall_blockers := v_overall_blockers || jsonb_build_array('REPLAY_POLICY_ROLLOUT_INCOMPLETE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'serverTime', v_now,
    'pruningEnabled', false,
    'readinessReason', 'REPLAY_HORIZON_DEFINED_PRUNING_STILL_HOLD',
    'observationStartedAt', v_observation_started,
    'retentionPolicy', jsonb_build_object(
      'crmTombstoneMinimumDays', 60,
      'activeClientWindowDays', 45,
      'watermarkRetentionDays', 180,
      'queueWatermarkRetentionDays', 180,
      'ledgerPruningEnabled', false
    ),
    'decisionGate', jsonb_build_object(
      'status', 'HOLD',
      'pruningEnabled', false,
      'requiredObservationDays', v_required_observation_days,
      'observationDays', v_observation_days,
      'observationWindowSatisfied', v_observation_satisfied,
      'queueReplayHorizonBounded', true,
      'queueReplayHorizonDays', v_replay_horizon_days,
      'queueReplaySafetyBufferDays', v_replay_safety_buffer_days,
      'financialRetryHorizonBounded', false,
      'observedOldestOpenOperationAt', v_observed_oldest_open,
      'observedOldestOpenAgeDays', v_observed_oldest_open_age_days,
      'candidateRetentionDays', v_candidate_retention_days,
      'nextDecisionRequired', 'ENFORCE_REPLAY_POLICY_SERVER_SIDE',
      'blockers', v_overall_blockers,
      'domains', jsonb_build_object(
        'installationExecution', jsonb_build_object(
          'status', 'HOLD',
          'queueBacked', true,
          'replayHorizonBounded', true,
          'replayHorizonDays', v_replay_horizon_days,
          'candidateRetentionDays', v_candidate_retention_days,
          'replayPolicyVersion', v_replay_policy_version,
          'replayPolicyObserved', v_exec_policy_observed,
          'activePolicyClients', v_exec_policy_clients,
          'unboundedActiveClients', v_exec_unbounded_clients,
          'replayableFailedOrConflict', v_exec_replayable_failed_conflict,
          'expiredFailedOrConflict', v_exec_expired_failed_conflict,
          'oldestReplayableAt', v_exec_oldest_replayable,
          'latestReplayDeadlineAt', v_exec_latest_replay_deadline,
          'openOperations', v_exec_open,
          'failedOrConflict', v_exec_failed + v_exec_conflict,
          'oldestOpenAt', v_exec_oldest_open,
          'blockers', v_exec_blockers
        ),
        'seaVibe', jsonb_build_object(
          'status', 'HOLD',
          'queueBacked', true,
          'replayHorizonBounded', true,
          'replayHorizonDays', v_replay_horizon_days,
          'candidateRetentionDays', v_candidate_retention_days,
          'replayPolicyVersion', v_replay_policy_version,
          'replayPolicyObserved', v_sea_policy_observed,
          'activePolicyClients', v_sea_policy_clients,
          'unboundedActiveClients', v_sea_unbounded_clients,
          'replayableFailedOrConflict', v_sea_replayable_failed_conflict,
          'expiredFailedOrConflict', v_sea_expired_failed_conflict,
          'oldestReplayableAt', v_sea_oldest_replayable,
          'latestReplayDeadlineAt', v_sea_latest_replay_deadline,
          'openOperations', v_sea_open,
          'failedOrConflict', v_sea_failed + v_sea_conflict,
          'oldestOpenAt', v_sea_oldest_open,
          'blockers', v_sea_blockers
        ),
        'installationFinancial', jsonb_build_object(
          'status', 'HOLD',
          'queueBacked', false,
          'replayHorizonBounded', false,
          'openOperations', null,
          'failedOrConflict', null,
          'oldestOpenAt', null,
          'blockers', v_financial_blockers
        )
      )
    ),
    'queueDomains', jsonb_build_object(
      'installationExecution', jsonb_build_object(
        'activeClients', v_exec_active_clients,
        'clientsWithOpenOperations', v_exec_open_clients,
        'openOperations', v_exec_open,
        'pending', v_exec_pending,
        'retry', v_exec_retry,
        'processing', v_exec_processing,
        'failed', v_exec_failed,
        'conflict', v_exec_conflict,
        'oldestOpenAt', v_exec_oldest_open,
        'newestOpenAt', v_exec_newest_open,
        'lastSeenAt', v_exec_last_seen,
        'replayPolicyVersion', v_replay_policy_version,
        'replayHorizonDays', v_replay_horizon_days,
        'replayPolicyObserved', v_exec_policy_observed,
        'activePolicyClients', v_exec_policy_clients,
        'unboundedActiveClients', v_exec_unbounded_clients,
        'replayableFailedOrConflict', v_exec_replayable_failed_conflict,
        'expiredFailedOrConflict', v_exec_expired_failed_conflict,
        'oldestReplayableAt', v_exec_oldest_replayable,
        'latestReplayDeadlineAt', v_exec_latest_replay_deadline
      ),
      'seaVibe', jsonb_build_object(
        'activeClients', v_sea_active_clients,
        'clientsWithOpenOperations', v_sea_open_clients,
        'openOperations', v_sea_open,
        'pending', v_sea_pending,
        'retry', v_sea_retry,
        'processing', v_sea_processing,
        'failed', v_sea_failed,
        'conflict', v_sea_conflict,
        'oldestOpenAt', v_sea_oldest_open,
        'newestOpenAt', v_sea_newest_open,
        'lastSeenAt', v_sea_last_seen,
        'replayPolicyVersion', v_replay_policy_version,
        'replayHorizonDays', v_replay_horizon_days,
        'replayPolicyObserved', v_sea_policy_observed,
        'activePolicyClients', v_sea_policy_clients,
        'unboundedActiveClients', v_sea_unbounded_clients,
        'replayableFailedOrConflict', v_sea_replayable_failed_conflict,
        'expiredFailedOrConflict', v_sea_expired_failed_conflict,
        'oldestReplayableAt', v_sea_oldest_replayable,
        'latestReplayDeadlineAt', v_sea_latest_replay_deadline
      )
    ),
    'crmRetention', jsonb_build_object(
      'activeClients', v_crm_active_clients,
      'activeWatermarkRows', v_crm_watermark_rows,
      'tombstones', v_tombstone_total,
      'oldestTombstoneAt', v_tombstone_oldest,
      'olderThanMinimumRetention', v_tombstone_older_60,
      'eligibleForNextMaintenance', v_tombstone_eligible,
      'blockedByActiveClients', greatest(0, v_tombstone_older_60 - v_tombstone_eligible),
      'entities', jsonb_build_object(
        'customers', (
          select jsonb_build_object(
            'activeClients', count(distinct (user_id,client_id)),
            'watermarkRows', count(*),
            'oldestCursorAt', min(cursor_at),
            'oldestFullSyncAt', min(last_full_sync_at),
            'lastSeenAt', max(last_seen_at)
          ) from public.sync_client_watermarks
          where entity='customers' and last_seen_at >= v_now - interval '45 days'
        ),
        'followups', (
          select jsonb_build_object(
            'activeClients', count(distinct (user_id,client_id)),
            'watermarkRows', count(*),
            'oldestCursorAt', min(cursor_at),
            'oldestFullSyncAt', min(last_full_sync_at),
            'lastSeenAt', max(last_seen_at)
          ) from public.sync_client_watermarks
          where entity='followups' and last_seen_at >= v_now - interval '45 days'
        ),
        'quotations', (
          select jsonb_build_object(
            'activeClients', count(distinct (user_id,client_id)),
            'watermarkRows', count(*),
            'oldestCursorAt', min(cursor_at),
            'oldestFullSyncAt', min(last_full_sync_at),
            'lastSeenAt', max(last_seen_at)
          ) from public.sync_client_watermarks
          where entity='quotations' and last_seen_at >= v_now - interval '45 days'
        )
      )
    ),
    'ledgers', jsonb_build_object(
      'installationExecution', jsonb_build_object(
        'rows', v_execution_rows,
        'oldestAt', v_execution_oldest,
        'newestAt', v_execution_newest,
        'queueBacked', true,
        'prune', false
      ),
      'installationFinancial', jsonb_build_object(
        'rows', v_financial_rows,
        'oldestAt', v_financial_oldest,
        'newestAt', v_financial_newest,
        'queueBacked', false,
        'prune', false
      ),
      'seaVibe', jsonb_build_object(
        'rows', v_sea_rows,
        'oldestAt', v_sea_oldest,
        'newestAt', v_sea_newest,
        'queueBacked', true,
        'prune', false
      )
    )
  );
end;
$$;

revoke all on function public.get_sync_retention_observability_snapshot() from public, anon, authenticated;
grant execute on function public.get_sync_retention_observability_snapshot() to authenticated, service_role;

comment on function public.get_sync_retention_observability_snapshot() is
  'R38 super-admin retention decision gate. Queue replay horizon is fixed at 90 days client-side, rollout/server enforcement are measured, and ledger pruning stays disabled.';


commit;

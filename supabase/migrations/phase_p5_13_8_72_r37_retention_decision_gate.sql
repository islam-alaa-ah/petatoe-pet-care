-- PETATOE P5.13.8.72 R37 — Production retention decision gate
-- Safety model:
--   * Read-only decision support only. No idempotency ledger rows are deleted or mutated.
--   * A finite retention policy cannot be declared safe while manual failed/conflict replay is unbounded.
--   * Production observation age is measured, but observation alone never enables pruning.
--   * No user IDs, client IDs, payloads, operation keys, scope IDs, or financial values are returned.

begin;

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

  -- Observation is evidence, not permission to prune. Failed/conflict replay remains unbounded by product policy.
  if not v_observation_satisfied then
    v_exec_blockers := v_exec_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
    v_sea_blockers := v_sea_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
    v_financial_blockers := v_financial_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
  end if;
  v_exec_blockers := v_exec_blockers || jsonb_build_array('QUEUE_REPLAY_HORIZON_UNBOUNDED');
  v_sea_blockers := v_sea_blockers || jsonb_build_array('QUEUE_REPLAY_HORIZON_UNBOUNDED');
  v_financial_blockers := v_financial_blockers || jsonb_build_array('FINANCIAL_RETRY_HORIZON_UNBOUNDED');

  if v_exec_failed + v_exec_conflict > 0 then
    v_exec_blockers := v_exec_blockers || jsonb_build_array('OPEN_FAILED_OR_CONFLICT_OPERATIONS');
  end if;
  if v_sea_failed + v_sea_conflict > 0 then
    v_sea_blockers := v_sea_blockers || jsonb_build_array('OPEN_FAILED_OR_CONFLICT_OPERATIONS');
  end if;

  v_overall_blockers := jsonb_build_array(
    'REPLAY_POLICY_DECISION_REQUIRED',
    'LEDGER_PRUNING_REMAINS_DISABLED'
  );
  if not v_observation_satisfied then
    v_overall_blockers := v_overall_blockers || jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'serverTime', v_now,
    'pruningEnabled', false,
    'readinessReason', 'RETENTION_DECISION_GATE_HOLD',
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
      'queueReplayHorizonBounded', false,
      'financialRetryHorizonBounded', false,
      'observedOldestOpenOperationAt', v_observed_oldest_open,
      'observedOldestOpenAgeDays', v_observed_oldest_open_age_days,
      'candidateRetentionDays', null,
      'nextDecisionRequired', 'DEFINE_MAX_REPLAY_AGE_POLICY',
      'blockers', v_overall_blockers,
      'domains', jsonb_build_object(
        'installationExecution', jsonb_build_object(
          'status', 'HOLD',
          'queueBacked', true,
          'replayHorizonBounded', false,
          'openOperations', v_exec_open,
          'failedOrConflict', v_exec_failed + v_exec_conflict,
          'oldestOpenAt', v_exec_oldest_open,
          'blockers', v_exec_blockers
        ),
        'seaVibe', jsonb_build_object(
          'status', 'HOLD',
          'queueBacked', true,
          'replayHorizonBounded', false,
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
        'lastSeenAt', v_exec_last_seen
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
        'lastSeenAt', v_sea_last_seen
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
  'R37 super-admin read-only production retention decision gate. Observation is measured, replay horizon remains unbounded, and ledger pruning stays disabled.';

commit;

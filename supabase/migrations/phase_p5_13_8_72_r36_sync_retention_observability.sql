-- PETATOE P5.13.8.72 R36 — Sync health & retention observability
-- Read-only super-admin observability over the retention/watermark contracts introduced in R34/R35.
-- Safety model:
--   * No rows are deleted or mutated by this RPC.
--   * No user IDs, client IDs, payloads, operation keys, or financial values are returned.
--   * Ledger pruning remains explicitly disabled.

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

  return jsonb_build_object(
    'ok', true,
    'serverTime', v_now,
    'pruningEnabled', false,
    'readinessReason', 'QUEUE_REPLAY_HORIZON_NOT_YET_BOUNDED',
    'observationStartedAt', v_observation_started,
    'retentionPolicy', jsonb_build_object(
      'crmTombstoneMinimumDays', 60,
      'activeClientWindowDays', 45,
      'watermarkRetentionDays', 180,
      'queueWatermarkRetentionDays', 180,
      'ledgerPruningEnabled', false
    ),
    'queueDomains', jsonb_build_object(
      'installationExecution', (
        select jsonb_build_object(
          'activeClients', count(distinct (user_id,client_id)),
          'clientsWithOpenOperations', count(distinct (user_id,client_id)) filter (where open_count > 0),
          'openOperations', coalesce(sum(open_count),0),
          'pending', coalesce(sum(pending_count),0),
          'retry', coalesce(sum(retry_count),0),
          'processing', coalesce(sum(processing_count),0),
          'failed', coalesce(sum(failed_count),0),
          'conflict', coalesce(sum(conflict_count),0),
          'oldestOpenAt', min(oldest_open_at) filter (where open_count > 0),
          'newestOpenAt', max(newest_open_at) filter (where open_count > 0),
          'lastSeenAt', max(last_seen_at)
        )
        from public.sync_queue_client_watermarks
        where domain='installation_execution'
          and last_seen_at >= v_now - interval '45 days'
      ),
      'seaVibe', (
        select jsonb_build_object(
          'activeClients', count(distinct (user_id,client_id)),
          'clientsWithOpenOperations', count(distinct (user_id,client_id)) filter (where open_count > 0),
          'openOperations', coalesce(sum(open_count),0),
          'pending', coalesce(sum(pending_count),0),
          'retry', coalesce(sum(retry_count),0),
          'processing', coalesce(sum(processing_count),0),
          'failed', coalesce(sum(failed_count),0),
          'conflict', coalesce(sum(conflict_count),0),
          'oldestOpenAt', min(oldest_open_at) filter (where open_count > 0),
          'newestOpenAt', max(newest_open_at) filter (where open_count > 0),
          'lastSeenAt', max(last_seen_at)
        )
        from public.sync_queue_client_watermarks
        where domain='sea_vibe'
          and last_seen_at >= v_now - interval '45 days'
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
  'R36 super-admin read-only sync/retention observability. Returns aggregate counts/timestamps only and never prunes ledgers.';

commit;

-- P5.13.8.72 R42 — S17 Execution Replay Guard Backfill
-- Scope:
--   * Backfill missing compact/server replay guards for historical Execution ledger rows.
--   * Give every backfilled row a fresh conservative 90-day replay grace from this migration run.
--   * Never overwrite or extend an existing guard.
--   * Keep ledger pruning disabled and Production Decision Gate on HOLD.
--   * Execute NO DELETE against any idempotency ledger or replay-guard table.
begin;

-- Extend source-mode vocabulary so historical backfill rows are explicitly distinguishable
-- from real v2 replay anchors and the bounded legacy-v1 compatibility grace.
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid='public.sync_replay_server_guards'::regclass
    and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%source_mode%'
  order by c.oid
  limit 1;

  if v_constraint is not null then
    execute format('alter table public.sync_replay_server_guards drop constraint %I',v_constraint);
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.sync_replay_server_guards'::regclass
      and conname='sync_replay_server_guards_source_mode_r42_check'
  ) then
    alter table public.sync_replay_server_guards
      add constraint sync_replay_server_guards_source_mode_r42_check
      check (source_mode in ('v2_anchor','legacy_v1_grace','r42_backfill_grace'));
  end if;
end $$;

-- Missing-only, idempotent backfill. We deliberately DO NOT derive the replay anchor from
-- historical applied_at/created_at because that could make old rows immediately eligible
-- for future pruning. Every newly backfilled row receives a fresh server-side grace window.
do $$
declare
  v_policy public.sync_replay_server_policy%rowtype;
  v_anchor timestamptz:=now();
  v_inserted bigint:=0;
begin
  select * into v_policy
  from public.sync_replay_server_policy
  where policy_key='execution_sea_vibe'
  for update;

  if not found then
    raise exception 'SYNC_REPLAY_SERVER_POLICY_MISSING';
  end if;
  if v_policy.pruning_enabled then
    raise exception 'EXECUTION_REPLAY_BACKFILL_REQUIRES_PRUNING_DISABLED';
  end if;
  if v_policy.replay_horizon_days<>90 then
    raise exception 'EXECUTION_REPLAY_BACKFILL_POLICY_UNEXPECTED';
  end if;

  insert into public.sync_replay_server_guards(
    user_id,domain,operation_key,policy_version,source_mode,
    replay_anchor_at,replay_expires_at,first_seen_at,last_seen_at
  )
  select
    l.user_id,
    'installation_execution',
    l.operation_key,
    v_policy.policy_version,
    'r42_backfill_grace',
    v_anchor,
    v_anchor + make_interval(days=>v_policy.replay_horizon_days),
    v_anchor,
    v_anchor
  from public.installation_execution_sync_operations l
  where not exists(
    select 1
    from public.sync_replay_server_guards g
    where g.user_id=l.user_id
      and g.domain='installation_execution'
      and g.operation_key=l.operation_key
  )
  on conflict(user_id,domain,operation_key) do nothing;

  get diagnostics v_inserted=row_count;
  raise notice 'R42 execution replay guard backfill inserted % rows',v_inserted;
end $$;

-- Read-only verification surface for operations/support. Super-admin only.
create or replace function public.get_execution_replay_guard_backfill_status_r42()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_policy public.sync_replay_server_policy%rowtype;
  v_total bigint:=0;
  v_guarded bigint:=0;
  v_backfilled bigint:=0;
  v_unprotected bigint:=0;
  v_backfill_min_expiry timestamptz;
  v_backfill_max_expiry timestamptz;
begin
  if v_uid is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  select * into v_policy
  from public.sync_replay_server_policy
  where policy_key='execution_sea_vibe';
  if not found then raise exception 'SYNC_REPLAY_SERVER_POLICY_MISSING'; end if;

  select count(*) into v_total
  from public.installation_execution_sync_operations;

  select count(*) into v_guarded
  from public.installation_execution_sync_operations l
  join public.sync_replay_server_guards g
    on g.user_id=l.user_id
   and g.domain='installation_execution'
   and g.operation_key=l.operation_key
   and g.policy_version=v_policy.policy_version;

  select count(*),min(g.replay_expires_at),max(g.replay_expires_at)
    into v_backfilled,v_backfill_min_expiry,v_backfill_max_expiry
  from public.sync_replay_server_guards g
  where g.domain='installation_execution'
    and g.policy_version=v_policy.policy_version
    and g.source_mode='r42_backfill_grace';

  v_unprotected:=greatest(v_total-v_guarded,0);

  return jsonb_build_object(
    'ok',true,
    'serverTime',now(),
    'ledger','installation_execution_sync_operations',
    'policyVersion',v_policy.policy_version,
    'replayHorizonDays',v_policy.replay_horizon_days,
    'safetyBufferDays',v_policy.safety_buffer_days,
    'totalRows',v_total,
    'guardedRows',v_guarded,
    'unprotectedRows',v_unprotected,
    'guardCoveragePercent',case when v_total=0 then 100 else round((v_guarded::numeric*100)/v_total,2) end,
    'r42BackfilledRows',v_backfilled,
    'backfillGraceExpiresAtMin',v_backfill_min_expiry,
    'backfillGraceExpiresAtMax',v_backfill_max_expiry,
    'pruningEnabled',false,
    'decision','HOLD'
  );
end;
$$;

revoke all on function public.get_execution_replay_guard_backfill_status_r42() from public,anon,authenticated;
grant execute on function public.get_execution_replay_guard_backfill_status_r42() to authenticated,service_role;

-- Preserve R41 observability as canonical input and add only backfill status metadata.
do $$
begin
  if to_regprocedure('public.get_sync_retention_observability_snapshot_core_r42()') is null
     and to_regprocedure('public.get_sync_retention_observability_snapshot()') is not null then
    execute 'alter function public.get_sync_retention_observability_snapshot() rename to get_sync_retention_observability_snapshot_core_r42';
  end if;
end $$;

revoke all on function public.get_sync_retention_observability_snapshot_core_r42() from public,anon,authenticated;

create or replace function public.get_sync_retention_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_base jsonb;
  v_backfill jsonb;
begin
  v_base:=public.get_sync_retention_observability_snapshot_core_r42();
  v_backfill:=public.get_execution_replay_guard_backfill_status_r42();

  v_base:=jsonb_set(v_base,'{executionReplayGuardBackfill}',v_backfill,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,executionHistoricalGuardBackfill}','"r42_backfill_grace"'::jsonb,true);

  -- R42 remains a protection/backfill phase only. Keep all delete switches fail-closed.
  v_base:=jsonb_set(v_base,'{pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,ledgerPruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,status}','"HOLD"'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.get_sync_retention_observability_snapshot() from public,anon,authenticated;
grant execute on function public.get_sync_retention_observability_snapshot() to authenticated,service_role;

comment on function public.get_execution_replay_guard_backfill_status_r42() is
  'R42 super-admin read-only verification for historical Execution replay-guard backfill coverage. Pruning remains disabled.';
comment on function public.get_sync_retention_observability_snapshot() is
  'R42 observability adds execution historical replay-guard backfill status while preserving R41 dry-run and HOLD/pruning-disabled state.';

notify pgrst,'reload schema';
commit;

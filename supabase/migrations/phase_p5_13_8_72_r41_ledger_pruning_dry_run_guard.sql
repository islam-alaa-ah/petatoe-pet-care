-- P5.13.8.72 R41 — S16 Ledger Pruning Dry-Run & Eligibility Guard
-- Scope:
--   * Read-only dry-run for Execution / Financial / SEA VIBE idempotency ledgers.
--   * Count only rows protected by a matching compact/server replay guard whose replay horizon
--     plus safety buffer has elapsed.
--   * Detect unprotected or mismatched rows and fail closed.
--   * Add a reusable server-side pruning eligibility guard for a future DELETE phase.
--   * NO idempotency-ledger DELETE is executed or enabled in R41.

begin;

-- Preserve the R40 observability function as the canonical input for this read-only phase.
do $$
begin
  if to_regprocedure('public.get_sync_retention_observability_snapshot_core_r41()') is null
     and to_regprocedure('public.get_sync_retention_observability_snapshot()') is not null then
    execute 'alter function public.get_sync_retention_observability_snapshot() rename to get_sync_retention_observability_snapshot_core_r41';
  end if;
end $$;

revoke all on function public.get_sync_retention_observability_snapshot_core_r41() from public,anon,authenticated;

create or replace function public.get_sync_ledger_pruning_dry_run()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_now timestamptz:=now();
  v_base jsonb;
  v_queue_policy public.sync_replay_server_policy%rowtype;
  v_fin_policy public.installation_financial_replay_policy%rowtype;
  v_gate_status text:='HOLD';
  v_gate_ready boolean:=false;
  v_pruning_enabled boolean:=false;
  v_legacy_grace_active boolean:=false;

  v_exec_total bigint:=0;
  v_exec_guarded bigint:=0;
  v_exec_unprotected bigint:=0;
  v_exec_policy_mismatch bigint:=0;
  v_exec_candidates bigint:=0;
  v_exec_oldest_candidate timestamptz;
  v_exec_newest_candidate timestamptz;

  v_sea_total bigint:=0;
  v_sea_guarded bigint:=0;
  v_sea_unprotected bigint:=0;
  v_sea_policy_mismatch bigint:=0;
  v_sea_candidates bigint:=0;
  v_sea_oldest_candidate timestamptz;
  v_sea_newest_candidate timestamptz;

  v_fin_total bigint:=0;
  v_fin_guarded bigint:=0;
  v_fin_unprotected bigint:=0;
  v_fin_guard_mismatch bigint:=0;
  v_fin_policy_mismatch bigint:=0;
  v_fin_candidates bigint:=0;
  v_fin_oldest_candidate timestamptz;
  v_fin_newest_candidate timestamptz;

  v_candidate_total bigint:=0;
  v_guard_gap_total bigint:=0;
  v_blockers jsonb:='[]'::jsonb;
  v_exec_blockers jsonb:='[]'::jsonb;
  v_sea_blockers jsonb:='[]'::jsonb;
  v_fin_blockers jsonb:='[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  v_base:=public.get_sync_retention_observability_snapshot_core_r41();
  v_gate_status:=coalesce(v_base#>>'{decisionGate,status}','HOLD');
  v_pruning_enabled:=coalesce((v_base#>>'{decisionGate,pruningEnabled}')::boolean,false)
    and coalesce((v_base#>>'{retentionPolicy,ledgerPruningEnabled}')::boolean,false)
    and coalesce((v_base->>'pruningEnabled')::boolean,false);
  v_gate_ready:=v_gate_status='READY';
  v_legacy_grace_active:=coalesce((v_base#>>'{decisionGate,legacyV1GraceActive}')::boolean,false);

  select * into v_queue_policy
  from public.sync_replay_server_policy
  where policy_key='execution_sea_vibe';
  if not found then
    raise exception 'SYNC_REPLAY_SERVER_POLICY_MISSING';
  end if;

  select * into v_fin_policy
  from public.installation_financial_replay_policy
  where policy_key='appointment_financial';
  if not found then
    raise exception 'FINANCIAL_REPLAY_POLICY_NOT_CONFIGURED';
  end if;

  -- Execution: a row is only a technical candidate if a matching R39 server guard exists,
  -- uses the active policy version, and replay expiry + the 30-day safety buffer has elapsed.
  select count(*) into v_exec_total
  from public.installation_execution_sync_operations;

  select count(*) into v_exec_guarded
  from public.installation_execution_sync_operations l
  join public.sync_replay_server_guards g
    on g.user_id=l.user_id
   and g.domain='installation_execution'
   and g.operation_key=l.operation_key;

  v_exec_unprotected:=greatest(v_exec_total-v_exec_guarded,0);

  select count(*) into v_exec_policy_mismatch
  from public.installation_execution_sync_operations l
  join public.sync_replay_server_guards g
    on g.user_id=l.user_id
   and g.domain='installation_execution'
   and g.operation_key=l.operation_key
  where g.policy_version<>v_queue_policy.policy_version;

  select count(*),min(l.created_at),max(l.created_at)
    into v_exec_candidates,v_exec_oldest_candidate,v_exec_newest_candidate
  from public.installation_execution_sync_operations l
  join public.sync_replay_server_guards g
    on g.user_id=l.user_id
   and g.domain='installation_execution'
   and g.operation_key=l.operation_key
  where g.policy_version=v_queue_policy.policy_version
    and g.replay_expires_at + make_interval(days=>v_queue_policy.safety_buffer_days) <= v_now;

  -- SEA VIBE uses the same queue replay policy and the same fail-closed guard coverage rule.
  select count(*) into v_sea_total
  from public.sea_vibe_sync_operations;

  select count(*) into v_sea_guarded
  from public.sea_vibe_sync_operations l
  join public.sync_replay_server_guards g
    on g.user_id=l.user_id
   and g.domain='sea_vibe'
   and g.operation_key=l.operation_key;

  v_sea_unprotected:=greatest(v_sea_total-v_sea_guarded,0);

  select count(*) into v_sea_policy_mismatch
  from public.sea_vibe_sync_operations l
  join public.sync_replay_server_guards g
    on g.user_id=l.user_id
   and g.domain='sea_vibe'
   and g.operation_key=l.operation_key
  where g.policy_version<>v_queue_policy.policy_version;

  select count(*),min(l.created_at),max(l.created_at)
    into v_sea_candidates,v_sea_oldest_candidate,v_sea_newest_candidate
  from public.sea_vibe_sync_operations l
  join public.sync_replay_server_guards g
    on g.user_id=l.user_id
   and g.domain='sea_vibe'
   and g.operation_key=l.operation_key
  where g.policy_version=v_queue_policy.policy_version
    and g.replay_expires_at + make_interval(days=>v_queue_policy.safety_buffer_days) <= v_now;

  -- Financial: R40 backfilled compact guards. Still verify operation type + payload hash so a
  -- malformed/mismatched guard can never make a heavy result row eligible.
  select count(*) into v_fin_total
  from public.installation_financial_operations;

  select count(*) into v_fin_guarded
  from public.installation_financial_operations l
  join public.installation_financial_replay_guards g
    on g.user_id=l.user_id
   and g.operation_key=l.operation_key;

  v_fin_unprotected:=greatest(v_fin_total-v_fin_guarded,0);

  select count(*) into v_fin_guard_mismatch
  from public.installation_financial_operations l
  join public.installation_financial_replay_guards g
    on g.user_id=l.user_id
   and g.operation_key=l.operation_key
  where g.operation_type<>l.operation_type
     or g.payload_hash<>l.payload_hash;

  select count(*) into v_fin_policy_mismatch
  from public.installation_financial_operations l
  join public.installation_financial_replay_guards g
    on g.user_id=l.user_id
   and g.operation_key=l.operation_key
  where g.policy_version<>v_fin_policy.policy_version;

  select count(*),min(l.created_at),max(l.created_at)
    into v_fin_candidates,v_fin_oldest_candidate,v_fin_newest_candidate
  from public.installation_financial_operations l
  join public.installation_financial_replay_guards g
    on g.user_id=l.user_id
   and g.operation_key=l.operation_key
  where g.operation_type=l.operation_type
    and g.payload_hash=l.payload_hash
    and g.policy_version=v_fin_policy.policy_version
    and g.replay_expires_at + make_interval(days=>v_fin_policy.safety_buffer_days) <= v_now;

  if v_exec_unprotected>0 then v_exec_blockers:=v_exec_blockers||jsonb_build_array('UNPROTECTED_LEDGER_ROWS'); end if;
  if v_exec_policy_mismatch>0 then v_exec_blockers:=v_exec_blockers||jsonb_build_array('REPLAY_GUARD_POLICY_MISMATCH'); end if;
  if v_sea_unprotected>0 then v_sea_blockers:=v_sea_blockers||jsonb_build_array('UNPROTECTED_LEDGER_ROWS'); end if;
  if v_sea_policy_mismatch>0 then v_sea_blockers:=v_sea_blockers||jsonb_build_array('REPLAY_GUARD_POLICY_MISMATCH'); end if;
  if v_fin_unprotected>0 then v_fin_blockers:=v_fin_blockers||jsonb_build_array('UNPROTECTED_LEDGER_ROWS'); end if;
  if v_fin_guard_mismatch>0 then v_fin_blockers:=v_fin_blockers||jsonb_build_array('REPLAY_GUARD_CONTENT_MISMATCH'); end if;
  if v_fin_policy_mismatch>0 then v_fin_blockers:=v_fin_blockers||jsonb_build_array('REPLAY_GUARD_POLICY_MISMATCH'); end if;

  if not v_gate_ready then v_blockers:=v_blockers||jsonb_build_array('DECISION_GATE_NOT_READY'); end if;
  if not v_pruning_enabled then v_blockers:=v_blockers||jsonb_build_array('LEDGER_PRUNING_DISABLED'); end if;
  if v_legacy_grace_active then v_blockers:=v_blockers||jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE'); end if;
  if v_exec_unprotected+v_sea_unprotected+v_fin_unprotected>0 then
    v_blockers:=v_blockers||jsonb_build_array('UNPROTECTED_LEDGER_ROWS');
  end if;
  if v_exec_policy_mismatch+v_sea_policy_mismatch+v_fin_policy_mismatch>0 then
    v_blockers:=v_blockers||jsonb_build_array('REPLAY_GUARD_POLICY_MISMATCH');
  end if;
  if v_fin_guard_mismatch>0 then v_blockers:=v_blockers||jsonb_build_array('REPLAY_GUARD_CONTENT_MISMATCH'); end if;

  v_candidate_total:=v_exec_candidates+v_sea_candidates+v_fin_candidates;
  v_guard_gap_total:=v_exec_unprotected+v_sea_unprotected+v_fin_unprotected;

  return jsonb_build_object(
    'ok',true,
    'serverTime',v_now,
    'mode','dry_run_only',
    'deleteExecuted',false,
    'pruningAllowedNow',false,
    'decisionGateStatus',v_gate_status,
    'decisionGateReady',v_gate_ready,
    'ledgerPruningEnabled',v_pruning_enabled,
    'legacyReplayGraceActive',v_legacy_grace_active,
    'technicalCandidateRows',v_candidate_total,
    'unprotectedRows',v_guard_gap_total,
    'blockers',v_blockers,
    'domains',jsonb_build_object(
      'installationExecution',jsonb_build_object(
        'ledger','installation_execution_sync_operations',
        'replayHorizonDays',v_queue_policy.replay_horizon_days,
        'safetyBufferDays',v_queue_policy.safety_buffer_days,
        'candidateRetentionDays',v_queue_policy.replay_horizon_days+v_queue_policy.safety_buffer_days,
        'totalRows',v_exec_total,
        'guardedRows',v_exec_guarded,
        'unprotectedRows',v_exec_unprotected,
        'policyMismatchRows',v_exec_policy_mismatch,
        'technicalCandidateRows',v_exec_candidates,
        'oldestCandidateAt',v_exec_oldest_candidate,
        'newestCandidateAt',v_exec_newest_candidate,
        'deleteAllowedNow',false,
        'blockers',v_exec_blockers
      ),
      'seaVibe',jsonb_build_object(
        'ledger','sea_vibe_sync_operations',
        'replayHorizonDays',v_queue_policy.replay_horizon_days,
        'safetyBufferDays',v_queue_policy.safety_buffer_days,
        'candidateRetentionDays',v_queue_policy.replay_horizon_days+v_queue_policy.safety_buffer_days,
        'totalRows',v_sea_total,
        'guardedRows',v_sea_guarded,
        'unprotectedRows',v_sea_unprotected,
        'policyMismatchRows',v_sea_policy_mismatch,
        'technicalCandidateRows',v_sea_candidates,
        'oldestCandidateAt',v_sea_oldest_candidate,
        'newestCandidateAt',v_sea_newest_candidate,
        'deleteAllowedNow',false,
        'blockers',v_sea_blockers
      ),
      'installationFinancial',jsonb_build_object(
        'ledger','installation_financial_operations',
        'replayHorizonDays',v_fin_policy.replay_horizon_days,
        'safetyBufferDays',v_fin_policy.safety_buffer_days,
        'candidateRetentionDays',v_fin_policy.replay_horizon_days+v_fin_policy.safety_buffer_days,
        'totalRows',v_fin_total,
        'guardedRows',v_fin_guarded,
        'unprotectedRows',v_fin_unprotected,
        'guardContentMismatchRows',v_fin_guard_mismatch,
        'policyMismatchRows',v_fin_policy_mismatch,
        'technicalCandidateRows',v_fin_candidates,
        'oldestCandidateAt',v_fin_oldest_candidate,
        'newestCandidateAt',v_fin_newest_candidate,
        'deleteAllowedNow',false,
        'blockers',v_fin_blockers
      )
    )
  );
end;
$$;

revoke all on function public.get_sync_ledger_pruning_dry_run() from public,anon,authenticated;
grant execute on function public.get_sync_ledger_pruning_dry_run() to authenticated,service_role;

-- Reusable fail-closed gate for a future pruning phase. R41 can never pass this guard because
-- all authoritative pruning flags remain false and the production decision gate remains HOLD.
create or replace function public.assert_sync_ledger_pruning_allowed_r41(p_domain text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_domain text:=lower(trim(coalesce(p_domain,'')));
  v_dry jsonb;
  v_domain_path text;
  v_unprotected bigint:=0;
  v_mismatch bigint:=0;
begin
  if v_uid is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if v_domain not in ('installation_execution','sea_vibe','installation_financial') then
    raise exception 'LEDGER_PRUNING_DOMAIN_INVALID';
  end if;

  v_dry:=public.get_sync_ledger_pruning_dry_run();
  if coalesce((v_dry->>'pruningAllowedNow')::boolean,false) is not true
     or coalesce((v_dry->>'ledgerPruningEnabled')::boolean,false) is not true
     or coalesce(v_dry->>'decisionGateStatus','HOLD')<>'READY' then
    raise exception 'LEDGER_PRUNING_GATE_NOT_READY';
  end if;

  v_domain_path:=case v_domain
    when 'installation_execution' then 'installationExecution'
    when 'sea_vibe' then 'seaVibe'
    else 'installationFinancial' end;

  v_unprotected:=coalesce((v_dry#>>array['domains',v_domain_path,'unprotectedRows'])::bigint,0);
  v_mismatch:=coalesce((v_dry#>>array['domains',v_domain_path,'policyMismatchRows'])::bigint,0)
    + coalesce((v_dry#>>array['domains',v_domain_path,'guardContentMismatchRows'])::bigint,0);
  if v_unprotected>0 then raise exception 'LEDGER_PRUNING_UNPROTECTED_ROWS'; end if;
  if v_mismatch>0 then raise exception 'LEDGER_PRUNING_GUARD_MISMATCH'; end if;

  return jsonb_build_object('ok',true,'domain',v_domain,'allowed',true);
end;
$$;

revoke all on function public.assert_sync_ledger_pruning_allowed_r41(text) from public,anon,authenticated;
-- Intentionally no authenticated EXECUTE grant. Future SECURITY DEFINER prune functions must call it internally.

create or replace function public.get_sync_retention_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_base jsonb;
  v_dry jsonb;
begin
  v_base:=public.get_sync_retention_observability_snapshot_core_r41();
  v_dry:=public.get_sync_ledger_pruning_dry_run();

  v_base:=jsonb_set(v_base,'{ledgerPruningDryRun}',v_dry,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,ledgerPruningDryRunEnabled}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,dryRunAvailable}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningEligibilityGuardEnabled}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningImplementationState}','"dry_run_only"'::jsonb,true);

  -- R41 is observational only. Keep every authoritative delete switch fail-closed.
  v_base:=jsonb_set(v_base,'{pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,ledgerPruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,status}','"HOLD"'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.get_sync_retention_observability_snapshot() from public,anon,authenticated;
grant execute on function public.get_sync_retention_observability_snapshot() to authenticated,service_role;

comment on function public.get_sync_ledger_pruning_dry_run() is
  'R41 super-admin read-only ledger pruning dry-run. Counts only replay-guard-protected rows past replay horizon plus safety buffer. Executes no DELETE.';
comment on function public.assert_sync_ledger_pruning_allowed_r41(text) is
  'R41 fail-closed server eligibility guard for a future pruning phase. No pruning function exists or is enabled in R41.';
comment on function public.get_sync_retention_observability_snapshot() is
  'R41 observability adds dry-run candidate and guard-coverage metrics while keeping all ledger pruning flags disabled and Decision Gate HOLD.';

notify pgrst,'reload schema';
commit;

-- PETATOE P5.13.8.72 R43 — Production retention readiness + legacy client rollout gate
-- Scope:
--   * Compute authoritative Production Retention Gate readiness from server evidence only.
--   * Measure active-client replay-policy rollout for Execution + SEA VIBE.
--   * Expose Observation / Legacy Grace / Guard Coverage / timing readiness without enabling pruning.
--   * Keep every ledger DELETE path disabled. No business data is mutated in this phase.

begin;

-- Preserve the R41 dry-run implementation as an immutable calculation core, then wrap only its
-- Decision Gate metadata so the dry-run follows R43's authoritative readiness state.
do $$
begin
  if to_regprocedure('public.get_sync_ledger_pruning_dry_run_core_r43()') is null
     and to_regprocedure('public.get_sync_ledger_pruning_dry_run()') is not null then
    execute 'alter function public.get_sync_ledger_pruning_dry_run() rename to get_sync_ledger_pruning_dry_run_core_r43';
  end if;
end $$;

revoke all on function public.get_sync_ledger_pruning_dry_run_core_r43() from public,anon,authenticated;

create or replace function public.get_sync_retention_production_readiness_r43()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_now timestamptz:=now();
  v_required_observation_days integer:=60;
  v_active_client_window_days integer:=45;
  v_observation_started timestamptz;
  v_observation_ready_at timestamptz;
  v_observation_days integer:=0;
  v_observation_ok boolean:=false;

  v_queue_policy public.sync_replay_server_policy%rowtype;
  v_fin_policy public.installation_financial_replay_policy%rowtype;
  v_queue_policy_ok boolean:=false;
  v_fin_policy_ok boolean:=false;
  v_legacy_grace_active boolean:=true;
  v_time_gate_ready_at timestamptz;

  v_exec_active bigint:=0;
  v_exec_policy bigint:=0;
  v_exec_legacy bigint:=0;
  v_exec_rollout_ok boolean:=false;
  v_exec_oldest_policy_seen timestamptz;
  v_exec_latest_policy_seen timestamptz;

  v_sea_active bigint:=0;
  v_sea_policy bigint:=0;
  v_sea_legacy bigint:=0;
  v_sea_rollout_ok boolean:=false;
  v_sea_oldest_policy_seen timestamptz;
  v_sea_latest_policy_seen timestamptz;

  v_dry jsonb;
  v_exec_unprotected bigint:=0;
  v_exec_policy_mismatch bigint:=0;
  v_sea_unprotected bigint:=0;
  v_sea_policy_mismatch bigint:=0;
  v_fin_unprotected bigint:=0;
  v_fin_policy_mismatch bigint:=0;
  v_fin_content_mismatch bigint:=0;
  v_exec_guard_ok boolean:=false;
  v_sea_guard_ok boolean:=false;
  v_fin_guard_ok boolean:=false;

  v_exec_first_safe_at timestamptz;
  v_exec_all_current_safe_at timestamptz;
  v_sea_first_safe_at timestamptz;
  v_sea_all_current_safe_at timestamptz;
  v_fin_first_safe_at timestamptz;
  v_fin_all_current_safe_at timestamptz;

  v_exec_blockers jsonb:='[]'::jsonb;
  v_sea_blockers jsonb:='[]'::jsonb;
  v_fin_blockers jsonb:='[]'::jsonb;
  v_overall_blockers jsonb:='[]'::jsonb;
  v_gate_ready boolean:=false;
  v_next text:='WAIT_RETENTION_GATE_REQUIREMENTS';
begin
  if v_uid is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  select min(first_seen_at) into v_observation_started
  from public.sync_queue_client_watermarks;
  if v_observation_started is not null then
    v_observation_ready_at:=v_observation_started + make_interval(days=>v_required_observation_days);
    v_observation_days:=greatest(0,floor(extract(epoch from (v_now-v_observation_started))/86400)::integer);
    v_observation_ok:=v_now>=v_observation_ready_at;
  end if;

  select * into v_queue_policy
  from public.sync_replay_server_policy
  where policy_key='execution_sea_vibe';
  v_queue_policy_ok:=found
    and coalesce(v_queue_policy.replay_horizon_days,0)=90
    and coalesce(v_queue_policy.safety_buffer_days,0)=30;
  if v_queue_policy_ok then
    v_legacy_grace_active:=v_now<=v_queue_policy.legacy_v1_accept_until;
    if v_observation_ready_at is not null then
      v_time_gate_ready_at:=greatest(v_observation_ready_at,v_queue_policy.legacy_v1_accept_until);
    end if;
  else
    v_legacy_grace_active:=true;
  end if;

  select * into v_fin_policy
  from public.installation_financial_replay_policy
  where policy_key='appointment_financial';
  v_fin_policy_ok:=found
    and coalesce(v_fin_policy.replay_horizon_days,0)=90
    and coalesce(v_fin_policy.safety_buffer_days,0)=30;

  if v_queue_policy_ok then
    select
      count(distinct (user_id,client_id)),
      count(distinct (user_id,client_id)) filter(
        where replay_policy_version=v_queue_policy.policy_version
          and replay_horizon_days=v_queue_policy.replay_horizon_days
      ),
      count(distinct (user_id,client_id)) filter(
        where coalesce(replay_policy_version,'')<>v_queue_policy.policy_version
           or coalesce(replay_horizon_days,0)<>v_queue_policy.replay_horizon_days
      ),
      min(last_seen_at) filter(
        where replay_policy_version=v_queue_policy.policy_version
          and replay_horizon_days=v_queue_policy.replay_horizon_days
      ),
      max(last_seen_at) filter(
        where replay_policy_version=v_queue_policy.policy_version
          and replay_horizon_days=v_queue_policy.replay_horizon_days
      )
    into v_exec_active,v_exec_policy,v_exec_legacy,v_exec_oldest_policy_seen,v_exec_latest_policy_seen
    from public.sync_queue_client_watermarks
    where domain='installation_execution'
      and last_seen_at>=v_now-make_interval(days=>v_active_client_window_days);

    select
      count(distinct (user_id,client_id)),
      count(distinct (user_id,client_id)) filter(
        where replay_policy_version=v_queue_policy.policy_version
          and replay_horizon_days=v_queue_policy.replay_horizon_days
      ),
      count(distinct (user_id,client_id)) filter(
        where coalesce(replay_policy_version,'')<>v_queue_policy.policy_version
           or coalesce(replay_horizon_days,0)<>v_queue_policy.replay_horizon_days
      ),
      min(last_seen_at) filter(
        where replay_policy_version=v_queue_policy.policy_version
          and replay_horizon_days=v_queue_policy.replay_horizon_days
      ),
      max(last_seen_at) filter(
        where replay_policy_version=v_queue_policy.policy_version
          and replay_horizon_days=v_queue_policy.replay_horizon_days
      )
    into v_sea_active,v_sea_policy,v_sea_legacy,v_sea_oldest_policy_seen,v_sea_latest_policy_seen
    from public.sync_queue_client_watermarks
    where domain='sea_vibe'
      and last_seen_at>=v_now-make_interval(days=>v_active_client_window_days);
  end if;

  -- No active clients means there is no active legacy-client blocker. Server enforcement plus the
  -- bounded R39 legacy grace remains the authoritative stale-client safety boundary.
  v_exec_rollout_ok:=v_queue_policy_ok and v_exec_legacy=0;
  v_sea_rollout_ok:=v_queue_policy_ok and v_sea_legacy=0;

  v_dry:=public.get_sync_ledger_pruning_dry_run_core_r43();
  v_exec_unprotected:=coalesce((v_dry#>>'{domains,installationExecution,unprotectedRows}')::bigint,0);
  v_exec_policy_mismatch:=coalesce((v_dry#>>'{domains,installationExecution,policyMismatchRows}')::bigint,0);
  v_sea_unprotected:=coalesce((v_dry#>>'{domains,seaVibe,unprotectedRows}')::bigint,0);
  v_sea_policy_mismatch:=coalesce((v_dry#>>'{domains,seaVibe,policyMismatchRows}')::bigint,0);
  v_fin_unprotected:=coalesce((v_dry#>>'{domains,installationFinancial,unprotectedRows}')::bigint,0);
  v_fin_policy_mismatch:=coalesce((v_dry#>>'{domains,installationFinancial,policyMismatchRows}')::bigint,0);
  v_fin_content_mismatch:=coalesce((v_dry#>>'{domains,installationFinancial,guardContentMismatchRows}')::bigint,0);
  v_exec_guard_ok:=v_exec_unprotected=0 and v_exec_policy_mismatch=0;
  v_sea_guard_ok:=v_sea_unprotected=0 and v_sea_policy_mismatch=0;
  v_fin_guard_ok:=v_fin_unprotected=0 and v_fin_policy_mismatch=0 and v_fin_content_mismatch=0;

  if v_queue_policy_ok then
    select min(g.replay_expires_at+make_interval(days=>v_queue_policy.safety_buffer_days)),
           max(g.replay_expires_at+make_interval(days=>v_queue_policy.safety_buffer_days))
      into v_exec_first_safe_at,v_exec_all_current_safe_at
    from public.installation_execution_sync_operations l
    join public.sync_replay_server_guards g
      on g.user_id=l.user_id and g.operation_key=l.operation_key and g.domain='installation_execution'
     and g.policy_version=v_queue_policy.policy_version;

    select min(g.replay_expires_at+make_interval(days=>v_queue_policy.safety_buffer_days)),
           max(g.replay_expires_at+make_interval(days=>v_queue_policy.safety_buffer_days))
      into v_sea_first_safe_at,v_sea_all_current_safe_at
    from public.sea_vibe_sync_operations l
    join public.sync_replay_server_guards g
      on g.user_id=l.user_id and g.operation_key=l.operation_key and g.domain='sea_vibe'
     and g.policy_version=v_queue_policy.policy_version;
  end if;

  if v_fin_policy_ok then
    select min(g.replay_expires_at+make_interval(days=>v_fin_policy.safety_buffer_days)),
           max(g.replay_expires_at+make_interval(days=>v_fin_policy.safety_buffer_days))
      into v_fin_first_safe_at,v_fin_all_current_safe_at
    from public.installation_financial_operations l
    join public.installation_financial_replay_guards g
      on g.user_id=l.user_id and g.operation_key=l.operation_key
     and g.operation_type=l.operation_type and g.payload_hash=l.payload_hash
     and g.policy_version=v_fin_policy.policy_version;
  end if;

  if not v_observation_ok then
    v_exec_blockers:=v_exec_blockers||jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
    v_sea_blockers:=v_sea_blockers||jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
    v_fin_blockers:=v_fin_blockers||jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('OBSERVATION_WINDOW_INCOMPLETE');
  end if;
  if not v_queue_policy_ok then
    v_exec_blockers:=v_exec_blockers||jsonb_build_array('SERVER_REPLAY_POLICY_MISSING');
    v_sea_blockers:=v_sea_blockers||jsonb_build_array('SERVER_REPLAY_POLICY_MISSING');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('SERVER_REPLAY_POLICY_MISSING');
  end if;
  if v_legacy_grace_active then
    v_exec_blockers:=v_exec_blockers||jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE');
    v_sea_blockers:=v_sea_blockers||jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE');
  end if;
  if not v_exec_rollout_ok then
    v_exec_blockers:=v_exec_blockers||jsonb_build_array('ACTIVE_CLIENT_REPLAY_POLICY_ROLLOUT_INCOMPLETE');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('ACTIVE_CLIENT_REPLAY_POLICY_ROLLOUT_INCOMPLETE');
  end if;
  if not v_sea_rollout_ok then
    v_sea_blockers:=v_sea_blockers||jsonb_build_array('ACTIVE_CLIENT_REPLAY_POLICY_ROLLOUT_INCOMPLETE');
    if not (v_overall_blockers @> '["ACTIVE_CLIENT_REPLAY_POLICY_ROLLOUT_INCOMPLETE"]'::jsonb) then
      v_overall_blockers:=v_overall_blockers||jsonb_build_array('ACTIVE_CLIENT_REPLAY_POLICY_ROLLOUT_INCOMPLETE');
    end if;
  end if;
  if not v_exec_guard_ok then
    v_exec_blockers:=v_exec_blockers||jsonb_build_array('EXECUTION_REPLAY_GUARD_COVERAGE_INCOMPLETE');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('EXECUTION_REPLAY_GUARD_COVERAGE_INCOMPLETE');
  end if;
  if not v_sea_guard_ok then
    v_sea_blockers:=v_sea_blockers||jsonb_build_array('SEA_VIBE_REPLAY_GUARD_COVERAGE_INCOMPLETE');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('SEA_VIBE_REPLAY_GUARD_COVERAGE_INCOMPLETE');
  end if;
  if not v_fin_policy_ok then
    v_fin_blockers:=v_fin_blockers||jsonb_build_array('FINANCIAL_REPLAY_POLICY_MISSING');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('FINANCIAL_REPLAY_POLICY_MISSING');
  end if;
  if not v_fin_guard_ok then
    v_fin_blockers:=v_fin_blockers||jsonb_build_array('FINANCIAL_REPLAY_GUARD_COVERAGE_INCOMPLETE');
    v_overall_blockers:=v_overall_blockers||jsonb_build_array('FINANCIAL_REPLAY_GUARD_COVERAGE_INCOMPLETE');
  end if;

  v_gate_ready:=v_observation_ok
    and v_queue_policy_ok
    and not v_legacy_grace_active
    and v_exec_rollout_ok
    and v_sea_rollout_ok
    and v_exec_guard_ok
    and v_sea_guard_ok
    and v_fin_policy_ok
    and v_fin_guard_ok;

  if not v_exec_guard_ok or not v_sea_guard_ok or not v_fin_guard_ok then
    v_next:='REPLAY_GUARD_COVERAGE_INCOMPLETE';
  elsif not v_queue_policy_ok or not v_fin_policy_ok then
    v_next:='REPLAY_POLICY_SERVER_CONTRACT_INCOMPLETE';
  elsif v_legacy_grace_active then
    v_next:='WAIT_SERVER_LEGACY_REPLAY_GRACE';
  elsif not v_observation_ok then
    v_next:='WAIT_OBSERVATION_WINDOW';
  elsif not v_exec_rollout_ok or not v_sea_rollout_ok then
    v_next:='WAIT_ACTIVE_CLIENT_ROLLOUT';
  else
    v_next:='BOUNDED_PRUNING_IMPLEMENTATION_PENDING';
  end if;

  return jsonb_build_object(
    'ok',true,
    'serverTime',v_now,
    'status',case when v_gate_ready then 'READY' else 'HOLD' end,
    'pruningEnabled',false,
    'pruningAllowedNow',false,
    'requiredObservationDays',v_required_observation_days,
    'activeClientWindowDays',v_active_client_window_days,
    'observationStartedAt',v_observation_started,
    'observationReadyAt',v_observation_ready_at,
    'observationDays',v_observation_days,
    'observationWindowSatisfied',v_observation_ok,
    'legacyV1AcceptUntil',case when v_queue_policy_ok then v_queue_policy.legacy_v1_accept_until else null end,
    'legacyV1GraceActive',v_legacy_grace_active,
    'timeConditionsReadyAt',v_time_gate_ready_at,
    'nextDecisionRequired',v_next,
    'blockers',v_overall_blockers,
    'postGateBlockers',jsonb_build_array('LEDGER_PRUNING_DISABLED'),
    'domains',jsonb_build_object(
      'installationExecution',jsonb_build_object(
        'status',case when v_observation_ok and not v_legacy_grace_active and v_exec_rollout_ok and v_exec_guard_ok and v_queue_policy_ok then 'READY' else 'HOLD' end,
        'activeClients',v_exec_active,
        'activePolicyClients',v_exec_policy,
        'legacyOrUnboundedActiveClients',v_exec_legacy,
        'rolloutCoveragePercent',case when v_exec_active=0 then 100 else round((v_exec_policy::numeric*100)/v_exec_active,2) end,
        'rolloutSatisfied',v_exec_rollout_ok,
        'rolloutBasis',case when v_exec_active=0 then 'NO_ACTIVE_CLIENTS' else 'ACTIVE_CLIENT_HEARTBEATS' end,
        'oldestPolicyHeartbeatAt',v_exec_oldest_policy_seen,
        'latestPolicyHeartbeatAt',v_exec_latest_policy_seen,
        'unprotectedRows',v_exec_unprotected,
        'policyMismatchRows',v_exec_policy_mismatch,
        'guardCoverageSatisfied',v_exec_guard_ok,
        'firstCurrentRowSafetyMaturityAt',v_exec_first_safe_at,
        'allCurrentRowsSafetyMaturityAt',v_exec_all_current_safe_at,
        'blockers',v_exec_blockers
      ),
      'seaVibe',jsonb_build_object(
        'status',case when v_observation_ok and not v_legacy_grace_active and v_sea_rollout_ok and v_sea_guard_ok and v_queue_policy_ok then 'READY' else 'HOLD' end,
        'activeClients',v_sea_active,
        'activePolicyClients',v_sea_policy,
        'legacyOrUnboundedActiveClients',v_sea_legacy,
        'rolloutCoveragePercent',case when v_sea_active=0 then 100 else round((v_sea_policy::numeric*100)/v_sea_active,2) end,
        'rolloutSatisfied',v_sea_rollout_ok,
        'rolloutBasis',case when v_sea_active=0 then 'NO_ACTIVE_CLIENTS' else 'ACTIVE_CLIENT_HEARTBEATS' end,
        'oldestPolicyHeartbeatAt',v_sea_oldest_policy_seen,
        'latestPolicyHeartbeatAt',v_sea_latest_policy_seen,
        'unprotectedRows',v_sea_unprotected,
        'policyMismatchRows',v_sea_policy_mismatch,
        'guardCoverageSatisfied',v_sea_guard_ok,
        'firstCurrentRowSafetyMaturityAt',v_sea_first_safe_at,
        'allCurrentRowsSafetyMaturityAt',v_sea_all_current_safe_at,
        'blockers',v_sea_blockers
      ),
      'installationFinancial',jsonb_build_object(
        'status',case when v_observation_ok and v_fin_policy_ok and v_fin_guard_ok then 'READY' else 'HOLD' end,
        'activeClients',null,
        'activePolicyClients',null,
        'legacyOrUnboundedActiveClients',null,
        'rolloutCoveragePercent',null,
        'rolloutSatisfied',true,
        'rolloutBasis','SERVER_ONLY_FINANCIAL_RETRY',
        'unprotectedRows',v_fin_unprotected,
        'policyMismatchRows',v_fin_policy_mismatch,
        'guardContentMismatchRows',v_fin_content_mismatch,
        'guardCoverageSatisfied',v_fin_guard_ok,
        'firstCurrentRowSafetyMaturityAt',v_fin_first_safe_at,
        'allCurrentRowsSafetyMaturityAt',v_fin_all_current_safe_at,
        'blockers',v_fin_blockers
      )
    )
  );
end;
$$;

revoke all on function public.get_sync_retention_production_readiness_r43() from public,anon,authenticated;
grant execute on function public.get_sync_retention_production_readiness_r43() to authenticated,service_role;

create or replace function public.get_sync_ledger_pruning_dry_run()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_base jsonb;
  v_ready jsonb;
  v_blockers jsonb:='[]'::jsonb;
  v_gate_status text:='HOLD';
  v_legacy boolean:=true;
begin
  v_base:=public.get_sync_ledger_pruning_dry_run_core_r43();
  v_ready:=public.get_sync_retention_production_readiness_r43();
  v_gate_status:=coalesce(v_ready->>'status','HOLD');
  v_legacy:=coalesce((v_ready->>'legacyV1GraceActive')::boolean,true);

  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_blockers
  from jsonb_array_elements(coalesce(v_base->'blockers','[]'::jsonb)) value
  where value not in (
    '"DECISION_GATE_NOT_READY"'::jsonb,
    '"SERVER_LEGACY_REPLAY_GRACE_ACTIVE"'::jsonb
  );
  if v_gate_status<>'READY' then v_blockers:=v_blockers||jsonb_build_array('DECISION_GATE_NOT_READY'); end if;
  if v_legacy then v_blockers:=v_blockers||jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE'); end if;

  v_base:=jsonb_set(v_base,'{decisionGateStatus}',to_jsonb(v_gate_status),true);
  v_base:=jsonb_set(v_base,'{decisionGateReady}',to_jsonb(v_gate_status='READY'),true);
  v_base:=jsonb_set(v_base,'{legacyReplayGraceActive}',to_jsonb(v_legacy),true);
  v_base:=jsonb_set(v_base,'{blockers}',v_blockers,true);
  v_base:=jsonb_set(v_base,'{productionReadiness}',v_ready,true);
  v_base:=jsonb_set(v_base,'{pruningAllowedNow}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{ledgerPruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{deleteExecuted}','false'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.get_sync_ledger_pruning_dry_run() from public,anon,authenticated;
grant execute on function public.get_sync_ledger_pruning_dry_run() to authenticated,service_role;

-- Preserve the complete R42 observability payload and enrich it with the authoritative R43 gate.
do $$
begin
  if to_regprocedure('public.get_sync_retention_observability_snapshot_core_r43()') is null
     and to_regprocedure('public.get_sync_retention_observability_snapshot()') is not null then
    execute 'alter function public.get_sync_retention_observability_snapshot() rename to get_sync_retention_observability_snapshot_core_r43';
  end if;
end $$;

revoke all on function public.get_sync_retention_observability_snapshot_core_r43() from public,anon,authenticated;

create or replace function public.get_sync_retention_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_base jsonb;
  v_ready jsonb;
  v_dry jsonb;
  v_status text:='HOLD';
  v_exec jsonb;
  v_sea jsonb;
  v_fin jsonb;
begin
  v_base:=public.get_sync_retention_observability_snapshot_core_r43();
  v_dry:=coalesce(v_base->'ledgerPruningDryRun',public.get_sync_ledger_pruning_dry_run());
  v_ready:=coalesce(v_dry->'productionReadiness',public.get_sync_retention_production_readiness_r43());
  v_status:=coalesce(v_ready->>'status','HOLD');
  v_exec:=coalesce(v_ready#>'{domains,installationExecution}','{}'::jsonb);
  v_sea:=coalesce(v_ready#>'{domains,seaVibe}','{}'::jsonb);
  v_fin:=coalesce(v_ready#>'{domains,installationFinancial}','{}'::jsonb);

  v_base:=jsonb_set(v_base,'{productionRetentionReadiness}',v_ready,true);
  v_base:=jsonb_set(v_base,'{ledgerPruningDryRun}',v_dry,true);
  v_base:=jsonb_set(v_base,'{readinessReason}',to_jsonb(case when v_status='READY' then 'PRODUCTION_RETENTION_GATE_READY_PRUNING_STILL_DISABLED' else 'PRODUCTION_RETENTION_GATE_HOLD' end),true);
  v_base:=jsonb_set(v_base,'{decisionGate,status}',to_jsonb(v_status),true);
  v_base:=jsonb_set(v_base,'{decisionGate,blockers}',coalesce(v_ready->'blockers','[]'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,nextDecisionRequired}',coalesce(v_ready->'nextDecisionRequired','"WAIT_RETENTION_GATE_REQUIREMENTS"'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,observationDays}',coalesce(v_ready->'observationDays','0'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,requiredObservationDays}',coalesce(v_ready->'requiredObservationDays','60'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,observationWindowSatisfied}',coalesce(v_ready->'observationWindowSatisfied','false'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,observationReadyAt}',coalesce(v_ready->'observationReadyAt','null'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,legacyV1AcceptUntil}',coalesce(v_ready->'legacyV1AcceptUntil','null'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,legacyV1GraceActive}',coalesce(v_ready->'legacyV1GraceActive','true'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,timeConditionsReadyAt}',coalesce(v_ready->'timeConditionsReadyAt','null'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,activeClientWindowDays}',coalesce(v_ready->'activeClientWindowDays','45'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationExecution,status}',coalesce(v_exec->'status','"HOLD"'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationExecution,blockers}',coalesce(v_exec->'blockers','[]'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationExecution,rolloutSatisfied}',coalesce(v_exec->'rolloutSatisfied','false'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationExecution,rolloutCoveragePercent}',coalesce(v_exec->'rolloutCoveragePercent','0'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationExecution,legacyOrUnboundedActiveClients}',coalesce(v_exec->'legacyOrUnboundedActiveClients','0'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,seaVibe,status}',coalesce(v_sea->'status','"HOLD"'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,seaVibe,blockers}',coalesce(v_sea->'blockers','[]'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,seaVibe,rolloutSatisfied}',coalesce(v_sea->'rolloutSatisfied','false'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,seaVibe,rolloutCoveragePercent}',coalesce(v_sea->'rolloutCoveragePercent','0'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,seaVibe,legacyOrUnboundedActiveClients}',coalesce(v_sea->'legacyOrUnboundedActiveClients','0'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,status}',coalesce(v_fin->'status','"HOLD"'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,blockers}',coalesce(v_fin->'blockers','[]'::jsonb),true);

  -- R43 can make the Decision Gate READY, but it cannot enable deletion. A later separately
  -- approved phase must implement bounded pruning and flip its own dedicated server switch.
  v_base:=jsonb_set(v_base,'{pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,ledgerPruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningImplementationState}','"not_implemented"'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.get_sync_retention_observability_snapshot() from public,anon,authenticated;
grant execute on function public.get_sync_retention_observability_snapshot() to authenticated,service_role;

comment on function public.get_sync_retention_production_readiness_r43() is
  'R43 super-admin read-only Production Retention Gate. Measures observation, R39 legacy grace, active-client replay rollout, and replay-guard coverage. Never enables pruning.';
comment on function public.get_sync_ledger_pruning_dry_run() is
  'R43 wrapper over the R41 dry-run calculation using the authoritative R43 Production Retention Gate. Still executes no DELETE.';
comment on function public.get_sync_retention_observability_snapshot() is
  'R43 observability exposes authoritative Production Retention readiness and active-client rollout while keeping ledger pruning disabled.';

notify pgrst,'reload schema';
commit;

-- PETATOE P5.13.8.72 R44 — Bounded ledger pruning engine foundation (DISABLED)
-- Scope:
--   * Install a bounded, audited, server-side pruning engine for the three idempotency result ledgers.
--   * Keep the execution switch OFF and expose no authenticated execute grant in R44.
--   * Require authoritative R43 Production Gate READY + R41 eligibility guard + replay-guard coverage before any future DELETE.
--   * Preserve compact/server replay guards; only heavy result-ledger rows are ever eligible.
--   * No DELETE is executed by this migration and no automatic scheduler/cron is created.

begin;

create table if not exists public.sync_ledger_pruning_runtime_policy (
  policy_key text primary key,
  implementation_version text not null,
  execution_enabled boolean not null default false,
  max_batch_rows integer not null default 100 check (max_batch_rows between 1 and 100),
  enabled_at timestamptz null,
  enabled_by uuid null,
  updated_at timestamptz not null default now(),
  constraint sync_ledger_pruning_runtime_policy_key_chk check (policy_key='idempotency_ledgers')
);

alter table public.sync_ledger_pruning_runtime_policy enable row level security;
revoke all on table public.sync_ledger_pruning_runtime_policy from public,anon,authenticated;
grant select on table public.sync_ledger_pruning_runtime_policy to service_role;

insert into public.sync_ledger_pruning_runtime_policy(
  policy_key,implementation_version,execution_enabled,max_batch_rows,enabled_at,enabled_by,updated_at
) values (
  'idempotency_ledgers','r44-bounded-disabled-v1',false,100,null,null,now()
)
on conflict(policy_key) do update
set implementation_version=excluded.implementation_version,
    -- R44 must never turn a previously-disabled production switch on.
    execution_enabled=false,
    max_batch_rows=least(greatest(public.sync_ledger_pruning_runtime_policy.max_batch_rows,1),100),
    enabled_at=null,
    enabled_by=null,
    updated_at=now();

create table if not exists public.sync_ledger_pruning_audit_runs (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('installation_execution','sea_vibe','installation_financial')),
  requested_limit integer not null,
  effective_limit integer not null,
  deleted_rows integer not null default 0,
  oldest_deleted_created_at timestamptz null,
  newest_deleted_created_at timestamptz null,
  executed_by uuid null,
  executed_at timestamptz not null default now(),
  engine_version text not null,
  production_gate_status text not null,
  note text not null default 'bounded_result_ledger_pruning'
);

create index if not exists idx_sync_ledger_pruning_audit_runs_executed_at
  on public.sync_ledger_pruning_audit_runs(executed_at desc);
create index if not exists idx_sync_ledger_pruning_audit_runs_domain_time
  on public.sync_ledger_pruning_audit_runs(domain,executed_at desc);

alter table public.sync_ledger_pruning_audit_runs enable row level security;
revoke all on table public.sync_ledger_pruning_audit_runs from public,anon,authenticated;
grant select on table public.sync_ledger_pruning_audit_runs to service_role;

create or replace function public.get_sync_ledger_pruning_engine_status_r44()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_now timestamptz:=now();
  v_policy public.sync_ledger_pruning_runtime_policy%rowtype;
  v_ready jsonb;
  v_dry jsonb;
  v_gate text:='HOLD';
  v_switch boolean:=false;
  v_candidates bigint:=0;
  v_unprotected bigint:=0;
  v_guard_mismatch bigint:=0;
begin
  if v_uid is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  select * into v_policy
  from public.sync_ledger_pruning_runtime_policy
  where policy_key='idempotency_ledgers';
  if not found then raise exception 'LEDGER_PRUNING_RUNTIME_POLICY_MISSING'; end if;

  v_ready:=public.get_sync_retention_production_readiness_r43();
  v_dry:=public.get_sync_ledger_pruning_dry_run();
  v_gate:=coalesce(v_ready->>'status','HOLD');
  v_switch:=coalesce(v_policy.execution_enabled,false);
  v_candidates:=coalesce((v_dry->>'technicalCandidateRows')::bigint,0);
  v_unprotected:=coalesce((v_dry->>'unprotectedRows')::bigint,0);
  v_guard_mismatch:=
    coalesce((v_dry#>>'{domains,installationExecution,policyMismatchRows}')::bigint,0)
    + coalesce((v_dry#>>'{domains,seaVibe,policyMismatchRows}')::bigint,0)
    + coalesce((v_dry#>>'{domains,installationFinancial,policyMismatchRows}')::bigint,0)
    + coalesce((v_dry#>>'{domains,installationFinancial,guardContentMismatchRows}')::bigint,0);

  return jsonb_build_object(
    'ok',true,
    'serverTime',v_now,
    'engineInstalled',true,
    'engineVersion',v_policy.implementation_version,
    'executionEnabled',v_switch,
    'mode',case when v_switch then 'bounded_manual' else 'installed_disabled' end,
    'maxBatchRows',v_policy.max_batch_rows,
    'productionGateStatus',v_gate,
    'productionGateReady',v_gate='READY',
    'technicalCandidateRows',v_candidates,
    'unprotectedRows',v_unprotected,
    'guardMismatchRows',v_guard_mismatch,
    'activationEvidenceSatisfied',v_gate='READY' and v_unprotected=0 and v_guard_mismatch=0,
    'pruningAllowedNow',false,
    'authenticatedExecuteGranted',false,
    'automaticSchedulerConfigured',false,
    'replayGuardsPreserved',true,
    'deleteExecuted',false,
    'nextStep',case
      when v_gate<>'READY' then 'WAIT_PRODUCTION_GATE_READY'
      when v_unprotected>0 or v_guard_mismatch>0 then 'FIX_REPLAY_GUARD_COVERAGE'
      else 'SEPARATE_PRUNING_ACTIVATION_MIGRATION_REQUIRED'
    end
  );
end;
$$;

revoke all on function public.get_sync_ledger_pruning_engine_status_r44() from public,anon,authenticated;
grant execute on function public.get_sync_ledger_pruning_engine_status_r44() to authenticated,service_role;

-- Internal pruning engine. It is intentionally NOT granted to authenticated/service_role in R44.
-- Even a database-owner invocation fails while execution_enabled=false, before reaching DELETE.
create or replace function public.prune_sync_idempotency_ledger_batch_r44(
  p_domain text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_domain text:=lower(trim(coalesce(p_domain,'')));
  v_requested_limit integer:=coalesce(p_limit,50);
  v_limit integer;
  v_policy public.sync_ledger_pruning_runtime_policy%rowtype;
  v_ready jsonb;
  v_gate text:='HOLD';
  v_deleted integer:=0;
  v_oldest timestamptz;
  v_newest timestamptz;
  v_queue_policy public.sync_replay_server_policy%rowtype;
  v_fin_policy public.installation_financial_replay_policy%rowtype;
  v_lock_key bigint;
begin
  if v_uid is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if v_domain not in ('installation_execution','sea_vibe','installation_financial') then
    raise exception 'LEDGER_PRUNING_DOMAIN_INVALID';
  end if;

  select * into v_policy
  from public.sync_ledger_pruning_runtime_policy
  where policy_key='idempotency_ledgers'
  for update;
  if not found then raise exception 'LEDGER_PRUNING_RUNTIME_POLICY_MISSING'; end if;

  -- First hard stop: R44 always installs this switch OFF.
  if coalesce(v_policy.execution_enabled,false) is not true then
    raise exception 'LEDGER_PRUNING_SWITCH_DISABLED';
  end if;

  v_ready:=public.get_sync_retention_production_readiness_r43();
  v_gate:=coalesce(v_ready->>'status','HOLD');
  if v_gate<>'READY' then raise exception 'LEDGER_PRUNING_PRODUCTION_GATE_NOT_READY'; end if;

  -- Second hard stop: reuse the established R41 fail-closed eligibility contract.
  perform public.assert_sync_ledger_pruning_allowed_r41(v_domain);

  v_limit:=least(greatest(v_requested_limit,1),v_policy.max_batch_rows,100);
  v_lock_key:=hashtextextended('petatoe:ledger-pruning:'||v_domain,0);
  if not pg_try_advisory_xact_lock(v_lock_key) then
    raise exception 'LEDGER_PRUNING_LOCK_BUSY';
  end if;

  if v_domain in ('installation_execution','sea_vibe') then
    select * into v_queue_policy
    from public.sync_replay_server_policy
    where policy_key='execution_sea_vibe';
    if not found then raise exception 'SYNC_REPLAY_SERVER_POLICY_MISSING'; end if;
  else
    select * into v_fin_policy
    from public.installation_financial_replay_policy
    where policy_key='appointment_financial';
    if not found then raise exception 'FINANCIAL_REPLAY_POLICY_NOT_CONFIGURED'; end if;
  end if;

  if v_domain='installation_execution' then
    with candidate as (
      select l.id
      from public.installation_execution_sync_operations l
      join public.sync_replay_server_guards g
        on g.user_id=l.user_id
       and g.domain='installation_execution'
       and g.operation_key=l.operation_key
       and g.policy_version=v_queue_policy.policy_version
      where g.replay_expires_at + make_interval(days=>v_queue_policy.safety_buffer_days) <= now()
      order by l.created_at asc,l.id asc
      limit v_limit
    ), deleted as (
      delete from public.installation_execution_sync_operations l
      using candidate c
      where l.id=c.id
      returning l.created_at
    )
    select count(*)::integer,min(created_at),max(created_at)
      into v_deleted,v_oldest,v_newest
    from deleted;
  elsif v_domain='sea_vibe' then
    with candidate as (
      select l.id
      from public.sea_vibe_sync_operations l
      join public.sync_replay_server_guards g
        on g.user_id=l.user_id
       and g.domain='sea_vibe'
       and g.operation_key=l.operation_key
       and g.policy_version=v_queue_policy.policy_version
      where g.replay_expires_at + make_interval(days=>v_queue_policy.safety_buffer_days) <= now()
      order by l.created_at asc,l.id asc
      limit v_limit
    ), deleted as (
      delete from public.sea_vibe_sync_operations l
      using candidate c
      where l.id=c.id
      returning l.created_at
    )
    select count(*)::integer,min(created_at),max(created_at)
      into v_deleted,v_oldest,v_newest
    from deleted;
  else
    with candidate as (
      select l.id
      from public.installation_financial_operations l
      join public.installation_financial_replay_guards g
        on g.user_id=l.user_id
       and g.operation_key=l.operation_key
       and g.operation_type=l.operation_type
       and g.payload_hash=l.payload_hash
       and g.policy_version=v_fin_policy.policy_version
      where g.replay_expires_at + make_interval(days=>v_fin_policy.safety_buffer_days) <= now()
      order by l.created_at asc,l.id asc
      limit v_limit
    ), deleted as (
      delete from public.installation_financial_operations l
      using candidate c
      where l.id=c.id
      returning l.created_at
    )
    select count(*)::integer,min(created_at),max(created_at)
      into v_deleted,v_oldest,v_newest
    from deleted;
  end if;

  insert into public.sync_ledger_pruning_audit_runs(
    domain,requested_limit,effective_limit,deleted_rows,
    oldest_deleted_created_at,newest_deleted_created_at,
    executed_by,engine_version,production_gate_status
  ) values (
    v_domain,v_requested_limit,v_limit,coalesce(v_deleted,0),
    v_oldest,v_newest,v_uid,v_policy.implementation_version,v_gate
  );

  return jsonb_build_object(
    'ok',true,
    'domain',v_domain,
    'requestedLimit',v_requested_limit,
    'effectiveLimit',v_limit,
    'deletedRows',coalesce(v_deleted,0),
    'oldestDeletedCreatedAt',v_oldest,
    'newestDeletedCreatedAt',v_newest,
    'replayGuardsPreserved',true,
    'engineVersion',v_policy.implementation_version
  );
end;
$$;

revoke all on function public.prune_sync_idempotency_ledger_batch_r44(text,integer) from public,anon,authenticated,service_role;
-- Intentionally NO execute grant. A separate post-READY activation migration must both enable
-- the server switch and explicitly grant the chosen execution path.

-- Preserve the complete R43 observability payload and append only the disabled engine status.
do $$
begin
  if to_regprocedure('public.get_sync_retention_observability_snapshot_core_r44()') is null
     and to_regprocedure('public.get_sync_retention_observability_snapshot()') is not null then
    execute 'alter function public.get_sync_retention_observability_snapshot() rename to get_sync_retention_observability_snapshot_core_r44';
  end if;
end $$;

revoke all on function public.get_sync_retention_observability_snapshot_core_r44() from public,anon,authenticated;

create or replace function public.get_sync_retention_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_base jsonb;
  v_engine jsonb;
  v_gate text:='HOLD';
begin
  v_base:=public.get_sync_retention_observability_snapshot_core_r44();
  v_engine:=public.get_sync_ledger_pruning_engine_status_r44();
  v_gate:=coalesce(v_base#>>'{decisionGate,status}','HOLD');

  v_base:=jsonb_set(v_base,'{boundedPruningEngine}',v_engine,true);
  v_base:=jsonb_set(v_base,'{pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,ledgerPruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,ledgerPruningMaxBatchRows}',coalesce(v_engine->'maxBatchRows','100'::jsonb),true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningImplementationState}','"installed_disabled"'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,boundedPruningEngineInstalled}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningActivationRequiresSeparateMigration}','true'::jsonb,true);
  if v_gate='READY' then
    v_base:=jsonb_set(v_base,'{decisionGate,nextDecisionRequired}','"PRUNING_ACTIVATION_MIGRATION_REQUIRED"'::jsonb,true);
    v_base:=jsonb_set(v_base,'{productionRetentionReadiness,nextDecisionRequired}','"PRUNING_ACTIVATION_MIGRATION_REQUIRED"'::jsonb,true);
    v_base:=jsonb_set(v_base,'{readinessReason}','"PRODUCTION_GATE_READY_ENGINE_INSTALLED_SWITCH_OFF"'::jsonb,true);
  end if;
  return v_base;
end;
$$;

revoke all on function public.get_sync_retention_observability_snapshot() from public,anon,authenticated;
grant execute on function public.get_sync_retention_observability_snapshot() to authenticated,service_role;

comment on table public.sync_ledger_pruning_runtime_policy is
  'R44 server-side bounded pruning control. execution_enabled is deliberately false in R44 and has no authenticated mutation path.';
comment on table public.sync_ledger_pruning_audit_runs is
  'Audit metadata for future bounded result-ledger pruning runs. No operation keys, payloads, or financial amounts are stored.';
comment on function public.get_sync_ledger_pruning_engine_status_r44() is
  'Read-only super-admin status for the R44 bounded pruning engine. R44 keeps execution disabled.';
comment on function public.prune_sync_idempotency_ledger_batch_r44(text,integer) is
  'Internal bounded result-ledger prune engine. R44 grants no execute permission and keeps the runtime switch OFF.';
comment on function public.get_sync_retention_observability_snapshot() is
  'R44 observability includes bounded-pruning engine installation state while preserving Production Gate and pruning switch separation.';

notify pgrst,'reload schema';
commit;

-- P5.13.8.72 R39 — S14 Server-side Replay Enforcement Cutover
-- Scope:
--   * Enforce the R38 90-day replay horizon on the server for Execution + SEA VIBE queue-backed mutations.
--   * Preserve idempotent replay for operation keys already present in their canonical ledgers.
--   * Keep legacy v1 RPCs available for a bounded 90-day cutover grace only; after grace, unknown v1 operations are rejected.
--   * No idempotency-ledger pruning is enabled in this phase.
begin;

create table if not exists public.sync_replay_server_policy (
  policy_key text primary key,
  policy_version text not null,
  replay_horizon_days integer not null check (replay_horizon_days > 0),
  safety_buffer_days integer not null check (safety_buffer_days >= 0),
  activated_at timestamptz not null,
  legacy_v1_accept_until timestamptz not null,
  pruning_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sync_replay_server_policy(
  policy_key,policy_version,replay_horizon_days,safety_buffer_days,
  activated_at,legacy_v1_accept_until,pruning_enabled
)
values(
  'execution_sea_vibe','r38-90d-v1',90,30,
  now(),now()+interval '90 days',false
)
on conflict(policy_key) do nothing;

alter table public.sync_replay_server_policy enable row level security;
revoke all on table public.sync_replay_server_policy from public, anon, authenticated;

create table if not exists public.sync_replay_server_guards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  domain text not null check (domain in ('installation_execution','sea_vibe')),
  operation_key text not null,
  policy_version text not null,
  source_mode text not null check (source_mode in ('v2_anchor','legacy_v1_grace')),
  replay_anchor_at timestamptz not null,
  replay_expires_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id,domain,operation_key),
  check (replay_expires_at >= replay_anchor_at)
);

create index if not exists idx_sync_replay_server_guards_domain_expiry
  on public.sync_replay_server_guards(domain,replay_expires_at);
create index if not exists idx_sync_replay_server_guards_last_seen
  on public.sync_replay_server_guards(last_seen_at desc);

alter table public.sync_replay_server_guards enable row level security;
revoke all on table public.sync_replay_server_guards from public, anon, authenticated;

-- Move the existing canonical business RPCs behind private core names exactly once.
do $$
begin
  if to_regprocedure('public.sync_installation_execution_transition_core_r39(uuid,uuid,text,text,text,timestamptz,text)') is null
     and to_regprocedure('public.sync_installation_execution_transition(uuid,uuid,text,text,text,timestamptz,text)') is not null then
    execute 'alter function public.sync_installation_execution_transition(uuid,uuid,text,text,text,timestamptz,text) rename to sync_installation_execution_transition_core_r39';
  end if;

  if to_regprocedure('public.sync_sea_vibe_mutation_core_r39(text,text,text,uuid,jsonb,timestamptz)') is null
     and to_regprocedure('public.sync_sea_vibe_mutation(text,text,text,uuid,jsonb,timestamptz)') is not null then
    execute 'alter function public.sync_sea_vibe_mutation(text,text,text,uuid,jsonb,timestamptz) rename to sync_sea_vibe_mutation_core_r39';
  end if;

  if to_regprocedure('public.get_sync_retention_observability_snapshot_core_r39()') is null
     and to_regprocedure('public.get_sync_retention_observability_snapshot()') is not null then
    execute 'alter function public.get_sync_retention_observability_snapshot() rename to get_sync_retention_observability_snapshot_core_r39';
  end if;
end $$;

revoke all on function public.sync_installation_execution_transition_core_r39(uuid,uuid,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.sync_sea_vibe_mutation_core_r39(text,text,text,uuid,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.get_sync_retention_observability_snapshot_core_r39() from public, anon, authenticated;

create or replace function public.assert_sync_server_replay_allowed_r39(
  p_domain text,
  p_operation_key text,
  p_replay_anchor_at timestamptz default null,
  p_policy_version text default null,
  p_legacy_v1 boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid := auth.uid();
  v_domain text := lower(trim(coalesce(p_domain,'')));
  v_key text := trim(coalesce(p_operation_key,''));
  v_policy public.sync_replay_server_policy%rowtype;
  v_guard public.sync_replay_server_guards%rowtype;
  v_known_applied boolean := false;
  v_anchor timestamptz;
  v_expiry timestamptz;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if v_domain not in ('installation_execution','sea_vibe') then
    raise exception 'SYNC_REPLAY_DOMAIN_INVALID';
  end if;
  if v_key='' or length(v_key)>300 then
    raise exception 'SYNC_REPLAY_OPERATION_KEY_INVALID';
  end if;

  if v_domain='installation_execution' then
    select exists(
      select 1 from public.installation_execution_sync_operations
      where user_id=actor and operation_key=v_key
    ) into v_known_applied;
  else
    select exists(
      select 1 from public.sea_vibe_sync_operations
      where user_id=actor and operation_key=v_key
    ) into v_known_applied;
  end if;

  -- Already-applied operations remain safely idempotent while their canonical ledger row exists.
  if v_known_applied then
    return jsonb_build_object('ok',true,'knownApplied',true,'serverEnforced',true);
  end if;

  select * into v_policy
  from public.sync_replay_server_policy
  where policy_key='execution_sea_vibe';
  if not found or v_policy.pruning_enabled then
    -- pruning_enabled is intentionally false in R39. A missing/invalid policy must fail closed.
    if not found then raise exception 'SYNC_REPLAY_SERVER_POLICY_MISSING'; end if;
  end if;

  if p_legacy_v1 then
    if now() > v_policy.legacy_v1_accept_until then
      raise exception 'SYNC_CLIENT_REPLAY_POLICY_UPGRADE_REQUIRED';
    end if;
    v_anchor := now();
    v_expiry := v_policy.legacy_v1_accept_until;
  else
    if coalesce(trim(p_policy_version),'') <> v_policy.policy_version then
      raise exception 'SYNC_REPLAY_POLICY_VERSION_REQUIRED';
    end if;
    if p_replay_anchor_at is null then
      raise exception 'SYNC_REPLAY_ANCHOR_REQUIRED';
    end if;
    if p_replay_anchor_at > now() + interval '5 minutes' then
      raise exception 'SYNC_REPLAY_ANCHOR_INVALID';
    end if;
    v_anchor := p_replay_anchor_at;
    v_expiry := p_replay_anchor_at + make_interval(days => v_policy.replay_horizon_days);
  end if;

  insert into public.sync_replay_server_guards(
    user_id,domain,operation_key,policy_version,source_mode,
    replay_anchor_at,replay_expires_at,first_seen_at,last_seen_at
  ) values(
    actor,v_domain,v_key,v_policy.policy_version,
    case when p_legacy_v1 then 'legacy_v1_grace' else 'v2_anchor' end,
    v_anchor,v_expiry,now(),now()
  )
  on conflict(user_id,domain,operation_key) do update
    set last_seen_at=now()
  returning * into v_guard;

  -- The first accepted anchor is pinned server-side; later clients cannot reset the horizon.
  if not p_legacy_v1 and abs(extract(epoch from (v_guard.replay_anchor_at - p_replay_anchor_at))) > 300 then
    raise exception 'SYNC_REPLAY_ANCHOR_MISMATCH';
  end if;

  if now() > v_guard.replay_expires_at then
    raise exception 'SYNC_REPLAY_HORIZON_EXPIRED';
  end if;

  return jsonb_build_object(
    'ok',true,
    'knownApplied',false,
    'serverEnforced',true,
    'policyVersion',v_guard.policy_version,
    'sourceMode',v_guard.source_mode,
    'replayAnchorAt',v_guard.replay_anchor_at,
    'replayExpiresAt',v_guard.replay_expires_at
  );
end;
$$;

revoke all on function public.assert_sync_server_replay_allowed_r39(text,text,timestamptz,text,boolean) from public, anon, authenticated;

-- R39 client path: anchor-aware execution RPC.
create or replace function public.sync_installation_execution_transition_v2(
  p_request_id uuid,
  p_visit_id uuid,
  p_transition text,
  p_operation_key text,
  p_predecessor_operation_key text default null,
  p_base_updated_at timestamptz default null,
  p_notes text default null,
  p_replay_anchor_at timestamptz default null,
  p_replay_policy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.assert_sync_server_replay_allowed_r39(
    'installation_execution',p_operation_key,p_replay_anchor_at,p_replay_policy_version,false
  );
  return public.sync_installation_execution_transition_core_r39(
    p_request_id,p_visit_id,p_transition,p_operation_key,p_predecessor_operation_key,p_base_updated_at,p_notes
  );
end;
$$;

-- Legacy R38-and-earlier client path: bounded global cutover grace.
create or replace function public.sync_installation_execution_transition(
  p_request_id uuid,
  p_visit_id uuid,
  p_transition text,
  p_operation_key text,
  p_predecessor_operation_key text default null,
  p_base_updated_at timestamptz default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.assert_sync_server_replay_allowed_r39(
    'installation_execution',p_operation_key,null,null,true
  );
  return public.sync_installation_execution_transition_core_r39(
    p_request_id,p_visit_id,p_transition,p_operation_key,p_predecessor_operation_key,p_base_updated_at,p_notes
  );
end;
$$;

-- R39 client path: anchor-aware SEA VIBE RPC.
create or replace function public.sync_sea_vibe_mutation_v2(
  p_kind text,
  p_mutation text,
  p_operation_key text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_base_updated_at timestamptz default null,
  p_replay_anchor_at timestamptz default null,
  p_replay_policy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.assert_sync_server_replay_allowed_r39(
    'sea_vibe',p_operation_key,p_replay_anchor_at,p_replay_policy_version,false
  );
  return public.sync_sea_vibe_mutation_core_r39(
    p_kind,p_mutation,p_operation_key,p_entity_id,p_payload,p_base_updated_at
  );
end;
$$;

-- Legacy R38-and-earlier SEA VIBE path: bounded global cutover grace.
create or replace function public.sync_sea_vibe_mutation(
  p_kind text,
  p_mutation text,
  p_operation_key text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.assert_sync_server_replay_allowed_r39(
    'sea_vibe',p_operation_key,null,null,true
  );
  return public.sync_sea_vibe_mutation_core_r39(
    p_kind,p_mutation,p_operation_key,p_entity_id,p_payload,p_base_updated_at
  );
end;
$$;

grant execute on function public.sync_installation_execution_transition_v2(uuid,uuid,text,text,text,timestamptz,text,timestamptz,text) to authenticated;
grant execute on function public.sync_installation_execution_transition(uuid,uuid,text,text,text,timestamptz,text) to authenticated;
grant execute on function public.sync_sea_vibe_mutation_v2(text,text,text,uuid,jsonb,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.sync_sea_vibe_mutation(text,text,text,uuid,jsonb,timestamptz) to authenticated;

-- Wrap R38 observability so S14 server enforcement state is authoritative without changing pruning policy.
create or replace function public.get_sync_retention_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_base jsonb;
  v_policy public.sync_replay_server_policy%rowtype;
  v_now timestamptz := now();
  v_grace_active boolean := false;
  v_guard_rows bigint := 0;
  v_expired_guards bigint := 0;
  v_v2_guards bigint := 0;
  v_legacy_guards bigint := 0;
  v_overall jsonb := '[]'::jsonb;
  v_exec jsonb := '[]'::jsonb;
  v_sea jsonb := '[]'::jsonb;
  v_next text;
begin
  v_base := public.get_sync_retention_observability_snapshot_core_r39();

  select * into v_policy from public.sync_replay_server_policy where policy_key='execution_sea_vibe';
  if not found then
    return v_base;
  end if;

  v_grace_active := v_now <= v_policy.legacy_v1_accept_until;
  select count(*),
         count(*) filter(where replay_expires_at < v_now),
         count(*) filter(where source_mode='v2_anchor'),
         count(*) filter(where source_mode='legacy_v1_grace')
    into v_guard_rows,v_expired_guards,v_v2_guards,v_legacy_guards
    from public.sync_replay_server_guards;

  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_overall
  from jsonb_array_elements(coalesce(v_base#>'{decisionGate,blockers}','[]'::jsonb)) value
  where value <> '"SERVER_REPLAY_ENFORCEMENT_PENDING"'::jsonb;

  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_exec
  from jsonb_array_elements(coalesce(v_base#>'{decisionGate,domains,installationExecution,blockers}','[]'::jsonb)) value
  where value <> '"SERVER_REPLAY_ENFORCEMENT_PENDING"'::jsonb;

  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_sea
  from jsonb_array_elements(coalesce(v_base#>'{decisionGate,domains,seaVibe,blockers}','[]'::jsonb)) value
  where value <> '"SERVER_REPLAY_ENFORCEMENT_PENDING"'::jsonb;

  if v_grace_active then
    v_overall := v_overall || jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE');
    v_exec := v_exec || jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE');
    v_sea := v_sea || jsonb_build_array('SERVER_LEGACY_REPLAY_GRACE_ACTIVE');
    v_next := 'WAIT_SERVER_LEGACY_REPLAY_GRACE';
  else
    v_next := 'DEFINE_FINANCIAL_RETRY_POLICY';
  end if;

  v_base := jsonb_set(v_base,'{readinessReason}','"SERVER_REPLAY_ENFORCEMENT_ACTIVE_PRUNING_STILL_HOLD"'::jsonb,true);
  v_base := jsonb_set(v_base,'{decisionGate,blockers}',v_overall,true);
  v_base := jsonb_set(v_base,'{decisionGate,domains,installationExecution,blockers}',v_exec,true);
  v_base := jsonb_set(v_base,'{decisionGate,domains,seaVibe,blockers}',v_sea,true);
  v_base := jsonb_set(v_base,'{decisionGate,nextDecisionRequired}',to_jsonb(v_next),true);
  v_base := jsonb_set(v_base,'{decisionGate,serverReplayEnforcementEnabled}','true'::jsonb,true);
  v_base := jsonb_set(v_base,'{decisionGate,serverReplayPolicyVersion}',to_jsonb(v_policy.policy_version),true);
  v_base := jsonb_set(v_base,'{decisionGate,serverReplayHorizonDays}',to_jsonb(v_policy.replay_horizon_days),true);
  v_base := jsonb_set(v_base,'{decisionGate,serverReplayEnforcementActivatedAt}',to_jsonb(v_policy.activated_at),true);
  v_base := jsonb_set(v_base,'{decisionGate,legacyV1AcceptUntil}',to_jsonb(v_policy.legacy_v1_accept_until),true);
  v_base := jsonb_set(v_base,'{decisionGate,legacyV1GraceActive}',to_jsonb(v_grace_active),true);
  v_base := jsonb_set(v_base,'{decisionGate,serverReplayGuardRows}',to_jsonb(v_guard_rows),true);
  v_base := jsonb_set(v_base,'{decisionGate,expiredServerReplayGuards}',to_jsonb(v_expired_guards),true);
  v_base := jsonb_set(v_base,'{decisionGate,v2ServerReplayGuards}',to_jsonb(v_v2_guards),true);
  v_base := jsonb_set(v_base,'{decisionGate,legacyServerReplayGuards}',to_jsonb(v_legacy_guards),true);
  v_base := jsonb_set(v_base,'{decisionGate,domains,installationExecution,serverReplayEnforcementEnabled}','true'::jsonb,true);
  v_base := jsonb_set(v_base,'{decisionGate,domains,seaVibe,serverReplayEnforcementEnabled}','true'::jsonb,true);

  -- R39 remains a decision/enforcement phase only. No ledger pruning is enabled here.
  v_base := jsonb_set(v_base,'{pruningEnabled}','false'::jsonb,true);
  v_base := jsonb_set(v_base,'{retentionPolicy,ledgerPruningEnabled}','false'::jsonb,true);
  v_base := jsonb_set(v_base,'{decisionGate,pruningEnabled}','false'::jsonb,true);
  v_base := jsonb_set(v_base,'{decisionGate,status}','"HOLD"'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.get_sync_retention_observability_snapshot() from public, anon, authenticated;
grant execute on function public.get_sync_retention_observability_snapshot() to authenticated, service_role;

comment on table public.sync_replay_server_guards is
  'R39 server-pinned replay horizon guards for Execution and SEA VIBE. These guards are not pruned in R39.';
comment on function public.sync_installation_execution_transition_v2(uuid,uuid,text,text,text,timestamptz,text,timestamptz,text) is
  'R39 anchor-aware execution synchronization. Server pins the first replay anchor and rejects unknown stale replays after 90 days.';
comment on function public.sync_sea_vibe_mutation_v2(text,text,text,uuid,jsonb,timestamptz,timestamptz,text) is
  'R39 anchor-aware SEA VIBE synchronization. Server pins the first replay anchor and rejects unknown stale replays after 90 days.';
comment on function public.get_sync_retention_observability_snapshot() is
  'R39 super-admin retention observability with active server-side replay enforcement and bounded legacy-v1 cutover grace. Ledger pruning remains disabled.';

commit;

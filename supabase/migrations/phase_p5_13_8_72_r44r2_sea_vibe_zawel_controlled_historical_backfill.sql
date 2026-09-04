-- PETATOE P5.13.8.72 R44R2 — SEA VIBE controlled historical Zawel ledger backfill
-- Production evidence approved for this one-time repair (R44R1 dry-run, 2026-09-04):
--   * Exactly 6 MISSING_LEDGER trips: SV-2026-000001 .. SV-2026-000006.
--   * Required historical deduction: 2700 points.
--   * Current observed balance before this migration was 3575 points.
--   * Projected balance was 875 points; anomalyCount=0.
-- Safety model:
--   * Fail closed unless the R44R1 reconciliation gate is still READY at execution time.
--   * Fail closed unless the exact six audited Production candidates still match their IDs,
--     serials, people counts, durations, canonical point values, permit amounts and missing-ledger state.
--   * Lock involved tables for the short repair transaction so the verified snapshot cannot drift.
--   * Insert exactly one historical `permit` ledger baseline per approved trip; no UPDATE/DELETE.
--   * Re-run R44R1 reconciliation after the inserts and roll back unless all candidates converge to OK.
--   * Does not change the canonical SEA VIBE trigger/function, RLS, grants, shared sync engines or R44 pruning.

begin;

do $$
declare
  v_preview jsonb;
  v_after_preview jsonb;
  v_balance_before bigint;
  v_balance_after bigint;
  v_exact_matches integer:=0;
  v_inserted integer:=0;
  v_required_points constant bigint:=2700;
  v_expected_count constant integer:=6;
begin
  if to_regprocedure('public.get_sea_vibe_zawel_reconciliation_preview_r44r1()') is null then
    raise exception 'SEA_VIBE_R44R2_R44R1_PREVIEW_REQUIRED';
  end if;

  -- Freeze the financial/reference snapshot for this bounded one-time repair.
  lock table public.sea_vibe_zawel_transactions in share row exclusive mode;
  lock table public.sea_vibe_trips in share mode;
  lock table public.sea_vibe_sailing_permit_fees in share mode;
  lock table public.sea_vibe_expenses in share mode;

  select public.get_sea_vibe_zawel_reconciliation_preview_r44r1()
    into v_preview;

  if coalesce((v_preview->>'ok')::boolean,false) is not true then
    raise exception 'SEA_VIBE_R44R2_PREVIEW_NOT_OK';
  end if;
  if coalesce(v_preview->>'repairGate','') <> 'READY_FOR_SEPARATE_CONTROLLED_BACKFILL_PHASE' then
    raise exception 'SEA_VIBE_R44R2_GATE_NOT_READY: %', coalesce(v_preview->>'repairGate','NULL');
  end if;
  if coalesce((v_preview->>'anomalyCount')::bigint,-1) <> 0 then
    raise exception 'SEA_VIBE_R44R2_ANOMALIES_PRESENT';
  end if;
  if coalesce((v_preview->>'missingLedgerCandidateCount')::integer,-1) <> v_expected_count then
    raise exception 'SEA_VIBE_R44R2_UNEXPECTED_CANDIDATE_COUNT: %', v_preview->>'missingLedgerCandidateCount';
  end if;
  if coalesce((v_preview->>'requiredHistoricalDeductionPoints')::bigint,-1) <> v_required_points then
    raise exception 'SEA_VIBE_R44R2_UNEXPECTED_REQUIRED_POINTS: %', v_preview->>'requiredHistoricalDeductionPoints';
  end if;
  if coalesce((v_preview->>'projectedBalanceWouldBeNegative')::boolean,true) then
    raise exception 'SEA_VIBE_R44R2_PROJECTED_NEGATIVE_BALANCE';
  end if;

  v_balance_before:=coalesce((v_preview->>'currentBalancePoints')::bigint,0);
  if v_balance_before < v_required_points then
    raise exception 'SEA_VIBE_R44R2_INSUFFICIENT_POINTS: balance %, required %', v_balance_before, v_required_points;
  end if;

  -- Exact Production candidate set captured by the approved R44R1 dry-run.
  with expected(
    trip_id,trip_serial,people_count,duration_hours,expected_points,expected_fee_amount
  ) as (values
    ('d438d2a3-9e08-40e7-8557-b4e6eb917982'::uuid,'SV-2026-000001'::text,6,6,450,103.50::numeric),
    ('50a64d86-d2b9-4131-9bfa-4845134956e2'::uuid,'SV-2026-000002'::text,6,6,450,103.50::numeric),
    ('a712a0af-31ee-43cc-b67b-7bba3bce03c1'::uuid,'SV-2026-000003'::text,5,6,375,86.25::numeric),
    ('d1c554e2-108a-4e01-b771-63a00b5fcf2d'::uuid,'SV-2026-000004'::text,8,8,600,138.00::numeric),
    ('0aa83388-5ed7-4600-bc45-aaa8a8c54b37'::uuid,'SV-2026-000005'::text,7,8,525,120.75::numeric),
    ('1ab1f8f7-c5e0-4fa6-94e4-b65de0f13b04'::uuid,'SV-2026-000006'::text,4,8,300,69.00::numeric)
  )
  select count(*)::integer
    into v_exact_matches
  from expected x
  join public.sea_vibe_trips t
    on t.id=x.trip_id
   and t.trip_serial=x.trip_serial
   and t.people_count=x.people_count
   and t.duration_hours=x.duration_hours
  join public.sea_vibe_sailing_permit_fees f
    on f.people_count=t.people_count
   and f.duration_hours=least(greatest(t.duration_hours,1),5)
   and f.points=x.expected_points
   and abs(f.fee_amount-x.expected_fee_amount)<=0.01
  join public.sea_vibe_expenses e
    on e.trip_id=t.id
   and e.system_key='sailing_permit'
   and abs(e.amount-x.expected_fee_amount)<=0.01
  where not exists (
    select 1
    from public.sea_vibe_zawel_transactions z
    where z.trip_id=t.id
      and z.transaction_type in ('permit','permit_adjustment')
  );

  if v_exact_matches <> v_expected_count then
    raise exception 'SEA_VIBE_R44R2_EXACT_CANDIDATE_MISMATCH: matched %, expected %', v_exact_matches, v_expected_count;
  end if;

  with expected(trip_id,trip_serial,expected_points,expected_fee_amount) as (values
    ('d438d2a3-9e08-40e7-8557-b4e6eb917982'::uuid,'SV-2026-000001'::text,450,103.50::numeric),
    ('50a64d86-d2b9-4131-9bfa-4845134956e2'::uuid,'SV-2026-000002'::text,450,103.50::numeric),
    ('a712a0af-31ee-43cc-b67b-7bba3bce03c1'::uuid,'SV-2026-000003'::text,375,86.25::numeric),
    ('d1c554e2-108a-4e01-b771-63a00b5fcf2d'::uuid,'SV-2026-000004'::text,600,138.00::numeric),
    ('0aa83388-5ed7-4600-bc45-aaa8a8c54b37'::uuid,'SV-2026-000005'::text,525,120.75::numeric),
    ('1ab1f8f7-c5e0-4fa6-94e4-b65de0f13b04'::uuid,'SV-2026-000006'::text,300,69.00::numeric)
  )
  insert into public.sea_vibe_zawel_transactions(
    transaction_type,points_delta,cash_amount,trip_id,reference,notes,transaction_date,created_by
  )
  select
    'permit',
    -f.points,
    f.fee_amount,
    t.id,
    t.trip_serial,
    'رسوم تصريح الإبحار — تسوية تاريخية R44R2',
    t.trip_date,
    coalesce(t.created_by,e.created_by)
  from expected x
  join public.sea_vibe_trips t
    on t.id=x.trip_id
   and t.trip_serial=x.trip_serial
  join public.sea_vibe_sailing_permit_fees f
    on f.people_count=t.people_count
   and f.duration_hours=least(greatest(t.duration_hours,1),5)
   and f.points=x.expected_points
   and abs(f.fee_amount-x.expected_fee_amount)<=0.01
  join public.sea_vibe_expenses e
    on e.trip_id=t.id
   and e.system_key='sailing_permit'
   and abs(e.amount-x.expected_fee_amount)<=0.01
  where not exists (
    select 1
    from public.sea_vibe_zawel_transactions z
    where z.trip_id=t.id
      and z.transaction_type in ('permit','permit_adjustment')
  )
  order by t.trip_date,t.trip_serial;

  get diagnostics v_inserted = row_count;
  if v_inserted <> v_expected_count then
    raise exception 'SEA_VIBE_R44R2_INSERT_COUNT_MISMATCH: inserted %, expected %', v_inserted, v_expected_count;
  end if;

  select public.get_sea_vibe_zawel_reconciliation_preview_r44r1()
    into v_after_preview;

  if coalesce((v_after_preview->>'anomalyCount')::bigint,-1) <> 0
     or coalesce((v_after_preview->>'missingLedgerCandidateCount')::integer,-1) <> 0
     or coalesce((v_after_preview->>'requiredHistoricalDeductionPoints')::bigint,-1) <> 0
     or coalesce(v_after_preview->>'repairGate','') <> 'NO_REPAIR_NEEDED' then
    raise exception 'SEA_VIBE_R44R2_POST_RECONCILIATION_FAILED: %', v_after_preview;
  end if;

  v_balance_after:=coalesce((v_after_preview->>'currentBalancePoints')::bigint,0);
  if v_balance_after <> v_balance_before-v_required_points then
    raise exception 'SEA_VIBE_R44R2_BALANCE_MISMATCH: before %, after %, expected_after %',
      v_balance_before,v_balance_after,v_balance_before-v_required_points;
  end if;
end;
$$;

commit;

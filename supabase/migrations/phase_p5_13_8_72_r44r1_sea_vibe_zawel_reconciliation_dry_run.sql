-- PETATOE P5.13.8.72 R44R1 — SEA VIBE historical Zawel reconciliation dry-run
-- Scope:
--   * Diagnose historical trips whose canonical sailing-permit expense exists but whose Zawel ledger baseline is missing.
--   * Calculate the exact candidate deduction points and projected wallet balance without changing production data.
--   * Flag reference/expense/ledger anomalies separately so a later repair phase can remain fail-closed.
--   * Install NO backfill/apply function, NO trigger change, NO automatic write, and NO DELETE.
--   * Keep R44 pruning engine and Production Retention Gate completely untouched.

begin;

create or replace function public.get_sea_vibe_zawel_reconciliation_preview_r44r1()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz:=now();
  v_balance bigint:=0;
  v_trip_count bigint:=0;
  v_candidate_count bigint:=0;
  v_required_points bigint:=0;
  v_projected_balance bigint:=0;
  v_reference_missing_count bigint:=0;
  v_expense_missing_count bigint:=0;
  v_expense_mismatch_count bigint:=0;
  v_adjustment_without_baseline_count bigint:=0;
  v_duplicate_baseline_count bigint:=0;
  v_ledger_mismatch_count bigint:=0;
  v_anomaly_count bigint:=0;
  v_candidates jsonb:='[]'::jsonb;
  v_anomalies jsonb:='[]'::jsonb;
begin
  select coalesce(sum(points_delta),0)::bigint
    into v_balance
  from public.sea_vibe_zawel_transactions;

  with trip_state as (
    select
      t.id as trip_id,
      t.trip_serial,
      t.trip_date,
      t.people_count,
      t.duration_hours,
      least(greatest(t.duration_hours,1),5) as tariff_duration_hours,
      f.points as expected_points,
      f.fee_amount as expected_fee_amount,
      e.id as permit_expense_id,
      e.amount as permit_expense_amount,
      count(z.id) filter (where z.transaction_type='permit')::integer as permit_rows,
      count(z.id) filter (where z.transaction_type='permit_adjustment')::integer as adjustment_rows,
      coalesce(sum(z.points_delta) filter (
        where z.transaction_type in ('permit','permit_adjustment')
      ),0)::bigint as ledger_points_delta
    from public.sea_vibe_trips t
    left join public.sea_vibe_sailing_permit_fees f
      on f.people_count=t.people_count
     and f.duration_hours=least(greatest(t.duration_hours,1),5)
    left join public.sea_vibe_expenses e
      on e.trip_id=t.id
     and e.system_key='sailing_permit'
    left join public.sea_vibe_zawel_transactions z
      on z.trip_id=t.id
     and z.transaction_type in ('permit','permit_adjustment')
    group by
      t.id,t.trip_serial,t.trip_date,t.people_count,t.duration_hours,
      f.points,f.fee_amount,e.id,e.amount
  ), classified as (
    select
      s.*,
      case
        when s.expected_points is null or s.expected_fee_amount is null then 'REFERENCE_MISSING'
        when s.permit_expense_id is null then 'PERMIT_EXPENSE_MISSING'
        when abs(s.permit_expense_amount-s.expected_fee_amount)>0.01 then 'PERMIT_EXPENSE_MISMATCH'
        when s.permit_rows=0 and s.adjustment_rows>0 then 'ADJUSTMENT_WITHOUT_BASELINE'
        when s.permit_rows=0 and s.adjustment_rows=0 and s.expected_points>0 then 'MISSING_LEDGER'
        when s.permit_rows>1 then 'DUPLICATE_PERMIT_BASELINE'
        when s.permit_rows=1
             and s.ledger_points_delta <> (0-s.expected_points)::bigint then 'LEDGER_POINTS_MISMATCH'
        else 'OK'
      end as diagnosis
    from trip_state s
  )
  select
    count(*)::bigint,
    count(*) filter (where diagnosis='MISSING_LEDGER')::bigint,
    coalesce(sum(expected_points) filter (where diagnosis='MISSING_LEDGER'),0)::bigint,
    count(*) filter (where diagnosis='REFERENCE_MISSING')::bigint,
    count(*) filter (where diagnosis='PERMIT_EXPENSE_MISSING')::bigint,
    count(*) filter (where diagnosis='PERMIT_EXPENSE_MISMATCH')::bigint,
    count(*) filter (where diagnosis='ADJUSTMENT_WITHOUT_BASELINE')::bigint,
    count(*) filter (where diagnosis='DUPLICATE_PERMIT_BASELINE')::bigint,
    count(*) filter (where diagnosis='LEDGER_POINTS_MISMATCH')::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'tripId',trip_id,
          'tripSerial',trip_serial,
          'tripDate',trip_date,
          'peopleCount',people_count,
          'durationHours',duration_hours,
          'tariffDurationHours',tariff_duration_hours,
          'expectedPoints',expected_points,
          'expectedFeeAmount',expected_fee_amount,
          'permitExpenseAmount',permit_expense_amount,
          'ledgerPointsDelta',ledger_points_delta,
          'diagnosis',diagnosis
        ) order by trip_date,trip_serial
      ) filter (where diagnosis='MISSING_LEDGER'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'tripId',trip_id,
          'tripSerial',trip_serial,
          'tripDate',trip_date,
          'peopleCount',people_count,
          'durationHours',duration_hours,
          'expectedPoints',expected_points,
          'expectedFeeAmount',expected_fee_amount,
          'permitExpenseAmount',permit_expense_amount,
          'permitRows',permit_rows,
          'adjustmentRows',adjustment_rows,
          'ledgerPointsDelta',ledger_points_delta,
          'diagnosis',diagnosis
        ) order by trip_date,trip_serial
      ) filter (where diagnosis not in ('OK','MISSING_LEDGER')),
      '[]'::jsonb
    )
  into
    v_trip_count,
    v_candidate_count,
    v_required_points,
    v_reference_missing_count,
    v_expense_missing_count,
    v_expense_mismatch_count,
    v_adjustment_without_baseline_count,
    v_duplicate_baseline_count,
    v_ledger_mismatch_count,
    v_candidates,
    v_anomalies
  from classified;

  v_projected_balance:=v_balance-v_required_points;
  v_anomaly_count:=
      v_reference_missing_count
    + v_expense_missing_count
    + v_expense_mismatch_count
    + v_adjustment_without_baseline_count
    + v_duplicate_baseline_count
    + v_ledger_mismatch_count;

  return jsonb_build_object(
    'ok',true,
    'phase','R44R1',
    'mode','dry_run_only',
    'serverTime',v_now,
    'productionWritesPerformed',false,
    'applyFunctionInstalled',false,
    'triggerChanged',false,
    'pruningChanged',false,
    'tripCount',v_trip_count,
    'currentBalancePoints',v_balance,
    'missingLedgerCandidateCount',v_candidate_count,
    'requiredHistoricalDeductionPoints',v_required_points,
    'projectedBalancePoints',v_projected_balance,
    'projectedBalanceWouldBeNegative',v_projected_balance<0,
    'anomalyCount',v_anomaly_count,
    'anomalyBreakdown',jsonb_build_object(
      'referenceMissing',v_reference_missing_count,
      'permitExpenseMissing',v_expense_missing_count,
      'permitExpenseMismatch',v_expense_mismatch_count,
      'adjustmentWithoutBaseline',v_adjustment_without_baseline_count,
      'duplicatePermitBaseline',v_duplicate_baseline_count,
      'ledgerPointsMismatch',v_ledger_mismatch_count
    ),
    'repairGate',case
      when v_anomaly_count>0 then 'HOLD_DATA_ANOMALIES'
      when v_candidate_count=0 then 'NO_REPAIR_NEEDED'
      when v_projected_balance<0 then 'HOLD_PROJECTED_NEGATIVE_BALANCE'
      else 'READY_FOR_SEPARATE_CONTROLLED_BACKFILL_PHASE'
    end,
    'candidateTrips',v_candidates,
    'blockedAnomalies',v_anomalies,
    'nextStep',case
      when v_anomaly_count>0 then 'REVIEW_BLOCKED_ANOMALIES'
      when v_candidate_count=0 then 'NO_ACTION'
      when v_projected_balance<0 then 'REVIEW_NEGATIVE_BALANCE_BEFORE_BACKFILL'
      else 'SEPARATE_R44R2_BACKFILL_MIGRATION_REQUIRED'
    end
  );
end;
$$;

-- Owner/SQL-editor diagnostic only. Do not expose financial reconciliation diagnostics to app roles.
revoke all on function public.get_sea_vibe_zawel_reconciliation_preview_r44r1()
  from public,anon,authenticated,service_role;

comment on function public.get_sea_vibe_zawel_reconciliation_preview_r44r1() is
  'R44R1 read-only historical SEA VIBE Zawel reconciliation preview. Installs no repair/apply path and performs no production data writes.';

commit;

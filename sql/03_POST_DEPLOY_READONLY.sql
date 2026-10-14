-- SEA VIBE R1: READ ONLY POST-GATE, run after controlled deployment
SELECT data_type,numeric_precision,numeric_scale FROM information_schema.columns
WHERE table_schema='public' AND table_name='sea_vibe_trips' AND column_name='duration_hours';
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.sea_vibe_trips'::regclass
AND conname IN ('sea_vibe_trips_duration_hours_check','sea_vibe_trips_khor_one_person_r1');
SELECT count(*) AS legacy_rows, coalesce(sum(total_value),0) AS gross,
 coalesce(sum(trip_expenses),0) AS expenses, coalesce(sum(net_profit),0) AS profit
FROM public.sea_vibe_trip_financials;
SELECT count(*) AS permit_expenses,coalesce(sum(amount),0) AS permit_total
FROM public.sea_vibe_expenses WHERE system_key='sailing_permit';
SELECT count(*) AS permit_ledger_entries,coalesce(sum(points_delta),0) AS permit_points_delta
FROM public.sea_vibe_zawel_transactions WHERE transaction_type IN ('permit','permit_adjustment');
SELECT (pg_get_functiondef('public.sync_sea_vibe_mutation_core_r39(text,text,text,uuid,jsonb,timestamp with time zone)'::regprocedure)
 LIKE '%durationHours%' ) AS sync_function_present,
 (pg_get_functiondef('public.sea_vibe_sync_permit_expense()'::regprocedure)
 LIKE '%SEA_VIBE_TRIP_TYPE_PERMIT_BOUNDARY_CHANGE_REQUIRES_SEPARATE_REVIEW%') AS permit_boundary_guard_present,
 (pg_get_functiondef('public.get_sea_vibe_zawel_reconciliation_preview_r44r1()'::regprocedure)
 LIKE '%where t.trip_type_id <>%') AS zawel_khor_exclusion_present;

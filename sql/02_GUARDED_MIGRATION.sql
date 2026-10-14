-- SEA VIBE R1.1 — guarded transactional migration. RUN ONLY AFTER DATABASE BACKUP AND REVIEW.
-- IMPORTANT: Releases must apply SQL before frontend and then verify live.
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='90s';

-- snapshot view SQL and explicit GRANTs before ALTER TYPE, keep in transaction
CREATE TEMP TABLE sv_r1_view_snapshot ON COMMIT DROP AS
SELECT pg_get_viewdef('public.sea_vibe_trip_financials'::regclass,true) AS definition;
CREATE TEMP TABLE sv_r1_view_grants ON COMMIT DROP AS
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges,
       bool_or(is_grantable='YES') AS grant_option
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='sea_vibe_trip_financials'
GROUP BY grantee;

DO $gate$
DECLARE v_dep_count integer; v_cast_count integer; v_def text; v_match_count integer;
BEGIN
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sea_vibe_trips' AND column_name='duration_hours') <> 'integer' THEN
    RAISE EXCEPTION 'SV_R1_HOLD: duration column drift'; END IF;
 IF (SELECT count(*) FROM public.sea_vibe_trips) <> 20 THEN
    RAISE EXCEPTION 'SV_R1_HOLD: legacy trip count changed; re-baseline required'; END IF;
 IF EXISTS (SELECT 1 FROM public.sea_vibe_trips WHERE trip_type_id='36e3498c-7acd-4074-beae-3a4259152110'::uuid) THEN
    RAISE EXCEPTION 'SV_R1_HOLD: khor legacy trips exist'; END IF;
 SELECT count(*) INTO v_dep_count FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
 JOIN pg_class c ON c.oid=r.ev_class
 WHERE d.refobjid='public.sea_vibe_trips'::regclass
 AND d.refobjsubid=(SELECT attnum FROM pg_attribute WHERE attrelid='public.sea_vibe_trips'::regclass AND attname='duration_hours')
 AND c.oid <> 'public.sea_vibe_trips'::regclass AND c.oid <> 'public.sea_vibe_trip_financials'::regclass;
 IF v_dep_count > 0 THEN RAISE EXCEPTION 'SV_R1_HOLD: additional duration view dependencies %',v_dep_count; END IF;
 v_def:=pg_get_functiondef('public.sync_sea_vibe_mutation_core_r39(text,text,text,uuid,jsonb,timestamp with time zone)'::regprocedure);
 v_cast_count:=(length(v_def)-length(replace(v_def, 'coalesce((p_payload->>''durationHours'')::integer,0)', '')))/length('coalesce((p_payload->>''durationHours'')::integer,0)');
 IF v_cast_count<>3 THEN RAISE EXCEPTION 'SV_R1_HOLD: unexpected duration cast count %', v_cast_count; END IF;
 v_def:=pg_get_functiondef('public.sea_vibe_sync_permit_expense()'::regprocedure);
 IF md5(v_def) <> '166a8e949bc7fb00deabe8eacb373ec0' THEN RAISE EXCEPTION 'SV_R1_HOLD: permit trigger function hash drift'; END IF;
 SELECT count(*) INTO v_match_count FROM regexp_matches(v_def, '(begin[[:space:]]+)(v_duration[[:space:]]*:=)', 'gi');
 IF v_match_count<>1 THEN RAISE EXCEPTION 'SV_R1_HOLD: permit insertion anchor count %',v_match_count; END IF;
 v_def:=pg_get_functiondef('public.get_sea_vibe_zawel_reconciliation_preview_r44r1()'::regprocedure);
 SELECT count(*) INTO v_match_count FROM regexp_matches(v_def, 'group[[:space:]]+by[[:space:]]+t[.]id[[:space:]]*,', 'gi');
 IF v_match_count<>1 OR position('from public.sea_vibe_trips t' IN v_def)=0 THEN
   RAISE EXCEPTION 'SV_R1_HOLD: Zawel preview anchor or source drift'; END IF;
END $gate$;

DROP VIEW public.sea_vibe_trip_financials; -- no CASCADE; fails safely on unexpected dependencies
ALTER TABLE public.sea_vibe_trips DROP CONSTRAINT sea_vibe_trips_duration_hours_check;
ALTER TABLE public.sea_vibe_trips ALTER COLUMN duration_hours TYPE numeric(4,1) USING duration_hours::numeric(4,1);
ALTER TABLE public.sea_vibe_trips ADD CONSTRAINT sea_vibe_trips_duration_hours_check
CHECK (
 (trip_type_id='36e3498c-7acd-4074-beae-3a4259152110'::uuid AND duration_hours IN (0.5,1,2))
 OR
 (trip_type_id<>'36e3498c-7acd-4074-beae-3a4259152110'::uuid AND duration_hours>=1 AND duration_hours<=12 AND duration_hours=trunc(duration_hours))
);
ALTER TABLE public.sea_vibe_trips ADD CONSTRAINT sea_vibe_trips_khor_one_person_r1
CHECK (trip_type_id<>'36e3498c-7acd-4074-beae-3a4259152110'::uuid OR people_count=1);

DO $view_restore$
DECLARE v_sql text; v_row record;
BEGIN
 SELECT definition INTO v_sql FROM sv_r1_view_snapshot;
 EXECUTE 'CREATE VIEW public.sea_vibe_trip_financials AS ' || v_sql;
 FOR v_row IN SELECT * FROM sv_r1_view_grants LOOP
   EXECUTE format('GRANT %s ON public.sea_vibe_trip_financials TO %I%s',
      v_row.privileges, v_row.grantee, CASE WHEN v_row.grant_option THEN ' WITH GRANT OPTION' ELSE '' END);
 END LOOP;
END $view_restore$;

DO $rewrite$
DECLARE v_fn text; v_old text; v_new text;
BEGIN
 v_fn:=pg_get_functiondef('public.sync_sea_vibe_mutation_core_r39(text,text,text,uuid,jsonb,timestamp with time zone)'::regprocedure);
 v_old:='coalesce((p_payload->>''durationHours'')::integer,0)';
 v_new:='coalesce((p_payload->>''durationHours'')::numeric,0)';
 EXECUTE replace(v_fn,v_old,v_new);

 v_fn:=pg_get_functiondef('public.sea_vibe_sync_permit_expense()'::regprocedure);
 -- R1.1: single anchored insert after BEGIN; do not depend on indentation/newline exactness.
 v_new:='  -- R1.1: no permit for Khor; block permit-boundary type changes.' || chr(10) ||
 '  if tg_op=''UPDATE'' and ((old.trip_type_id=''36e3498c-7acd-4074-beae-3a4259152110''::uuid) is distinct from (new.trip_type_id=''36e3498c-7acd-4074-beae-3a4259152110''::uuid)) then' || chr(10) ||
 '    raise exception ''SEA_VIBE_TRIP_TYPE_PERMIT_BOUNDARY_CHANGE_REQUIRES_SEPARATE_REVIEW'';' || chr(10) ||
 '  end if;' || chr(10) ||
 '  if new.trip_type_id=''36e3498c-7acd-4074-beae-3a4259152110''::uuid then return new; end if;' || chr(10);
 v_fn:=regexp_replace(v_fn,
   '(begin[[:space:]]+)(v_duration[[:space:]]*:=)',
   E'\\1' || v_new || E'\\2', 'i');
 IF position('SEA_VIBE_TRIP_TYPE_PERMIT_BOUNDARY_CHANGE_REQUIRES_SEPARATE_REVIEW' IN v_fn)=0 THEN
   RAISE EXCEPTION 'SV_R11_HOLD: permit function injection missing'; END IF;
 EXECUTE v_fn;

 v_fn:=pg_get_functiondef('public.get_sea_vibe_zawel_reconciliation_preview_r44r1()'::regprocedure);
 v_new:='where t.trip_type_id <> ''36e3498c-7acd-4074-beae-3a4259152110''::uuid' || chr(10) || '    ';
 v_fn:=regexp_replace(v_fn,
   '(group[[:space:]]+by[[:space:]]+t[.]id[[:space:]]*,)',
   v_new || E'\\1', 'i');
 IF position('where t.trip_type_id <>' IN v_fn)=0 THEN
   RAISE EXCEPTION 'SV_R11_HOLD: Zawel Khor exclusion missing'; END IF;
 EXECUTE v_fn;
END $rewrite$;

-- Re-fire permit trigger when type changes, ensuring boundary safeguard above runs.
DROP TRIGGER trg_sea_vibe_trip_permit_expense ON public.sea_vibe_trips;
CREATE TRIGGER trg_sea_vibe_trip_permit_expense
AFTER INSERT OR UPDATE OF trip_date,duration_hours,people_count,trip_type_id
ON public.sea_vibe_trips FOR EACH ROW EXECUTE FUNCTION public.sea_vibe_sync_permit_expense();

DO $post$
BEGIN
 IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sea_vibe_trips' AND column_name='duration_hours') <> 'numeric' THEN
   RAISE EXCEPTION 'SV_R1_VERIFY_FAILED: duration type'; END IF;
 IF (SELECT count(*) FROM public.sea_vibe_trips)<>20 THEN RAISE EXCEPTION 'SV_R1_VERIFY_FAILED: historical trip count'; END IF;
 IF EXISTS (SELECT 1 FROM public.sea_vibe_trips WHERE duration_hours<>trunc(duration_hours)) THEN
   RAISE EXCEPTION 'SV_R1_VERIFY_FAILED: legacy duration changed'; END IF;
 IF position('SEA_VIBE_TRIP_TYPE_PERMIT_BOUNDARY_CHANGE_REQUIRES_SEPARATE_REVIEW' IN pg_get_functiondef('public.sea_vibe_sync_permit_expense()'::regprocedure))=0 THEN
   RAISE EXCEPTION 'SV_R11_VERIFY_FAILED: permit boundary guard missing'; END IF;
 IF position('where t.trip_type_id <>' IN pg_get_functiondef('public.get_sea_vibe_zawel_reconciliation_preview_r44r1()'::regprocedure))=0 THEN
   RAISE EXCEPTION 'SV_R11_VERIFY_FAILED: Zawel Khor exclusion missing'; END IF;
 IF (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='sea_vibe_trip_financials')
   < (SELECT count(*) FROM sv_r1_view_grants) THEN RAISE EXCEPTION 'SV_R1_VERIFY_FAILED: view grants'; END IF;
END $post$;
COMMIT;

import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const service=read('assets/js/installations-service.js');
const migration=read('supabase/migrations/phase_m15_11_1_execution_visit_canonicalization.sql');
const verification=read('supabase/verification/phase_m15_11_1_execution_visit_canonicalization_verification.sql');
const checks=[
  ['single-day scheduling uses canonical visit RPC',service.includes("rpc('schedule_installation_request_visit'")],
  ['legacy direct single-day request update removed',!service.includes("const record={scheduled_date:payload.scheduledDate,scheduled_time:payload.scheduledTime")],
  ['no-visit execution fallback does not expose parent timeline',service.includes("visitSyncMissing:true")&&service.includes("onRouteAt:''")],
  ['migration materializes missing visits',migration.includes('Materialize a canonical visit')&&migration.includes('not exists (')],
  ['migration copies request services to visit',migration.includes('installation_execution_visit_services')&&migration.includes('scheduled_quantity')],
  ['progressed legacy current selection migrates to visit',migration.includes('selected_requests as')&&migration.includes('r.on_route_at is not null')&&migration.includes('selected_for_execution_at=coalesce')],
  ['not-started legacy selections are released to today list',migration.includes('selected-but-not-started legacy request')&&migration.includes('set selected_for_execution_at=null')],
  ['parent current selection is cleared',migration.includes('selected_for_execution_at=null')&&migration.includes('selected_for_execution_by=null')],
  ['multi-day ambiguous selection is rejected',migration.includes('حدد زيارة التنفيذ المطلوبة لهذا الطلب متعدد الأيام')],
  ['visit completion no longer completes parent request',migration.includes("set status='قيد التنفيذ',")&&migration.includes('completed_at=null')],
  ['verification checks zero missing visits',verification.includes('active_scheduled_requests_without_visit')],
  ['verification checks parent selection cleanup',verification.includes('legacy_parent_current_selections')],
  ['incident requests included in verification',verification.includes('INS-2026-000021')&&verification.includes('INS-2026-000028')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`${checks.length-failed}/${checks.length} checks passed`);if(failed)process.exit(1);

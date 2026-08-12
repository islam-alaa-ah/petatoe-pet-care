import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const app = read('assets/js/app.js');
const perf = read('assets/js/daily-performance-service.js');
const ops = read('assets/js/daily-operations-service.js');
const migration = read('supabase/migrations/phase_p5_11_5_daily_operations_permission_owned_visibility.sql');

const checks = [
  ['daily operations rows are no longer representative scoped', /function dailyScopedRows\(rows\)\s*\{\s*return rows \|\| \[\];\s*\}/s.test(app)],
  ['daily operations loads dedicated permission-owned snapshot', /listPermissionOwnedCrmData\([\s\S]*screenKey:\s*"dailyOperations"/m.test(app)],
  ['daily service uses permission-owned CRM RPC', /get_daily_permission_owned_crm_snapshot/.test(ops)],
  ['daily report uses permission-owned snapshot', /screenKey:\s*"dailyPerformanceReport"/.test(perf) && /listPermissionOwnedCrmData/.test(perf)],
  ['daily report attributes activity by creator user only', /return Boolean\(employee\.userId && row\.createdBy === employee\.userId\)/.test(perf)],
  ['daily checklist completion is user-owned not representative-owned', !/item\.representative_id === employee\.representativeId/.test(perf)],
  ['orphan representative pseudo employees removed', !/key:\s*`rep:\$\{rep\.id\}`/.test(perf)],
  ['daily task read policy is screen permission owned', /daily task completions select[\s\S]*has_screen_permission\('dailyOperations','view'\)[\s\S]*has_screen_permission\('dailyPerformanceReport','view'\)/.test(migration)],
  ['daily alerts read policy has no representative scope gate', /daily alerts read[\s\S]*has_screen_permission\('dailyAlertsManagement','view'\)/.test(migration) && !/daily alerts read[\s\S]{0,500}can_access_representative/.test(migration)],
  ['suggestion generation no longer requires linked representative', !/v_linked_representative_id/.test(migration) && /Permission denied: dailyOperations\.view/.test(migration)],
  ['daily alert targets use created_by user ownership', /c\.created_by = v_user\.id/.test(migration) && /f\.created_by = v_user\.id/.test(migration) && /q\.created_by = v_user\.id/.test(migration)],
  ['core CRM RLS is not modified by this phase', !/create policy[^;]*(customers|customer_followups|quotations)/is.test(migration)]
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${checks.length} PASS`);
if (pass !== checks.length) process.exit(1);

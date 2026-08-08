import fs from 'node:fs';
const service=fs.readFileSync('assets/js/installations-service.js','utf8');
const scheduling=fs.readFileSync('assets/js/installation-scheduling.js','utf8');
const migration=fs.readFileSync('supabase/migrations/phase_m14_9_8_8_scheduling_global_readonly_visibility.sql','utf8');
const checks=[
  ['global schedule RPC is used',service.includes("rpc('get_installation_schedule_global')")],
  ['row operation scope is returned',service.includes('canOperate:r.can_operate===true')],
  ['out-of-scope open is disabled',scheduling.includes("${canOperate?'':'disabled aria-disabled=\\\"true\\\"'}")||scheduling.includes("${canOperate?'':'disabled aria-disabled=\"true\"'}")],
  ['read-only guidance is rendered',scheduling.includes('هذا الموعد للعرض فقط ولا تملك صلاحية فتح الطلب أو تعديله')],
  ['pending table respects operation scope',scheduling.includes("r.canOperate===true&&canEditSchedule()")],
  ['global RPC requires schedule view',migration.includes("has_screen_permission('installationSchedule','view')")],
  ['global RPC preserves operation boundary',migration.includes("'can_operate', public.can_access_installation_representative")],
  ['RPC is security definer',/security definer/i.test(migration)]
];
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)process.exitCode=1}

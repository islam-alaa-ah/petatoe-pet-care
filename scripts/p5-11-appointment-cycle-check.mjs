import fs from 'node:fs';
const read = (p) => fs.readFileSync(p,'utf8');
const svc = read('assets/js/installations-service.js');
const sched = read('assets/js/installation-scheduling.js');
const html = read('index.html');
const sql = read('supabase/migrations/phase_p5_11_appointment_cycle_deep_recovery.sql');
const execution = read('assets/js/installation-execution.js');
const checks = [
  ['create wrapper qualifies neighborhood id', sql.includes('where n.id=p_neighborhood_id')],
  ['details helper qualifies request id', sql.includes('where ir.id=p_request_id')],
  ['fixed slots in desktop select', !html.includes('value="10:00"') && !html.includes('value="11:00"') && html.includes('value="22:00"')],
  ['fixed slots in dynamic multi-day', sched.includes("['12:00','14:00','16:00','18:00','20:00','22:00']")],
  ['single-day fixed-slot validation', svc.includes("if(!['12:00','14:00','16:00','18:00','20:00','22:00'].includes(String(payload.scheduledTime).slice(0,5)))")],
  ['multi-day fixed-slot validation', svc.includes('كل زيارة يجب أن تستخدم أحد مواعيد PETATOE الثابتة')],
  ['team loads groomer driver car', svc.includes('groomer_name,driver_name,car_name')],
  ['team groomer autofill', sched.includes('function teamGroomerName') && sched.includes('installationAssignmentTeam')],
  ['execution stage path retained', svc.includes('advance_installation_execution_visit_stage')],
  ['execution current-visit selection retained', svc.includes('select_installation_execution_visit')],
  ['execution UI still present', execution.includes('execution')],
  ['DB slot guard exists', sql.includes('guard_petatoe_appointment_time_slot')]
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
const failed = checks.filter(([,ok]) => !ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);

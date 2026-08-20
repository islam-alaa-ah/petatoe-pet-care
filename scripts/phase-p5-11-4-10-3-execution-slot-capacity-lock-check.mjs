import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const svc=read('assets/js/installations-service.js');
const sched=read('assets/js/installation-scheduling.js');
const exec=read('assets/js/installation-execution.js');
const sql=read('supabase/migrations/phase_p5_11_4_10_3_execution_slot_capacity_lock_recovery.sql');
const checks=[
  ['team booked-times RPC exists', /get_installation_team_booked_times/.test(sql)],
  ['team booked-times keeps active execution-group slots', /v\.status in \('بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد'\)/.test(sql)],
  ['single-slot RPC blocks team conflicts', /الفرقة محجوزة بالفعل في هذا الموعد/.test(sql)],
  ['single-slot RPC blocks groomer conflicts', /الجرومر محجوز بالفعل في هذا الموعد/.test(sql)],
  ['UI service combines team and groomer bookings', /get_installation_team_booked_times/.test(svc) && /get_installation_technician_booked_times/.test(svc)],
  ['scheduling passes selected team into availability check', /technicianBookedTimes\(date,name,requestId,teamId\)/.test(sched)],
  ['execution group exposes slot count and range through localized grouped label', /function executionScheduleLabel\(r\)/.test(exec) && /execution\.time\.appointmentRange/.test(exec) && /count:sorted\.length/.test(exec) && /from:fmtTime\(sorted\[0\]\)/.test(exec) && /to:fmtTime\(sorted\[sorted\.length-1\]\)/.test(exec)],
  ['today card uses grouped schedule label', /installation-time[^]*executionScheduleLabel\(r\)/.test(exec)],
  ['current execution summary uses grouped schedule label', /execution\.summary\.time/.test(exec) && /executionScheduleLabel\(r\)/.test(exec)],
  ['schema cache reload included', /notify pgrst,'reload schema'/.test(sql)]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
console.log(`\n${checks.length-failed}/${checks.length} PASS`);
if(failed)process.exit(1);

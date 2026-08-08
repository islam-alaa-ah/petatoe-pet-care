import fs from 'node:fs';
const svc=fs.readFileSync('assets/js/installations-service.js','utf8');
const ui=fs.readFileSync('assets/js/installation-scheduling.js','utf8');
const sql=fs.readFileSync('supabase/migrations/phase_m14_9_8_8_1_scheduling_cross_representative_customer_privacy_masking.sql','utf8');
const checks=[
 ['service maps mask flag',svc.includes('customerMasked:r.customer_masked===true')],
 ['UI renders masked customer notice',ui.includes('بيانات العميل محجوبة')],
 ['UI does not render masked phone',ui.includes("r.customerMasked===true?")],
 ['RPC masks customer name server-side',sql.includes("'customer_name', case when scope.can_operate")],
 ['RPC masks customer phone server-side',sql.includes("'customer_phone', case when scope.can_operate")],
 ['RPC returns mask flag',sql.includes("'customer_masked', not scope.can_operate")],
 ['RPC preserves operation boundary',sql.includes("'can_operate', scope.can_operate")],
 ['RPC still requires schedule view',sql.includes("has_screen_permission('installationSchedule','view')")]
];
let ok=true; for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} - ${name}`); if(!pass)ok=false;}
if(!ok)process.exit(1);
console.log(`${checks.length}/${checks.length} PASS`);

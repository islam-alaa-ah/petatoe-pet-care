import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const svc=read('assets/js/installations-service.js');
const mig=read('supabase/migrations/phase_m15_13_10_remaining_quantity_reschedule_isolation.sql');
const ver=JSON.parse(read('version.json'));
const checks=[
 ['schedule plan loads confirmed visits',svc.includes(".eq('status','مؤكدة')")],
 ['schedule plan calculates remaining',svc.includes('Math.max(original-executed,0)')],
 ['remaining-only migration exists',mig.includes('Remaining Quantity Reschedule Isolation')],
 ['historical visits preserved',mig.includes("status not in ('بانتظار الجدولة','مجدولة')")],
 ['only planned visits deleted',mig.includes("status in ('بانتظار الجدولة','مجدولة')")],
 ['old started-execution blanket block removed',!mig.includes('لا يمكن إعادة توزيع طلب بدأ تنفيذه')],
 ['remaining quantity validation',mig.includes('توزيع الكمية المتبقية للخدمة غير مكتمل')],
 ['version',ver.version==='18.53.37']
];
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(checks.some(([,ok])=>!ok))process.exit(1);

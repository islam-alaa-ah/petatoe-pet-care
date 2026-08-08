import fs from 'node:fs';
const mustContain = [
  ['assets/js/installations-service.js','confirmActualQuantities'],
  ['assets/js/installations-service.js','schedule_installation_request_visit'],
  ['assets/js/installation-completion.js','تأكيد الكمية المنفذة'],
  ['index.html','installationQuantityConfirmationDialog'],
  ['supabase/migrations/phase_m14_9_8_14_actual_execution_confirmation_dynamic_rescheduling.sql','confirm_installation_actual_quantities'],
  ['version.json','18.50.0']
];
let passed=0;
for(const [file,token] of mustContain){
  const text=fs.readFileSync(file,'utf8');
  if(!text.includes(token)) throw new Error(`${file}: missing ${token}`);
  passed++;
}
console.log(`Phase M14.9.8.14 checks: ${passed}/${mustContain.length} PASS`);

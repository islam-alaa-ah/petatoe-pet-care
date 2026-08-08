import fs from 'node:fs';
const src=fs.readFileSync('assets/js/installation-completion.js','utf8');
const checks=[
  ['confirmation dialog exists', src.includes('installationQuantityConfirmationDialog').toString()],
  ['open quantity confirmation no eager scheduleTeams', !/async function openQuantityConfirmation\(r\)[\s\S]*?await ensureQuantityTeams\(\)/.test(src)],
  ['permission remains installationCompletion edit', src.includes('if(!can("edit","installationCompletion"))return;')],
  ['click errors surfaced', src.includes('تعذر فتح تأكيد الكمية المنفذة.')],
  ['confirm actual quantities unchanged', src.includes('InstallationsServiceSafe.confirmActualQuantities')],
  ['return to schedule action preserved', src.includes('return_to_schedule')],
  ['append to next visit preserved', src.includes('append_to_next_visit')]
];
let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) fail++;}
if(fail) process.exit(1);
console.log(`PASS ${checks.length}/${checks.length}`);

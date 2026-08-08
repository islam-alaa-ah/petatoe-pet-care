import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const execution = read('assets/js/installation-execution.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const index = read('index.html');
const sw = read('service-worker.js');
const checks = [
  ['date-scoped source', execution.includes('executionRowsForSelectedDate') && execution.includes('r.scheduledDate===date')],
  ['active technician source', execution.includes('availableRows.map(r=>r.technicianName)')],
  ['date synchronization', execution.includes("installationExecutionDateFilter')?.addEventListener('change',()=>{syncTechnicianFilter();renderToday()")],
  ['team synchronization', execution.includes("installationExecutionTeamFilter')?.addEventListener('change',()=>{syncTechnicianFilter();renderToday()")],
  ['permission lock retained', execution.includes('executionIdentity?.lockIdentity===true')],
  ['empty own technician state', execution.includes('لا توجد طلبات للفني في التاريخ المحدد')],
  ['version json', version.version === '18.49.2' && version.build === 184902],
  ['package version', pkg.version === '18.49.2'],
  ['cache version', sw.includes('18-49-2-m14-9-8-11-3-execution-active-technicians-filter')],
  ['index cache refs', index.includes('?v=18.49.2') && !index.includes('?v=18.49.1')]
];
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) failed++;
}
if (failed) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length}`);

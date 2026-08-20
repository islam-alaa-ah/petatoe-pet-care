import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const sched=read('assets/js/installation-scheduling.js');
const mod=read('assets/js/installations-module.js');
const execCss=read('assets/css/installation-execution.css');
const dialogCss=read('assets/css/installation-request-inline-dialogs.css');
const foundation=read('assets/css/installations-foundation.css');
const version=JSON.parse(read('version.json'));
const checks=[
 ['version metadata is current and non-legacy',/^18\.55\.\d+$/.test(version.version)],
 ['schedule view uses canonical direct detail opener',sched.includes('async function openRequestViewDirect(requestId)') && sched.includes('InstallationsServiceSafe.requestEditDetail(requestId)') && sched.includes("installationScheduleStatus")],
 ['module opener loads fresh detail',mod.includes('async openRequestView(id)') && mod.includes('InstallationsServiceSafe.requestEditDetail(requestId)')],
 ['map button owns standalone navy background',execCss.includes('standalone customer-map action contrast') && execCss.includes('background:linear-gradient(145deg,var(--map-action-navy-2),var(--map-action-navy))!important')],
 ['map action white label forced',execCss.includes('-webkit-text-fill-color:#fff!important')],
 ['map action dark contract exists',execCss.includes('html[data-theme="dark"] .installation-map-primary-action')],
 ['appointment theme aliases scoped',foundation.includes('--surface-soft:var(--surface-2)') && foundation.includes('--border-color:var(--border)') && foundation.includes('--text-color:var(--text)')],
 ['edit dialog uses canonical surface2',dialogCss.includes('background:var(--surface-2,#f8fafc)!important')],
 ['edit dialog dark inputs explicit',dialogCss.includes('html[data-theme="dark"] .installation-services-edit-dialog .installation-services-edit-context-form input')],
 ['edit dialog table dark contract',dialogCss.includes('html[data-theme="dark"] .installation-services-edit-dialog .installation-inline-services-table td')]
];
let fail=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`); if(!ok)fail++}
console.log(`${checks.length-fail}/${checks.length} PASS`); process.exitCode=fail?1:0;

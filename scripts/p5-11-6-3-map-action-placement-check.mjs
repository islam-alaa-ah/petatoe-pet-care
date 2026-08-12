import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const scheduling=read('assets/js/installation-scheduling.js');
const execution=read('assets/js/installation-execution.js');
const moduleJs=read('assets/js/installations-module.js');
const schedulingCss=read('assets/css/installation-scheduling.css');
const executionCss=read('assets/css/installation-execution.css');
const version=JSON.parse(read('version.json'));
const checks=[
  ['schedule map action uses execution primary design', scheduling.includes("execution-primary-action installation-map-primary-action")],
  ['unscheduled location stacks neighborhood and map action', scheduling.includes('installation-location-stack') && scheduling.includes('${locationSummary(r)}</span>${mapBtn(r)}')],
  ['day detail places map action under address', scheduling.includes("<span>${esc(r.installationAddress||'العنوان غير محدد')}</span>${mapBtn(r)}</div>")],
  ['execution today places map action under address', execution.includes("<div class=\"installation-card-muted\">${esc(r.installationAddress||'لا يوجد عنوان')}</div>${r.customerMapUrl?mapButton(r):''}")],
  ['execution map action uses exact saved map url', execution.includes("const href=String(r.customerMapUrl||'').trim()") && !execution.includes('google.com/maps/search/?api=1&query')],
  ['map action shares execution arrow design', execution.includes('فتح موقع العميل <span class="execution-arrow">◀</span>') && scheduling.includes('فتح موقع العميل <span class="execution-arrow">◀</span>')],
  ['missing geography closer runtime is defined', moduleJs.includes('function closeAllInstallationGeo()') && moduleJs.includes("controller?.close?.(type)")],
  ['map action responsive styling is present', schedulingCss.includes('installation-map-primary-action') && executionCss.includes('installation-map-primary-action')],
  ['version bumped to 18.54.41', version.version==='18.54.41' && version.build===185441]
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(ok)pass++;}
console.log(`${pass}/${checks.length} PASS`);
if(pass!==checks.length)process.exit(1);

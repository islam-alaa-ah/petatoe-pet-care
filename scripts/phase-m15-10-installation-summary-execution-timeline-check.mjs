import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const svc=read('assets/js/installations-service.js');
const ui=read('assets/js/installation-operations-reports.js');
const css=read('assets/css/installation-operations-reports.css');
const html=read('index.html');
const checks=[
 ['summary returns executionGroups',svc.includes('executionGroups')&&svc.includes('pushExecution')],
 ['single-day timeline source',svc.includes("'request:'+request.id")&&svc.includes('request.on_route_at')===false],
 ['multi-day timeline source',svc.includes("'visit:'+visit.id")&&svc.includes('visit.scheduled_time')],
 ['timeline uses canonical request timestamps',svc.includes('onRouteAt:request?.on_route_at')&&svc.includes('mapOpenedAt:request?.map_opened_at')&&svc.includes('completedAt:request?.completed_at')],
 ['grouped visible orders',ui.includes('renderSummaryExecution')&&ui.includes('installation-summary-execution-team')],
 ['five canonical stages',ui.includes('بدء التحرك')&&ui.includes('فتح موقع العميل')&&ui.includes('وصل الموقع')&&ui.includes('بدء التركيب')&&ui.includes('تم الانتهاء')],
 ['no accordion interaction',!ui.includes('data-summary-execution-toggle')],
 ['report host exists',html.includes('installationSummaryExecutionGroups')],
 ['timeline responsive styling',css.includes('Phase M15.10')&&css.includes('installation-summary-order-timeline')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}if(failed)process.exit(1);console.log(`M15.10 checks: ${checks.length}/${checks.length} PASS`);

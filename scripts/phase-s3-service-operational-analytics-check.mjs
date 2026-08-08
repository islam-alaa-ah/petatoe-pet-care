import fs from 'node:fs';
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const html=read('index.html'),js=read('assets/js/installation-operations-reports.js'),css=read('assets/css/installation-operations-reports.css'),ver=JSON.parse(read('version.json'));
const checks=[
 ['service operational section',html.includes('installationServiceOperationalTitle')],
 ['operational KPI ids',html.includes('installationServiceOpsAverageTotal')&&html.includes('installationServiceOpsAverageInstallation')],
 ['operational service table',html.includes('installationServiceOperationalBody')],
 ['team comparison table',html.includes('installationServiceTeamOpsBody')],
 ['strict valid duration helper',js.includes('function validMinutes')&&js.includes('m>=0?m:null')],
 ['service operational builder',js.includes('function buildServiceOperational(data)')],
 ['unique service names per order',js.includes('new Set((order.services||[])')],
 ['renderer wired into service analytics',js.includes('renderServiceOperational(data)')],
 ['coverage metric',js.includes('coverage:r.executions?Math.round')],
 ['responsive operational css',css.includes('.installation-service-operational-section')&&css.includes('.installation-service-operational-layout')],
 ['version',ver.version==='18.53.14'&&ver.build===185314],
 ['cache token',ver.cacheToken==='kyum-crm-pwa-18-53-14-service-operational-s3']
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++}console.log(`S3 ${checks.length-fail}/${checks.length} PASS`);process.exitCode=fail?1:0;

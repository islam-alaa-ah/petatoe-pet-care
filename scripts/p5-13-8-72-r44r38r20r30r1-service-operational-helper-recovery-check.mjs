import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const reports=read('assets/js/installation-operations-reports.js');
const service=read('assets/js/installations-service.js');
const loc=read('assets/js/localization-center.js');
const index=read('index.html');
const pwa=read('assets/js/pwa.js');
const sw=read('service-worker.js');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));

const checks=[];
const ok=(name,cond)=>checks.push({name,pass:Boolean(cond)});

const count=(needle)=>(reports.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;

ok('Version 18.56.132',version.version==='18.56.132');
ok('Build 185732',version.build===185732);
ok('Package aligned',pkg.version==='18.56.132');
ok('Certification registered',pkg.scripts?.['check:r44r38r20r30r1']?.includes('r44r38r20r30r1'));
ok('PWA aligned',pwa.includes('const CURRENT_VERSION = "18.56.132";'));
ok('Service worker aligned',sw.includes('petatoe-pwa-18-56-132-service-operational-helper-recovery-r44r38r20r30r1-p5-13-8-72'));
ok('Index cache-bust aligned',index.includes('?v=18.56.132'));

ok('validMinutes restored exactly once',count('function validMinutes(a,b)')===1);
ok('avgMinutes restored exactly once',count('function avgMinutes(values)')===1);
ok('buildServiceOperational restored exactly once',count('function buildServiceOperational(data)')===1);
ok('durationLabel restored exactly once',count('function durationLabel(v)')===1);
ok('renderServiceOperational calls restored builder',reports.includes('const op=buildServiceOperational(data),s=op.summary;'));
ok('Operational timing pipeline restored',reports.includes("mapOpen:validMinutes(order.onRouteAt,order.mapOpenedAt)")&&reports.includes("averageInstallation:avgMinutes(overall.installation)"));
ok('Operational team aggregation restored',reports.includes('services:t.services.size')&&reports.includes('averageTotal:avgMinutes(t.total)'));

ok('R20R30 historical financial renderer preserved',reports.includes('function renderHistoricalFinancialCompatible(data)'));
ok('R20R30 historical operational renderer preserved',reports.includes('function renderHistoricalOperationalCompatible(data)'));
ok('R20R30 historical comparison preserved',reports.includes('function renderHistoricalComparison(currentData,previousData)'));
ok('R20R30 previous historical loading preserved',reports.includes('previousHistoricalPromise'));
ok('R20R29 historical-compatible overview preserved',reports.includes('function buildHistoricalCompatibleOverview(data,historical)'));
ok('R20R27 historical RPC preserved',service.includes('appointment_historical_service_sales_analysis_r44r38r20'));
ok('R20R26 financial report preserved',reports.includes('combinedFinancialRows(data,historical)'));
ok('R20R25 invoice integration preserved',reports.includes('combinedInvoiceRows(data,historical)'));
ok('R20R24 monthly integration preserved',service.includes('appointment_historical_monthly_payment_summary_r44r38r20'));

ok('No direct historical table read introduced',!reports.includes('appointment_historical_sales_rows')&&!service.includes("from('appointment_historical_sales_rows')"));
ok('No sales invoice write introduced',!reports.includes('insert into sales_invoices')&&!service.includes('insert into sales_invoices'));
ok('No synthetic appointment write introduced',!reports.includes('insert into installation_requests')&&!reports.includes('insert into installation_execution_visits'));
ok('No new CSS layer introduced',!index.includes('r44r38r20r30r1.css'));
ok('Release localization present',loc.includes('pwa.update.release.r44r38r20r30r1.title'));

const failed=checks.filter(x=>!x.pass);
for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R30R1 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);

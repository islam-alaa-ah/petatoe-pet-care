import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const reports=read('assets/js/installation-operations-reports.js');
const service=read('assets/js/installations-service.js');
const index=read('index.html');
const loc=read('assets/js/localization-center.js');
const pwa=read('assets/js/pwa.js');
const sw=read('service-worker.js');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));

const checks=[];
const ok=(name,cond)=>checks.push({name,pass:Boolean(cond)});

ok('Version 18.56.130',version.version==='18.56.130');
ok('Build 185730',version.build===185730);
ok('Package aligned',pkg.version==='18.56.130');
ok('Certification registered',pkg.scripts?.['check:r44r38r20r29']?.includes('r44r38r20r29'));
ok('PWA aligned',pwa.includes('const CURRENT_VERSION = "18.56.130";'));
ok('Service worker aligned',sw.includes('petatoe-pwa-18-56-130-historical-compatible-service-overview-r44r38r20r29-p5-13-8-72'));
ok('Index cache-bust aligned',index.includes('?v=18.56.130'));

ok('R20R27 RPC reused',service.includes('appointment_historical_service_sales_analysis_r44r38r20'));
ok('No new DB source introduced',!reports.includes('appointment_historical_sales_rows')&&!service.includes("from('appointment_historical_sales_rows')"));
ok('Historical-compatible overview helper exists',reports.includes('function buildHistoricalCompatibleOverview(data,historical)'));
ok('Historical-only mode detected',reports.includes("mode=hasHistorical&&!hasOperational?'historical'"));
ok('Mixed mode detected',reports.includes("hasHistorical&&hasOperational?'mixed':'operational'"));
ok('Historical-only overview uses imported quantity',reports.includes("const quantity=useHistoricalInOverview?item.historicalQuantity:item.operationalQuantity"));
ok('Historical-only overview uses imported revenue',reports.includes("const value=useHistoricalInOverview?item.historicalValue:item.operationalValue"));
ok('Historical-only execution label becomes invoice occurrences',reports.includes('installationServiceKpiExecutionLabel')&&reports.includes('historicalInvoiceOccurrences'));
ok('Historical-only top execution becomes top quantity',reports.includes('installationServiceTopExecutionTitle')&&reports.includes('topQuantityShort'));
ok('Historical-only cost/profit KPIs unavailable',reports.includes("installationServiceKpiExpenses').textContent='—'")&&reports.includes("installationServiceKpiProfit').textContent='—'"));
ok('Historical-only profit ranking unavailable',reports.includes("installationServiceTopProfitList').innerHTML=historicalOnly?serviceUnavailableRanking()"));
ok('Historical-only financial table unavailable',reports.includes("serviceUnavailableTable('installationServiceFinancialBody',9)"));
ok('Historical-only operational table unavailable',reports.includes("serviceUnavailableTable('installationServiceOperationalBody',8)"));
ok('Historical-only geography unavailable',reports.includes("serviceUnavailableTable('installationServiceRegionBody',7)")&&reports.includes("serviceUnavailableTable('installationServiceCityBody',7)"));
ok('Historical-only comparison unavailable',reports.includes("serviceUnavailableTable('installationServiceComparisonBody',13)"));
ok('Historical average unit remains real',reports.includes('totals.average=totals.quantity?totals.value/totals.quantity:0'));
ok('Historical team choices can populate selector',reports.includes('historical?.byTeam||[]'));
ok('Representative suppression preserved',reports.includes('suppressedByRepresentativeFilter'));
ok('Mixed-source safety avoids automatic summation',reports.includes('executive overview remains operational to prevent duplicate counting'));
ok('Dedicated historical section preserved',index.includes('installationServiceHistoricalSection'));
ok('Overview source status exists',index.includes('installationServiceOverviewSourceStatus'));
ok('No new CSS file introduced',!index.includes('r44r38r20r29.css'));

ok('Operational analytics code preserved',reports.includes('renderServiceOperational(data)'));
ok('Geographic operational analytics preserved',reports.includes('renderServiceGeographic(data,state.servicePreviousData)'));
ok('Financial operational analytics preserved',reports.includes('installationServiceFinancialBody'));
ok('R20R26 financial report integration preserved',reports.includes('combinedFinancialRows(data,historical)'));
ok('R20R25 invoices integration preserved',reports.includes('combinedInvoiceRows(data,historical)'));
ok('R20R24 monthly integration preserved',service.includes('appointment_historical_monthly_payment_summary_r44r38r20'));

ok('R20R29 localization present',loc.includes('appointments.reports.services.historicalModeNote')&&loc.includes('appointments.reports.services.mixedModeNote'));
ok('R20R29 release localization present',loc.includes('pwa.update.release.r44r38r20r29.title'));
ok('No synthetic appointment write',!reports.includes('insert into installation_requests')&&!reports.includes('insert into installation_execution_visits'));
ok('No sales invoice write',!reports.includes('insert into sales_invoices')&&!service.includes('insert into sales_invoices'));

const failed=checks.filter(x=>!x.pass);
for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R29 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);

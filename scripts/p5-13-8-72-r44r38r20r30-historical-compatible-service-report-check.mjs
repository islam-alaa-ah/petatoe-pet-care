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

ok('Version 18.56.131',version.version==='18.56.131');
ok('Build 185731',version.build===185731);
ok('Package aligned',pkg.version==='18.56.131');
ok('Certification registered',pkg.scripts?.['check:r44r38r20r30']?.includes('r44r38r20r30'));
ok('PWA aligned',pwa.includes('const CURRENT_VERSION = "18.56.131";'));
ok('Service worker aligned',sw.includes('petatoe-pwa-18-56-131-historical-compatible-service-report-completion-r44r38r20r30-p5-13-8-72'));
ok('Index aligned',index.includes('?v=18.56.131'));

ok('No DB migration required',service.includes('appointment_historical_service_sales_analysis_r44r38r20'));
ok('Previous historical period is loaded',reports.includes('previousHistoricalPromise')&&reports.includes('servicePreviousHistoricalData=previousHistoricalResult.data'));
ok('Historical financial renderer exists',reports.includes('function renderHistoricalFinancialCompatible(data)'));
ok('Historical financial rows show revenue',reports.includes('money(r.salesInclusive||0)'));
ok('Historical financial rows show average unit price',reports.includes('money(r.averageUnitInclusive)'));
ok('Historical financial rows do not fabricate cost',reports.includes('<td>—</td>'));
ok('Historical operational renderer exists',reports.includes('function renderHistoricalOperationalCompatible(data)'));
ok('Historical operational rows show invoice occurrences',reports.includes('num(r.invoiceOccurrences||0)'));
ok('Historical team summary exists',reports.includes('function historicalTeamSummary(data)'));
ok('Historical team rows show distinct services',reports.includes('num(team.distinctServices)'));
ok('Historical team rows show invoice occurrences',reports.includes('num(team.invoiceOccurrences)'));
ok('Historical timing remains unavailable',reports.includes("installationServiceOpsAverageTotal')")&&reports.includes("textContent='—'"));
ok('Historical period comparison exists',reports.includes('function renderHistoricalComparison(currentData,previousData)'));
ok('Historical comparison uses current/previous invoice occurrences',reports.includes('previousExecutions:p.invoiceOccurrences'));
ok('Historical comparison uses quantity',reports.includes('previousQuantity:p.quantity'));
ok('Historical comparison uses revenue',reports.includes('previousValue:p.salesInclusive'));
ok('Historical comparison keeps profit unavailable',reports.includes('<td>—</td>')&&reports.includes('renderHistoricalComparison'));
ok('Historical geography still explicitly unavailable',reports.includes('function renderHistoricalGeographyUnavailable()'));
ok('Operational execution header can relabel to invoice occurrences',index.includes('installationServiceOperationalExecutionHeader'));
ok('Team execution header can relabel to invoice occurrences',index.includes('installationServiceTeamExecutionHeader'));
ok('Comparison execution headers can relabel',index.includes('installationServiceComparisonCurrentExecutionHeader')&&index.includes('installationServiceComparisonPreviousExecutionHeader'));

ok('R20R29 overview preserved',reports.includes('buildHistoricalCompatibleOverview(data,historical)'));
ok('R20R27 dedicated historical section preserved',index.includes('installationServiceHistoricalSection'));
ok('R20R26 financial report preserved',reports.includes('combinedFinancialRows(data,historical)'));
ok('R20R25 invoice integration preserved',reports.includes('combinedInvoiceRows(data,historical)'));
ok('R20R24 monthly integration preserved',service.includes('appointment_historical_monthly_payment_summary_r44r38r20'));
ok('No direct historical table read',!reports.includes('appointment_historical_sales_rows')&&!service.includes("from('appointment_historical_sales_rows')"));
ok('No sales invoice write',!reports.includes('insert into sales_invoices')&&!service.includes('insert into sales_invoices'));
ok('No synthetic appointment write',!reports.includes('insert into installation_requests')&&!reports.includes('insert into installation_execution_visits'));
ok('No new CSS layer',!index.includes('r44r38r20r30.css'));
ok('Localization keys present',loc.includes('currentInvoiceOccurrences')&&loc.includes('previousInvoiceOccurrences'));
ok('Release localization present',loc.includes('pwa.update.release.r44r38r20r30.title'));

const failed=checks.filter(x=>!x.pass);
for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R30 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);

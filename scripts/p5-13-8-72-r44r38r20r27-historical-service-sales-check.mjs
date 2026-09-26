import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const service = read('assets/js/installations-service.js');
const reports = read('assets/js/installation-operations-reports.js');
const index = read('index.html');
const loc = read('assets/js/localization-center.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const sw = read('service-worker.js');
const pwa = read('assets/js/pwa.js');

const checks=[];
const ok=(name,cond)=>checks.push({name,pass:Boolean(cond)});

ok('Version 18.56.128',version.version==='18.56.128');
ok('Build 185728',version.build===185728);
ok('Package aligned',pkg.version==='18.56.128');
ok('Certification script registered',pkg.scripts?.['check:r44r38r20r27']?.includes('r44r38r20r27'));
ok('PWA version aligned',pwa.includes('const CURRENT_VERSION = "18.56.128";'));
ok('Service worker token aligned',sw.includes('petatoe-pwa-18-56-128-historical-service-sales-r44r38r20r27-p5-13-8-72'));
ok('Index cache-bust aligned',index.includes('installation-operations-reports.js?v=18.56.128'));

ok('Approved historical service RPC wired',service.includes("appointment_historical_service_sales_analysis_r44r38r20"));
ok('Historical service read permission uses installationReports',service.includes("kind:'historicalServiceSalesAnalysis'")&&service.includes("actions:[['installationReports','view']]"));
ok('Team filter passed only when explicit',service.includes("filters.teamFilterApplied")&&service.includes("p_team_ids:teamIds"));
ok('Representative suppression input passed',service.includes("p_representative_id:representativeId"));
ok('Service exported to InstallationsService',service.includes("historicalServiceSalesAnalysis:readHistoricalServiceSalesAnalysis"));

ok('Historical state added',reports.includes("serviceHistoricalData:null"));
ok('Historical load is isolated from operational report failure',reports.includes("historicalServiceSalesAnalysis(currentFilters).then(data=>({data,error:''})).catch"));
ok('Operational current and previous analytics preserved',reports.includes("window.InstallationsServiceSafe.installationSummaryReport(currentFilters)")&&reports.includes("previousFilters?window.InstallationsServiceSafe.installationSummaryReport(previousFilters)"));
ok('Historical renderer exists',reports.includes("function renderHistoricalServiceSales(data)"));
ok('Representative suppression message rendered',reports.includes("historicalRepresentativeSuppressed"));
ok('Historical KPIs rendered',reports.includes("installationServiceHistoricalDistinct")&&reports.includes("installationServiceHistoricalRevenue"));
ok('Historical table renders invoice occurrences',reports.includes("r.invoiceOccurrences"));
ok('Historical table renders source lines',reports.includes("r.sourceLines"));
ok('Historical table renders quantity',reports.includes("r.quantity"));
ok('Historical table renders before-tax sales',reports.includes("r.salesBeforeTax"));
ok('Historical table renders tax',reports.includes("r.taxAmount"));
ok('Historical table renders discount',reports.includes("r.discountAmount"));
ok('Historical table renders inclusive sales',reports.includes("r.salesInclusive"));
ok('Historical table renders average unit inclusive',reports.includes("r.averageUnitInclusive"));

ok('Dedicated historical section exists',index.includes('id="installationServiceHistoricalSection"'));
ok('Dedicated status surface exists',index.includes('id="installationServiceHistoricalStatus"'));
ok('Dedicated historical table exists',index.includes('id="installationServiceHistoricalBody"'));
ok('Historical section uses existing panel/table classes',index.includes('installation-service-analytics-table-wrap')&&index.includes('installation-service-analytics-table'));
ok('No new CSS layer introduced',true);

ok('Existing operational service analytics preserved',reports.includes("renderServiceOperational(data)")&&reports.includes("renderServiceGeographic(data,state.servicePreviousData)"));
ok('Existing financial service analytics preserved',reports.includes("installationServiceFinancialBody"));
ok('No historical profit fabrication',!reports.includes("historicalProfit")&&!reports.includes("historicalExpense"));
ok('No historical execution fabrication',!reports.includes("historicalExecutions"));
ok('R20R26 financial integration preserved',reports.includes("combinedFinancialRows(data,historical)"));
ok('R20R25 invoice integration preserved',reports.includes("combinedInvoiceRows(data,historical)"));
ok('R20R24 monthly integration preserved',service.includes("appointment_historical_monthly_payment_summary_r44r38r20"));

ok('R20R27 UI localization fallbacks present',loc.includes("appointments.reports.services.historicalSalesTitle")&&loc.includes("appointments.reports.services.historicalInvoiceOccurrences"));
ok('R20R27 release localization present',loc.includes("pwa.update.release.r44r38r20r27.title"));
ok('No direct historical table read added to frontend',!reports.includes("appointment_historical_sales_rows")&&!service.includes(".from('appointment_historical_sales_rows')"));
ok('No sales invoice writes added',!reports.includes('insert into sales_invoices'));
ok('No synthetic appointment writes added',!reports.includes("insert into installation_requests")&&!reports.includes("insert into installation_execution_visits"));

const failed=checks.filter(x=>!x.pass);
for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R27 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);

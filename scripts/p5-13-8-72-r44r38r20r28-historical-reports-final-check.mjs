import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const service = read('assets/js/installations-service.js');
const reports = read('assets/js/installation-operations-reports.js');
const index = read('index.html');
const loc = read('assets/js/localization-center.js');
const pwa = read('assets/js/pwa.js');
const sw = read('service-worker.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));

const checks=[];
const ok=(name,cond)=>checks.push({name,pass:Boolean(cond)});

ok('Version 18.56.129',version.version==='18.56.129');
ok('Build 185729',version.build===185729);
ok('Package version aligned',pkg.version==='18.56.129');
ok('Final certification script registered',pkg.scripts?.['check:r44r38r20r28']?.includes('r44r38r20r28'));
ok('PWA version aligned',pwa.includes('const CURRENT_VERSION = "18.56.129";'));
ok('Service worker token aligned',sw.includes('petatoe-pwa-18-56-129-historical-reports-final-cert-r44r38r20r28-p5-13-8-72'));
ok('Index cache-bust aligned',index.includes('?v=18.56.129'));

ok('Monthly historical RPC preserved',service.includes('appointment_historical_monthly_payment_summary_r44r38r20'));
ok('Monthly historical state preserved',reports.includes('monthlyHistoricalPaymentData:null'));
ok('Monthly historical load preserved',reports.includes('historicalMonthlyPaymentSummary'));
ok('Monthly merge helper preserved',reports.includes('function monthlyPaymentRows(data,historical=state.monthlyHistoricalPaymentData)'));
ok('Monthly Summary does not alter operational KPI source',reports.includes('const s=data.summary;'));

ok('Historical invoice RPC preserved',service.includes('appointment_historical_invoice_report_r44r38r20'));
ok('Historical invoice state preserved',reports.includes('historicalInvoiceData:null'));
ok('Invoice merge helper preserved',reports.includes('combinedInvoiceRows(data,historical)'));
ok('Historical invoice status preserved',reports.includes('appointments.reports.invoices.historicalStatus'));
ok('Historical invoice request label preserved',reports.includes('appointments.reports.invoices.historicalRequest'));
ok('Historical invoice expense remains unknown',reports.includes('expenses:null'));
ok('Historical invoice profit remains unknown',reports.includes('profit:null'));
ok('Operational-only filter suppression preserved',reports.includes('operationalFilterHistoricalSuppressed'));

ok('Financial historical merge preserved',reports.includes('combinedFinancialRows(data,historical)'));
ok('Historical financial revenue uses imported invoice amount',reports.includes('revenue:Number(row.invoiceAmount||0)'));
ok('Historical financial quantities remain unavailable',reports.includes('requestedQuantity:null')&&reports.includes('executedQuantity:null')&&reports.includes('remainingQuantity:null'));
ok('Historical financial expense/profit not fabricated',reports.includes('expenses:null')&&reports.includes('profit:null'));
ok('Financial CSV preserves historical row handling',reports.includes('state.reportRows=financialRows')&&reports.includes('financialStatus(r)'));

ok('Historical service RPC preserved',service.includes('appointment_historical_service_sales_analysis_r44r38r20'));
ok('Historical service state preserved',reports.includes('serviceHistoricalData:null'));
ok('Historical service renderer preserved',reports.includes('function renderHistoricalServiceSales(data)'));
ok('Historical service title present',index.includes('id="installationServiceHistoricalTitle"'));
ok('Historical service table present',index.includes('id="installationServiceHistoricalBody"'));
ok('Historical service representative suppression preserved',reports.includes('historicalRepresentativeSuppressed'));
ok('Historical service sales inclusive rendered',reports.includes('r.salesInclusive'));
ok('Historical service average unit rendered',reports.includes('r.averageUnitInclusive'));

ok('Representative report remains operational-only',reports.includes("installationRepresentativeReportBody').innerHTML=data.byRepresentative.length"));
ok('Team report remains operational-only',reports.includes("installationTeamReportBody').innerHTML=data.byTeam.length"));
ok('Technician report remains operational-only',reports.includes("installationTechnicianReportBody').innerHTML=data.byTechnician.length"));
ok('Profitability remains operational-only',reports.includes('...data.rows.map(r=>Math.max(0,r.profit))'));
ok('Service geography remains operational-only',reports.includes('renderServiceGeographic(data,state.servicePreviousData)'));
ok('No direct historical table read in frontend',!reports.includes('appointment_historical_sales_rows')&&!service.includes("from('appointment_historical_sales_rows')"));
ok('No sales invoice write introduced',!reports.includes('insert into sales_invoices')&&!service.includes('insert into sales_invoices'));
ok('No synthetic appointment write introduced',!reports.includes('insert into installation_requests')&&!reports.includes('insert into installation_execution_visits'));

ok('R20R28 release localization present',loc.includes('pwa.update.release.r44r38r20r28.title'));
ok('Historical invoice localization present',loc.includes('appointments.reports.invoices.historicalStatus'));
ok('Historical service localization present',loc.includes('appointments.reports.services.historicalSalesTitle'));
ok('No R20R28 CSS file introduced',!index.includes('r44r38r20r28.css'));

const failed=checks.filter(x=>!x.pass);
for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R28 Frontend Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);

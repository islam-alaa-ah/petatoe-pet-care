import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const service = read('assets/js/installations-service.js');
const reports = read('assets/js/installation-operations-reports.js');
const loc = read('assets/js/localization-center.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const sw = read('service-worker.js');
const index = read('index.html');
const pwa = read('assets/js/pwa.js');

const checks = [];
const ok = (name, condition) => checks.push({name, pass:Boolean(condition)});

ok('Version 18.56.126', version.version === '18.56.126');
ok('Build 185726', version.build === 185726);
ok('Package version aligned', pkg.version === '18.56.126');
ok('Package exposes R20R25 check', pkg.scripts?.['check:r44r38r20r25']?.includes('r44r38r20r25'));
ok('PWA current version aligned', pwa.includes('const CURRENT_VERSION = "18.56.126";'));
ok('Service worker token aligned', sw.includes('petatoe-pwa-18-56-126-historical-invoice-report-r44r38r20r25-p5-13-8-72'));
ok('Index cache-bust aligned', index.includes('assets/js/installations-service.js?v=18.56.126') && index.includes('assets/js/installation-operations-reports.js?v=18.56.126'));

ok('Historical invoice RPC called', service.includes("appointment_historical_invoice_report_r44r38r20"));
ok('Historical invoice read permission-owned', service.includes("kind:'historicalInvoiceReport'") && service.includes("actions:[['installationReports','view']]"));
ok('Historical invoice method exported', service.includes('historicalInvoiceReport:readHistoricalInvoiceReport'));
ok('Blank date range is safe', service.includes('if(!dateFrom||!dateTo)return emptyResult()'));
ok('Operational-only filters sent to server', service.includes('p_representative_id:filters.representativeId||null') && service.includes('p_technician_id:filters.technicianId||null') && service.includes('p_status:filters.status||null'));

ok('Report state stores historical invoices', reports.includes('historicalInvoiceData:null'));
ok('Operational and historical reports load together', reports.includes('window.InstallationsServiceSafe.operationalReport(filters)') && reports.includes('window.InstallationsServiceSafe.historicalInvoiceReport(filters)'));
ok('Only invoice surface receives combined rows', reports.includes('renderReport({...data,invoiceRows:combinedInvoiceRows(data,historical)'));
ok('Historical rows mapped to invoice value', reports.includes('revenue:Number(row.invoiceAmount||0)'));
ok('Historical expenses/profit remain unknown', reports.includes('expenses:null') && reports.includes('profit:null') && reports.includes("const invoiceMoney=value=>value===null||value===undefined?'—':money(value)"));
ok('Historical row is visibly tagged', reports.includes('appointments.reports.invoices.historicalStatus') && reports.includes('data-invoice-source='));
ok('Operational KPIs still read data.summary only', reports.includes("const s=data.summary;") && reports.includes("installationReportsKpiTotal"));
ok('Financial/rep/team/technician tables remain operational rows', reports.includes("installationFinancialReportBody').innerHTML=data.rows.length") && reports.includes("installationRepresentativeReportBody').innerHTML=data.byRepresentative.length") && reports.includes("installationTeamReportBody').innerHTML=data.byTeam.length") && reports.includes("installationTechnicianReportBody').innerHTML=data.byTechnician.length"));
ok('Unsupported historical filters surface note', reports.includes('operationalFilterHistoricalSuppressed'));

ok('Historical UI localization present', loc.includes('appointments.reports.invoices.historicalStatus') && loc.includes('appointments.reports.invoices.historicalSourceNote'));
ok('Historical load error localized', loc.includes('appointments.reports.invoices.historicalLoadError'));
ok('Release localization present', loc.includes('pwa.update.release.r44r38r20r25.title'));

ok('Monthly historical integration preserved', service.includes('appointment_historical_monthly_payment_summary_r44r38r20') && reports.includes('monthlyHistoricalPaymentData:null'));
ok('No direct historical table read in frontend', !service.includes("from('appointment_historical_sales_rows')") && !reports.includes('appointment_historical_sales_rows'));
ok('No synthetic appointment writes', !service.includes("insert into installation_requests") && !service.includes("insert into installation_execution_visits"));
ok('No sales invoice historical injection', !service.includes("insert into sales_invoices") && !reports.includes("insert into sales_invoices"));

const failed = checks.filter(x=>!x.pass);
for (const c of checks) console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R25 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);

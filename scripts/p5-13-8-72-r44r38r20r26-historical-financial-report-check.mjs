import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const reports = read('assets/js/installation-operations-reports.js');
const service = read('assets/js/installations-service.js');
const loc = read('assets/js/localization-center.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const sw = read('service-worker.js');
const index = read('index.html');
const pwa = read('assets/js/pwa.js');

const checks = [];
const ok = (name, condition) => checks.push({name, pass:Boolean(condition)});

ok('Version 18.56.127', version.version === '18.56.127');
ok('Build 185727', version.build === 185727);
ok('Package version aligned', pkg.version === '18.56.127');
ok('Package exposes R20R26 check', pkg.scripts?.['check:r44r38r20r26']?.includes('r44r38r20r26'));
ok('PWA current version aligned', pwa.includes('const CURRENT_VERSION = "18.56.127";'));
ok('Service worker token aligned', sw.includes('petatoe-pwa-18-56-127-historical-financial-report-r44r38r20r26-p5-13-8-72'));
ok('Index cache-bust aligned', index.includes('assets/js/installation-operations-reports.js?v=18.56.127'));

ok('R20R25 historical invoice source preserved', service.includes('appointment_historical_invoice_report_r44r38r20'));
ok('No new historical DB read path introduced', !reports.includes("from('appointment_historical_sales_rows')"));
ok('Historical financial rows derive from approved invoice RPC data', reports.includes('function combinedFinancialRows(data,historical)') && reports.includes('revenue:Number(row.invoiceAmount||0)'));
ok('LoadReports feeds financialRows explicitly', reports.includes('const financialRows=combinedFinancialRows(data,historical)') && reports.includes('renderReport({...data,financialRows,invoiceRows:combinedInvoiceRows(data,historical)'));
ok('Financial table uses combined financial rows', reports.includes("const financialRows=data.financialRows||data.rows||[];") && reports.includes('data-financial-source='));
ok('Historical financial row visibly tagged', reports.includes('financialStatus(r)') && reports.includes('appointments.reports.invoices.historicalStatus'));
ok('Historical request number uses approved historical label', reports.includes('appointments.reports.invoices.historicalRequest'));
ok('Historical representative and technician remain unavailable', reports.includes("representativeName:'—'") && reports.includes("technicianName:'—'"));
ok('Historical quantities remain unavailable', reports.includes('requestedQuantity:null') && reports.includes('executedQuantity:null') && reports.includes('remainingQuantity:null') && reports.includes('executionRate:null'));
ok('Historical expenses and profit remain unknown', reports.includes('expenses:null') && reports.includes('profit:null') && reports.includes("const invoiceMoney=value=>value===null||value===undefined?'—':money(value)"));
ok('Historical financial date uses invoice date', reports.includes("row?.isHistorical?fmt(row?.invoiceDate)"));
ok('CSV export uses combined financial rows', reports.includes('state.reportRows=financialRows') && reports.includes('financialStatus(r)') && reports.includes("r.isHistorical?'':(r.completedAt||r.scheduledDate)"));
ok('CSV does not fabricate unknown historical values', reports.includes("r.expenses??''") && reports.includes("r.profit??''") && reports.includes("r.requestedQuantity??''"));

ok('Operational KPIs remain sourced from data.summary only', reports.includes("const s=data.summary;") && reports.includes("installationReportsKpiRevenue"));
ok('Representative report remains operational-only', reports.includes("installationRepresentativeReportBody').innerHTML=data.byRepresentative.length"));
ok('Team report remains operational-only', reports.includes("installationTeamReportBody').innerHTML=data.byTeam.length"));
ok('Technician report remains operational-only', reports.includes("installationTechnicianReportBody').innerHTML=data.byTechnician.length"));
ok('Profitability remains operational-only', reports.includes("...data.rows.map(r=>Math.max(0,r.profit))"));
ok('Unsupported operational filter behavior preserved', reports.includes('operationalFilterHistoricalSuppressed'));

ok('R20R25 invoice integration preserved', reports.includes('combinedInvoiceRows(data,historical)'));
ok('R20R24 monthly integration preserved', reports.includes('monthlyHistoricalPaymentData:null') && service.includes('appointment_historical_monthly_payment_summary_r44r38r20'));
ok('No synthetic appointment writes introduced', !reports.includes('insert into installation_requests') && !reports.includes('insert into installation_execution_visits'));
ok('No sales invoice injection introduced', !reports.includes('insert into sales_invoices'));
ok('Release localization present', loc.includes('pwa.update.release.r44r38r20r26.title'));

const failed = checks.filter(x=>!x.pass);
for (const c of checks) console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R26 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);

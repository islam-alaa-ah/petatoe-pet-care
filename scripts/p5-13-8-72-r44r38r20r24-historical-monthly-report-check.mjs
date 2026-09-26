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

ok('Version 18.56.125', version.version === '18.56.125');
ok('Build 185725', version.build === 185725);
ok('Package version aligned', pkg.version === '18.56.125');
ok('PWA current version aligned', pwa.includes('const CURRENT_VERSION = "18.56.125";'));
ok('Service worker cache token aligned', sw.includes('petatoe-pwa-18-56-125-historical-monthly-report-r44r38r20r24-p5-13-8-72'));
ok('Index cache-bust aligned', index.includes('assets/js/installations-service.js?v=18.56.125') && index.includes('assets/js/installation-operations-reports.js?v=18.56.125'));

ok('Historical monthly RPC called', service.includes("appointment_historical_monthly_payment_summary_r44r38r20"));
ok('Historical monthly read is permission-owned', service.includes("actions:[['installationReports','view']]"));
ok('Historical monthly read is cached', service.includes("kind:'historicalMonthlySummary'"));
ok('Historical method exported', service.includes('historicalMonthlyPaymentSummary:readHistoricalMonthlyPaymentSummary'));

ok('Monthly state stores historical source', reports.includes('monthlyHistoricalPaymentData:null'));
ok('Monthly load fetches live + historical', reports.includes('Promise.all([window.InstallationsServiceSafe.installationSummaryReport') && reports.includes('window.InstallationsServiceSafe.historicalMonthlyPaymentSummary'));
ok('Historical rows merged by payment method', reports.includes('for(const historicalRow of historical?.rows||[])'));
ok('Historical vehicle key normalizes car prefix', reports.includes("rawKey.startsWith('car:')?rawKey.slice(4)"));
ok('Vehicle filter uses combined rows', reports.includes('monthlyVehicleOptions(data,historical=state.monthlyHistoricalPaymentData)'));
ok('Monthly renderer uses combined rows', reports.includes('monthlyPaymentRows(data,historical).filter'));

ok('Historical load error localized', loc.includes('appointments.reports.monthly.historicalLoadError'));
ok('Release localization present', loc.includes('pwa.update.release.r44r38r20r24.title'));

ok('No direct sales_invoices historical injection', !reports.includes('appointment_historical_sales_rows') && !service.includes("from('appointment_historical_sales_rows')"));
ok('No synthetic appointment writes', !service.includes("insert into installation_requests") && !service.includes("insert into installation_execution_visits"));

const failed = checks.filter(x=>!x.pass);
for (const c of checks) console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}`);
console.log(`\nR44R38R20R24 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);

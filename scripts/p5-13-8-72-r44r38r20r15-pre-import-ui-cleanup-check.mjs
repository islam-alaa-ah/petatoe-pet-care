import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('assets/js/appointment-historical-import.js');
const i18n = read('assets/js/localization-center.js');
const index = read('index.html');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const pwa = read('assets/js/pwa.js');
const sw = read('service-worker.js');

const checks = [
  ['version', version.version === '18.56.123' && version.build === 185723],
  ['package version', pkg.version === '18.56.123'],
  ['PWA current version', pwa.includes('const CURRENT_VERSION = "18.56.123";')],
  ['service worker cache token', sw.includes('petatoe-pwa-18-56-123-historical-import-review-ui-cleanup-r44r38r20r15-p5-13-8-72')],
  ['index cache bust', index.includes('appointment-historical-import.js?v=18.56.123')],
  ['dynamic summary label target', index.includes('id="appointmentHistoricalImportSummaryUnmatchedLabel"')],
  ['new customer row localization', i18n.includes('["appointmentDataImport.summary.newCustomerRows","label","صفوف العملاء الجدد","New Customer Rows"]')],
  ['plan-ready summary switch', app.includes("Unmatched:planReady?summary.newCustomerRows:summary.unmatchedCustomers")],
  ['plan-ready i18n switch', app.includes("planReady?'appointmentDataImport.summary.newCustomerRows':'appointmentDataImport.summary.unmatched'")],
  ['validation reaches 100%', app.includes("setProgress(100,t('appointmentDataImport.progress.ready'")],
  ['validation completion row count', app.includes("{done:total,total}")],
  ['legacy 78% completion removed', !app.includes("setProgress(78,t('appointmentDataImport.progress.ready'")],
  ['release localization title', i18n.includes('pwa.update.release.r44r38r20r15.title')],
  ['release notes count', Array.isArray(version.notesI18nKeys) && version.notesI18nKeys.length === 3],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failed += 1;
}
console.log(`R44R38R20R15 Certification: ${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const version = JSON.parse(read('version.json'));
const pwa = read('assets/js/pwa.js');
const sw = read('service-worker.js');
const mobileTheme = read('assets/css/mobile-theme-canonical.css');
const completionCss = read('assets/css/installation-completion.css');
const executionJs = read('assets/js/installation-execution.js');
const completionJs = read('assets/js/installation-completion.js');
const installationsService = read('assets/js/installations-service.js');
const appJs = read('assets/js/app.js');

check('Version package/version.json', pkg.version === version.version, `${pkg.version} / ${version.version}`);
check('Version pwa.js', pwa.includes(`CURRENT_VERSION = "${version.version}"`));
const escapedVersion = version.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
check('Version index query tokens', !index.match(new RegExp(`\\?v=(?!${escapedVersion})(?:[0-9]+\\.){2}[0-9]+`)));
check('Cache token service worker', sw.includes(version.cacheToken));
check('Canonical mobile theme registered', index.includes('assets/css/mobile-theme-canonical.css') && sw.includes('assets/css/mobile-theme-canonical.css'));
check('Theme runtime synchronizes html/body', appJs.includes('document.body?.dataset.theme') || (appJs.includes('root.dataset.theme') && appJs.includes('classList.toggle("dark-mode"')));
check('Completion mobile cards', completionCss.includes('@media (max-width: 767px)') && completionCss.includes('data-label'));
check('Current execution visit server ownership', installationsService.includes('select_installation_execution_visit') && installationsService.includes('selectExecutionRequest') && installationsService.includes('visitId||null'));
check('Execution stage ownership RPC', installationsService.includes('advance_installation_execution_stage'));
check('No arbitrary timeline fallback', !executionJs.includes('find((request) => hasExecutionProgress(request))'));
check(
  'Completion default pending invoice conversion',
  completionJs.includes('بانتظار التحويل إلى فاتورة') &&
    index.includes('installationCompletionReportFilter') &&
    index.includes('بانتظار التحويل إلى فاتورة')
);
check('Completion representative filter', index.includes('installationCompletionRepresentativeFilter'));
check(
  'Customer order number current contract',
  index.includes('installationCompletionCustomerOrderNumber') &&
    installationsService.includes('customer_order_number') &&
    index.includes('newInstallationQuotationId') &&
    !index.includes('newInstallationCustomerOrderNumber')
);
check('Gregorian calendar lock', [appJs, executionJs, completionJs].some((text) => text.includes('u-ca-gregory')));
check('Operational dropdown resilience', appJs.includes('Promise.allSettled'));
check('Reference scope migration present', exists('supabase/migrations/phase_m14_9_3_1_operational_reference_dropdown_scope_recovery.sql'));
check('Installation scope migration present', exists('supabase/migrations/phase_m14_9_3_installation_rls_consolidation_team_boundary.sql'));
check('Current ownership migration present', exists('supabase/migrations/phase_m14_9_4_mobile_tables_current_request_ownership.sql'));
check('Data accuracy migration present', exists('supabase/migrations/phase_m14_9_6_mobile_data_accuracy_filters_scale.sql'));

const idMatches = [...index.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
const duplicateIds = [...new Set(idMatches.filter((id, i) => idMatches.indexOf(id) !== i))];
check('Duplicate HTML IDs', duplicateIds.length === 0, duplicateIds.join(', '));

const localAssets = [...index.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)]
  .map((m) => m[1]).filter((p) => !/^https?:/.test(p));
const missing = [...new Set(localAssets.filter((p) => !exists(p.replace(/^\.\//, ''))))];
check('Referenced local CSS/JS assets exist', missing.length === 0, missing.join(', '));

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} — ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
}
const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exit(1);

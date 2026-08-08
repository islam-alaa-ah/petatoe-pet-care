import fs from 'node:fs';
const quotationService = fs.readFileSync('assets/js/quotations-service.js', 'utf8');
const installationModule = fs.readFileSync('assets/js/installations-module.js', 'utf8');
const app = fs.readFileSync('assets/js/app.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/phase_m14_9_8_7_2_quotation_conversion_visibility_consistency_recovery.sql', 'utf8');
const checks = [
  ['reverse canonical embed exists', quotationService.includes('installation_requests!installation_requests_quotation_id_fkey')],
  ['normalized pointer falls back to canonical request', quotationService.includes('row.installation_requests?.[0]?.id')],
  ['quotation cache schema bumped', quotationService.includes('QUOTATIONS_CACHE_SCHEMA_VERSION = 3')],
  ['installation creation invalidates quotation cache', installationModule.includes('invalidateQuotationCache')],
  ['workflow refresh event dispatched', installationModule.includes('kyum-quotation-workflow-updated')],
  ['app updates workflow state immediately', app.includes('installationRequestId: installationRequestId || item.installationRequestId || "pending-sync"')],
  ['canonical pointer repair exists', migration.includes('installation_request_id = r.id')],
  ['deterministic legacy recovery exists', migration.includes('deterministic_matches')]
];
let failed = 0;
for (const [name, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}`); if (!pass) failed += 1; }
if (failed) process.exit(1);

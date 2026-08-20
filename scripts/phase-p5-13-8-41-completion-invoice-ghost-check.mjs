import fs from 'node:fs';
const js=fs.readFileSync(new URL('../assets/js/installations-service.js',import.meta.url),'utf8');
const completion=fs.readFileSync(new URL('../assets/js/installation-completion.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/phase_p5_13_8_41_completion_invoice_visibility_recovery.sql',import.meta.url),'utf8');
const groupAuthorityMigration=fs.readFileSync(new URL('../supabase/migrations/phase_p5_13_8_42_completion_group_invoice_authority.sql',import.meta.url),'utf8');
const checks=[
  ['completion uses permission-safe invoice marker RPC', js.includes("db().rpc('get_installation_completion_invoice_markers')")],
  ['invoice group expansion is delegated to canonical DB authority', !js.includes('completionCandidateVisits') && groupAuthorityMigration.includes('get_installation_execution_group_visit_ids')],
  ['pending visits are excluded when invoiced', /for\(const v of pendingVisits\)[\s\S]{0,220}invoicedVisitIds\.has\(v\.id\)/.test(js)],
  ['confirmed visits remain excluded when invoiced', /for\(const v of confirmedHistoryVisits\)[\s\S]{0,240}invoicedVisitIds\.has\(v\.id\)/.test(js)],
  ['marker RPC is scoped to completion permission', migration.includes("has_screen_permission('installationCompletion','view')")],
  ['marker RPC preserves installation representative scope', migration.includes('can_access_installation_representative(r.representative_id)')],
  ['marker RPC excludes cancelled invoices', migration.includes("coalesce(si.status,'') <> 'ملغاة'")],
  ['completion local state drops invoiced rows immediately', completion.includes('removeInvoicedRowsFromLocalState')&&completion.includes('kyum-sales-invoice-created')],
];
let ok=0;
for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} - ${name}`); if(pass)ok++;}
console.log(`\n${ok}/${checks.length} checks passed`);
if(ok!==checks.length)process.exit(1);

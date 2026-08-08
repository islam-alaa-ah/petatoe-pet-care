import fs from 'node:fs';

const service = fs.readFileSync('assets/js/installations-service.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/phase_m14_9_8_7_1_quotation_installation_relationship_ambiguity_recovery.sql', 'utf8');
const version = JSON.parse(fs.readFileSync('version.json', 'utf8'));

const checks = [
  ['explicit canonical PostgREST relationship', service.includes('quotations!installation_requests_quotation_id_fkey')],
  ['ambiguous implicit relationship removed from query', !service.includes('quotation:quotations(id,quotation_number)')],
  ['reverse foreign key removal included', migration.includes("att.attname = 'installation_request_id'")],
  ['canonical foreign key guaranteed', migration.includes('installation_requests_quotation_id_fkey')],
  ['workflow pointer column preserved', migration.includes('Keep the column') || migration.includes('Keep the column and its values')],
  ['version 18.46.8', version.version === '18.46.8' && version.build === 184608]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);

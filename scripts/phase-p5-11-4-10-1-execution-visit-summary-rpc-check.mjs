import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(root, 'supabase/migrations/phase_p5_11_4_10_1_execution_visit_quantity_summary_rpc_recovery.sql');
const servicePath = path.join(root, 'assets/js/installations-service.js');
const migration = fs.readFileSync(migrationPath, 'utf8');
const service = fs.readFileSync(servicePath, 'utf8');

const checks = [
  ['Recovery migration exists', fs.existsSync(migrationPath)],
  ['RPC exact uuid/uuid signature recreated', /get_installation_execution_visit_quantity_summary\s*\(\s*p_request_id\s+uuid\s*,\s*p_visit_id\s+uuid\s*\)/s.test(migration)],
  ['RPC returns request_service_id', /request_service_id\s+uuid/i.test(migration)],
  ['RPC reads execution visits', /installation_execution_visits/i.test(migration)],
  ['RPC reads visit service quantities', /installation_execution_visit_services/i.test(migration)],
  ['Authenticated execute grant restored', /grant execute on function public\.get_installation_execution_visit_quantity_summary\(uuid,uuid\) to authenticated/i.test(migration)],
  ['PostgREST schema reload requested', /notify\s+pgrst\s*,\s*'reload schema'/i.test(migration)],
  ['Completion service calls exact RPC name', /\.rpc\('get_installation_execution_visit_quantity_summary'/.test(service)],
  ['Completion service sends p_request_id', /p_request_id\s*:\s*r\.id/.test(service)],
  ['Completion service sends p_visit_id', /p_visit_id\s*:\s*v\.id/.test(service)]
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (ok) pass += 1;
}
console.log(`\n${pass}/${checks.length} PASS`);
if (pass !== checks.length) process.exit(1);

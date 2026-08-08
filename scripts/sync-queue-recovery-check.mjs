import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const q = read('assets/js/offline-queue.js');
const checks = [
  ['Queue version M13.13', q.includes('version: "M13.13"')],
  ['Anonymous namespace blocked', q.includes('invalid_offline_queue_namespace') && !q.includes('return "user:anonymous"')],
  ['Offline session namespace used', q.includes('OfflineSessionStore?.currentUserId')],
  ['Interrupted processing recovery', q.includes('PROCESSING_TIMEOUT_MS') && q.includes('Recovered after interrupted synchronization')],
  ['Operation dedupe key', q.includes('dedupeKey') && q.includes('findDuplicate')],
  ['Idempotency key', q.includes('idempotencyKey')],
  ['Retry API', q.includes('async function retry(')],
  ['Discard API', q.includes('async function discard(')],
  ['Conflict listing', q.includes('async function listConflicts(')],
  ['Conflict resolution', q.includes('async function resolveConflict(')],
  ['Queue cleanup', q.includes('COMPLETED_RETENTION_MS') && q.includes('async function cleanup(')],
  ['Diagnostics stats', q.includes('openConflicts') && q.includes('lastSyncedAt')],
  ['Version unified', (() => { const version = JSON.parse(read('version.json')).version; return read('index.html').includes(`?v=${version}`) && read('assets/js/pwa.js').includes(version) && read('service-worker.js').includes(`petatoe-pwa-${version.replaceAll('.', '-')}`); })()]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`); if (!ok) failed++; }
console.log(`\n${checks.length-failed} / ${checks.length} PASS`);
process.exitCode = failed ? 1 : 0;

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const commands = [
  ['node', ['scripts/enterprise-offline-compliance-check.mjs']],
  ['node', ['scripts/offline-runtime-reliability-check.mjs']],
  ['node', ['scripts/cache-first-connectivity-check.mjs']],
  ['node', ['scripts/sync-queue-recovery-check.mjs']],
  ['node', ['scripts/remaining-modules-offline-check.mjs']],
  ['node', ['scripts/dashboard-offline-certification-check.mjs']],
  ['node', ['scripts/offline-write-completion-check.mjs']]
];
let failures = 0;
for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) failures += 1;
}

const required = [
  'assets/js/offline-session-store.js',
  'assets/js/smart-cache.js',
  'assets/js/sync-engine.js',
  'assets/js/offline-queue.js',
  'assets/js/offline-read-cache.js',
  'assets/js/sync-recovery-center.js',
  'service-worker.js',
  'enterprise-offline-policy.json'
];
for (const file of required) {
  if (!fs.existsSync(file)) { console.error(`FAIL - Missing ${file}`); failures += 1; }
}

const policy = JSON.parse(fs.readFileSync('enterprise-offline-policy.json','utf8'));
const onlineOnly = Object.entries(policy.domains || {}).filter(([,v]) => String(v.mode).includes('online_only'));
console.log(`Declared Online-Only domains: ${onlineOnly.length}`);
for (const [name, value] of onlineOnly) console.log(`INFO - ${name}: ${value.mode}`);

if (failures) {
  console.error(`Full Enterprise Offline Certification: FAIL (${failures} failed section(s))`);
  process.exit(1);
}
console.log('Full Enterprise Offline Certification: PASS WITH DECLARED ONLINE-ONLY EXCLUSIONS');

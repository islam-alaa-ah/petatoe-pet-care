import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const read = p => fs.readFileSync(p, 'utf8');
const manifestPath = 'supabase/migration-manifest.json';
const manifest = JSON.parse(read(manifestPath));
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const migrationDir = 'supabase/migrations';
const sqlFiles = fs.readdirSync(migrationDir)
  .filter(name => name.toLowerCase().endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b));
const inventory = new Map(manifest.historicalInventory.map(item => [item.path, item]));
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const listedPaths = [...inventory.keys()].sort();
const actualPaths = sqlFiles.map(name => path.posix.join(migrationDir, name)).sort();
const exactInventory = listedPaths.length === actualPaths.length && listedPaths.every((p, i) => p === actualPaths[i]);
const hashesMatch = actualPaths.every(p => {
  const item = inventory.get(p);
  return item && item.sha256 === sha256(p) && item.bytes === fs.statSync(p).size;
});
const foundationExists = manifest.policy.foundationBootstrapOrder.every(item => fs.existsSync(item.path));
const tail = manifest.policy.certifiedRecentTailOrder;
const tailUnique = new Set(tail).size === tail.length;
const tailPresent = tail.every(p => fs.existsSync(p) && inventory.has(p));
const noBlindReplay = manifest.policy.blindHistoricalReplayAllowed === false && manifest.policy.lexicographicReplayAllowed === false;
const hazardsDeclared = Array.isArray(manifest.orderingHazards?.examples) && manifest.orderingHazards.examples.length >= 3;
const releaseAligned = manifest.release.version === version.version && manifest.release.build === version.build && pkg.version === version.version;
const legacyAliasesRecorded = ['p5113.sql','p5114.sql'].every(name => manifest.orderingHazards.shortAliases.includes(name));

const checks = [
  ['release metadata matches migration manifest', releaseAligned],
  ['all historical SQL migrations are inventoried exactly once', exactInventory],
  ['all migration fingerprints and byte sizes match', hashesMatch],
  ['legacy foundation bootstrap files are present', foundationExists],
  ['blind / lexicographic historical replay is explicitly blocked', noBlindReplay],
  ['known ordering hazards are explicitly documented', hazardsDeclared],
  ['certified recent tail is unique and present in the inventory', tailUnique && tailPresent],
  ['legacy non-global aliases are recorded as ordering hazards', legacyAliasesRecorded]
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
  if (!ok) failures++;
}
console.log(`Migration manifest certification: ${checks.length - failures}/${checks.length} PASS`);
console.log(`Historical migration inventory: ${actualPaths.length} SQL files`);
console.log('Fresh-deployment status: GUARDED — use an approved production schema snapshot/migration ledger; do not blind-replay the historical directory.');
if (failures) process.exit(1);

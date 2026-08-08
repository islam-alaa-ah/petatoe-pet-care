import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policyPath = path.join(root, 'enterprise-offline-policy.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const jsRoot = path.join(root, 'assets', 'js');
const files = fs.readdirSync(jsRoot).filter(name => name.endsWith('.js')).map(name => `assets/js/${name}`);
const directDataPattern = /(?:\.from\s*\(|\.rpc\s*\(|customerSupabase|supabase\.createClient)/;
const writePattern = /\.(?:insert|update|upsert|delete)\s*\(/;
const registered = new Set(policy.registeredDirectDataFiles || []);
const violations = [];
const warnings = [];

function source(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

for (const file of files) {
  const text = source(file);
  if (directDataPattern.test(text) && !registered.has(file)) {
    violations.push(`${file}: direct data access is not registered in enterprise-offline-policy.json`);
  }
}

for (const [name, domain] of Object.entries(policy.domains || {})) {
  if (!fs.existsSync(path.join(root, domain.file))) {
    violations.push(`${name}: registered domain file is missing (${domain.file})`);
    continue;
  }
  const text = source(domain.file);
  if (domain.mode.startsWith('full_offline')) {
    if (!/KYUMSmartCache/.test(text)) violations.push(`${name}: full offline domain is missing Smart Cache integration`);
    if (!/KYUMSyncEngine/.test(text)) violations.push(`${name}: full offline domain is missing Delta Sync integration`);
    if (!/KYUMOfflineQueue/.test(text)) violations.push(`${name}: full offline domain is missing Offline Queue integration`);
    if (!/requirePermission|PermissionEngine|CustomerPermissions/.test(text)) violations.push(`${name}: full offline domain is missing a visible permission gate`);
  }
  if (domain.mode === 'offline_read_online_write' && !/KYUMSmartCache/.test(text)) {
    violations.push(`${name}: offline-readable domain is missing Smart Cache integration`);
  }
}

for (const [file, debt] of Object.entries(policy.temporaryDirectUiDebt || {})) {
  const text = source(file);
  if (writePattern.test(text) || /\.from\s*\(/.test(text)) {
    warnings.push(`${file}: temporary direct UI data path remains (${debt.join('; ')})`);
  }
}

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const requiredOrder = ['smart-cache.js', 'sync-engine.js', 'offline-queue.js', 'customers-service.js', 'followups-service.js', 'quotations-service.js', 'app.js'];
let previous = -1;
for (const asset of requiredOrder) {
  const current = index.indexOf(asset);
  if (current < 0) violations.push(`index.html: missing required asset ${asset}`);
  if (current >= 0 && current < previous) violations.push(`index.html: invalid architecture script order near ${asset}`);
  previous = Math.max(previous, current);
}

console.log('KYUM Enterprise Offline Architecture Compliance');
console.log(`Policy: ${policy.policyVersion}`);
console.log(`Registered domains: ${Object.keys(policy.domains || {}).length}`);
console.log(`Data-access files scanned: ${files.filter(file => directDataPattern.test(source(file))).length}`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (violations.length) {
  for (const violation of violations) console.error(`FAIL: ${violation}`);
  console.error(`Result: FAIL (${violations.length} violation(s), ${warnings.length} warning(s))`);
  process.exit(1);
}
console.log(`Result: PASS WITH ${warnings.length} DOCUMENTED WARNING(S)`);

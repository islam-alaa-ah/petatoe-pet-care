import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) { console.log(`PASS - ${name}`); pass++; }
  else { console.error(`FAIL - ${name}`); fail++; }
}

const loc = read('assets/js/localization-center.js');
const auth = read('assets/js/auth-session.js');
const index = read('index.html');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('supabase/migration-manifest.json'));
const sw = read('service-worker.js');
const pwa = read('assets/js/pwa.js');

check('release version is 18.56.94', version.version === '18.56.94' && pkg.version === '18.56.94' && pwa.includes('const CURRENT_VERSION = "18.56.94";'));
check('release build is 185694', version.build === 185694 && manifest.release?.build === 185694);
check('release phase is R44R38R5', manifest.release?.phase === 'R44R38R5');
check('cache token is R44R38R5', version.cacheToken === 'petatoe-pwa-18-56-94-language-refresh-persistence-r44r38r5-p5-13-8-72' && sw.includes(version.cacheToken));
check('all local asset query tokens are 18.56.94', !index.includes('?v=18.56.93') && (index.match(/\?v=18\.56\.94/g) || []).length >= 90);

check('localization owner can read stored language preference', loc.includes('function storedLanguagePreference()') && loc.includes('function hasStoredLanguagePreference()'));
check('localization owner exposes preferred-language bootstrap API', loc.includes('function applyPreferredLanguage(preferredLanguage,{preserveStored=false}={})') && loc.includes('applyPreferredLanguage,applyStatic'));
check('preferred-language bootstrap preserves stored language when requested', loc.includes("const language=preserveStored&&stored?stored:(preferredLanguage==='en'?'en':'ar')"));
check('manual language changes still persist to localStorage', loc.includes("localStorage.setItem(STORAGE_LANGUAGE,state.language)"));

check('session restore preserves stored language', auth.includes('if (data.session) await activate(data.session, { preserveStoredLanguage: true });'));
check('offline session restore preserves stored language', auth.includes('activate(session, { offline: true, preserveStoredLanguage: true })'));
check('fresh sign-in still uses profile default', auth.includes('await activate(data.session);') && !auth.includes('await activate(data.session, { preserveStoredLanguage: true });\n    } catch (error) {\n      const text = error?.message'));
check('identity bootstrap delegates language ownership to localization center', auth.includes('window.PetatoeLocalization.applyPreferredLanguage(preferredLanguage, { preserveStored: preserveStoredLanguage });'));
check('profile default language remains canonical for fresh login', auth.includes('const preferredLanguage = profile?.default_language === "en" ? "en" : "ar";'));

const sqlFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(x => x.endsWith('.sql'));
check('no SQL added in R44R38R5', sqlFiles.length === 270);

const protectedHashes = {
  'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
  'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
  'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
  'assets/js/sync-retention.js':'4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b',
  'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
  'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a',
  'assets/js/payroll-service.js':'9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6',
  'assets/js/sea-vibe-service.js':'072c48f7f5da3110e6c1e262ad4023e9d15901bbede66af3ca717615d1f184b1',
  'assets/js/vehicle-treasury-service.js':'9f00b2fe7527501a33d490e064a0f25b86d55298dc9cf0cba598927f07bc32e7',
  'assets/js/installations-service.js':'8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153',
  'assets/js/payroll.js':'76a4b0f9fda2025ae1276c8a2b5b070b95d5c14546867de95af47a935c3f1037',
  'assets/js/vehicle-treasury.js':'85a9179bfd4c9a910057d224789ef5b5ff4204c9be5ac90af7ea3389a3b03e10',
  'assets/js/app.js':'9134d1917e8c59e4475f21763c6963b467f9022883a88d1010f14411735e558b',
  'assets/css/style.css':'017f33fded71db455a4a61718242c62c8e1a43b3f658127b43b1ec32dff279de'
};
check('protected Offline/Sync/Permissions/business services are byte-identical', Object.entries(protectedHashes).every(([rel, expected]) => sha(rel) === expected));

const pruning = read('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql');
check('R44 pruning remains disabled', /disabled/i.test(pruning) && !/cron\.schedule\s*\(/i.test(pruning));

check('release localization keys exist', ['title','note1','note2','note3'].every(suffix => loc.includes(`pwa.update.release.r44r38r5.${suffix}`)));

console.log(`\nR44R38R5 Certification: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);

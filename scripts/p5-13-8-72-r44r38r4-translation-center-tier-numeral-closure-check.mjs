import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
let pass=0, fail=0;
const checks=[];
function check(name,ok,detail=''){checks.push({name,ok:Boolean(ok),detail});if(ok)pass++;else fail++;}
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const hash=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');

const version=JSON.parse(read('version.json'));
check('Version is 18.56.93',version.version==='18.56.93');
check('Build is 185693',version.build===185693);
check('Phase release title is R44R38R4',String(version.title||'').includes('R44R38R4'));

const payroll=read('assets/js/payroll.js');
check('Payroll tiers have app-owned Latin digit normalizer',payroll.includes('normalizeTierNumberInput'));
check('English tier controls avoid native number locale',payroll.includes("type=\"${english?'text':'number'}\""));
check('English tier controls use decimal input mode',payroll.includes('data-payroll-tier-latin-number="1"'));
check('Tier input event normalizes Arabic/Persian digits',payroll.includes("closest('[data-payroll-tier-latin-number]')")&&payroll.includes('normalizeTierNumberInput(input.value)'));
check('Tier save path normalizes display values before Number()',payroll.includes('const fromRaw=normalizeTierNumberInput')&&payroll.includes('rateRaw=normalizeTierNumberInput'));
check('Commission calculation service remains outside display fix',hash('assets/js/payroll-service.js')==='9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6');

const migrationPath='supabase/migrations/phase_p5_13_8_72_r44r38r4_geography_translation_residual_closure.sql';
const migration=read(migrationPath);
check('R44R38R4 geography migration exists',migration.includes('R44R38R4 — Geography Translation Residual Closure'));
check('Known Zahra legacy alias is source-backed',migration.includes("('حي الزهرة', 'Az Zahra Dist.'"));
check('Known Shefaa legacy alias is source-backed',migration.includes("('حي الشفاء', 'Ash Shefaa Dist.'"));
check('Known Mutanazahat legacy alias is source-backed',migration.includes("('حي المنتزهات', 'Al Mutanazahat Dist.'"));
check('Migration preserves valid custom name_en',migration.includes("nullif(btrim(n.name_en),'') is null")&&migration.includes("set name_en=t.name_en"));
check('Translation upsert preserves valid custom en_text',migration.includes('then excluded.en_text')&&migration.includes('else public.app_translations.en_text'));
const migrationExecutable=migration.replace(/^\s*--.*$/gm,'');
check('Migration has no DELETE/TRUNCATE/DROP TABLE',!(/\bdelete\b|\btruncate\b|\bdrop\s+table\b/i.test(migrationExecutable)));
check('Migration does not widen permissions',!(/grant\s+|revoke\s+|create\s+policy|alter\s+policy/i.test(migrationExecutable)));
check('Migration contains unresolved-neighborhood verification',migration.includes('MISSING_NAME_EN')&&migration.includes('MISSING_TRANSLATION_EN'));

const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const inv=manifest.historicalInventory||[];
const newEntry=inv.find(x=>x.path===migrationPath);
check('New migration is inventoried',Boolean(newEntry));
check('New migration manifest fingerprint matches',Boolean(newEntry)&&newEntry.sha256===hash(migrationPath)&&newEntry.bytes===fs.statSync(path.join(root,migrationPath)).size);
check('Manifest inventoried count is 267',manifest.inventoryStats?.sqlFileCount===267&&inv.length===267);
const physical=fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql'));
const inventoried=new Set(inv.map(x=>path.basename(x.path)));
const untracked=physical.filter(x=>!inventoried.has(x)).sort();
const expectedUntracked=['PETATOE-Jeddah-Neighborhood-Translation-Backfill.sql','PETATOE-Remaining-23-Neighborhoods-English-Backfill.sql','R44R37R2R1-Recovery.sql'].sort();
check('Pre-existing migration HOLD remains exactly three files',JSON.stringify(untracked)===JSON.stringify(expectedUntracked),untracked.join(', '));

const index=read('index.html');
const tokens=[...index.matchAll(/[?&]v=(18\.56\.\d+)/g)].map(m=>m[1]);
check('All local index asset tokens are 18.56.93',tokens.length>0&&tokens.every(v=>v==='18.56.93'),String(tokens.length));
check('PWA runtime version is 18.56.93',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.93";'));
check('Service worker cache token is R44R38R4',read('service-worker.js').includes('petatoe-pwa-18-56-93-translation-center-tier-numerals-r44r38r4-p5-13-8-72'));

const loc=read('assets/js/localization-center.js');
check('R44R38R4 release translation title exists',loc.includes('pwa.update.release.r44r38r4.title'));
check('R44R38R4 release translation notes exist',[1,2,3].every(n=>loc.includes(`pwa.update.release.r44r38r4.note${n}`)));

const protectedHashes={
  "assets/js/offline-queue.js": "5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7",
  "assets/js/smart-cache.js": "b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d",
  "assets/js/sync-engine.js": "7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e",
  "assets/js/sync-retention.js": "4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b",
  "assets/js/permissions.js": "bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456",
  "assets/js/permissions-service.js": "e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a",
  "assets/js/payroll-service.js": "9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6",
  "assets/js/sea-vibe-service.js": "072c48f7f5da3110e6c1e262ad4023e9d15901bbede66af3ca717615d1f184b1",
  "assets/js/vehicle-treasury-service.js": "9f00b2fe7527501a33d490e064a0f25b86d55298dc9cf0cba598927f07bc32e7",
  "assets/js/installations-service.js": "8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153",
  "supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql": "60ac42da073c1693c31d13ce5b7dd5ae954ca7b0005261e6e36722ab22cd0af9",
  "supabase/migrations/phase_p5_13_8_72_r43_production_retention_readiness_rollout_gate.sql": "85064501979f492cf954d0a5fe39bfe9d11364a63e8824aabfdc777fc19d2e74"
};
for(const [rel,expected] of Object.entries(protectedHashes)){
  check(`Protected byte-identical: ${rel}`,hash(rel)===expected);
}

console.log(`R44R38R4 Certification: ${pass}/${pass+fail} PASS${fail?` — ${fail} FAIL`:''}`);
for(const item of checks)console.log(`${item.ok?'PASS':'FAIL'} - ${item.name}${item.detail?` — ${item.detail}`:''}`);
if(fail)process.exit(1);

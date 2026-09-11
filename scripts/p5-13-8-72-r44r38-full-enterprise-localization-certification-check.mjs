import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const ROOT=process.cwd();
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
let pass=0,fail=0;const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} - ${name}`);ok?pass++:fail++;};
const migration='supabase/migrations/phase_p5_13_8_72_r44r38_full_enterprise_localization_certification.sql';
const sql=read(migration),manifest=JSON.parse(read('supabase/migration-manifest.json')),version=JSON.parse(read('version.json')),pkg=JSON.parse(read('package.json'));

function catalogRows(){
  const sandbox={console:{warn(){},log(){},error(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout(){return 0;},clearTimeout(){},window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}};sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;vm.runInNewContext(read('assets/js/localization-center.js'),sandbox,{filename:'localization-center.js'});return sandbox.window.PetatoeLocalization.getRows();
}
const rows=catalogRows(),keys=new Set(rows.map(x=>x.key)),AR=/[\u0600-\u06FF]/;
check('R44R38 catalog has 4993 canonical keys',rows.length===4993);
check('Arabic/English catalog parity has no English Arabic leakage',rows.every(x=>String(x.ar||'').trim()&&String(x.en||'').trim()&&!AR.test(String(x.en||''))));

const html=read('index.html');
const htmlLines=html.split(/\r?\n/);let staticDebt=0;
for(const line of htmlLines){if(!AR.test(line))continue;const covered=/data-(?:petatoe|execution)-i18n/.test(line);if(covered)continue;staticDebt += [...line.matchAll(/(?:placeholder|title|aria-label)=["']([^"']*[\u0600-\u06FF][^"']*)["']/g)].length;staticDebt += [...line.matchAll(/>([^<>]*[\u0600-\u06FF][^<>]*)</g)].length;}
check('Static HTML uncovered Arabic candidates are zero',staticDebt===0);

const jsFiles=fs.readdirSync(path.join(ROOT,'assets/js')).filter(x=>x.endsWith('.js'));
const refs=new Set();
for(const name of jsFiles){const src=read(`assets/js/${name}`);for(const re of [/(?:\b(?:t|tr|l1T|customerT|appointmentT|geoT)\s*\(|PetatoeLocalization\?\.t\?\.\s*\()\s*["']([^"']+)["']/g])for(const m of src.matchAll(re))refs.add(m[1]);}
for(const m of html.matchAll(/data-(?:petatoe|execution)-i18n(?:-(?:aria|title|placeholder|alt))?=["']([^"']+)["']/g))refs.add(m[1]);
check('All literal runtime/static localization references resolve', [...refs].every(k=>keys.has(k)));

const customerCols=new Map(rows.filter(x=>x.key.startsWith('customers.col.')).map(x=>[x.key,x]));
check('Customer core column Arabic defaults are corrected',customerCols.get('customers.col.code')?.ar==='الكود'&&customerCols.get('customers.col.name')?.ar==='الاسم'&&customerCols.get('customers.col.address')?.ar==='العنوان'&&customerCols.get('customers.col.mobile')?.ar==='الجوال');

const app=read('assets/js/app.js'),mobile=read('assets/js/mobile.js'),ops=read('assets/js/installation-operations-reports.js'),perm=read('assets/js/permission-engine.js'),install=read('assets/js/installations-module.js');
check('System Health retention surface uses localization owner',app.includes('const rt = (key, vars = {}) => l1T(`systemHealth.retention.${key}`, vars);')&&app.includes('rt("rollout.title")')&&app.includes('rt("dryRun.title")'));
check('Customer/Reference/Customer360 direct visible residuals are localized',!app.includes('options.innerHTML = \'<div class="searchable-select-empty">لا توجد نتائج مطابقة.</div>\'')&&!app.includes('alert(error instanceof Error ? error.message : "تعذر تصدير ملف Excel.")')&&!app.includes('input.setCustomValidity("اختر العميل من نتائج البحث.")'));
check('Reference-data partial-load messages use localized labels',app.includes('referenceData.error.partialLoad')&&app.includes('referenceData.item.representatives')&&app.includes('representatives.error.allowedList'));
check('Daily date-time locale follows active language with Gregorian Latin digits',app.includes('function kyumDisplayDateLocale() {\n  return l1Locale();\n}'));
check('Mobile daily progress fallback is localized',mobile.includes('dailyOperations.mobile.zeroProgress'));
check('Appointment service edit validation/save label are localized',install.includes('appointments.requests.servicesEdit.validation')&&install.includes('appointments.requests.servicesEdit.save'));
check('Permission disabled-action title is localized',perm.includes('permissions.error.actionDenied'));
check('Appointment operations filter output uses canonical localized helper',ops.includes("$('installationServiceOperationalFilterLabel').textContent=serviceFilterLabel();")&&!ops.includes("||'كل المندوبين',teams="));

const releaseKeys=['pwa.update.release.r44r38.title','pwa.update.release.r44r38.note1','pwa.update.release.r44r38.note2','pwa.update.release.r44r38.note3'];
check('R44R38 release localization keys resolve',releaseKeys.every(k=>keys.has(k)));

const sqlKeys=[...sql.matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
check('R44R38 migration contains 329 unique catalog rows',sqlKeys.length===329&&new Set(sqlKeys).size===329);
check('R44R38 migration is non-destructive',!/\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|alter\s+table[^;]+drop)\b/i.test(sql));
check('R44R38 migration preserves valid custom translations',sql.includes("else public.app_translations.ar_text")&&sql.includes("else public.app_translations.en_text"));
check('R44R38 migration safely repairs only legacy English placeholders in Arabic customer headers',sql.includes("excluded.translation_key='customers.col.code'")&&sql.includes("lower(btrim(public.app_translations.ar_text))='mobile'"));

const inv=manifest.historicalInventory?.find?.(x=>x.path===migration);
check('R44R38 migration fingerprint is inventoried',Boolean(inv)&&inv.sha256===sha(migration)&&inv.bytes===fs.statSync(path.join(ROOT,migration)).size);
check('R44R38 migration is in certified recent tail',manifest.policy?.certifiedRecentTailOrder?.includes?.(migration));
check('Migration inventory is 266/266',manifest.inventoryStats?.sqlFileCount===266&&manifest.historicalInventory?.length===266&&fs.readdirSync(path.join(ROOT,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length===266);

const cache='petatoe-pwa-18-56-89-localization-full-certification-r44r38-p5-13-8-72';
check('R44R38 version/build/package/PWA/cache are aligned',version.version==='18.56.89'&&version.build===185689&&pkg.version==='18.56.89'&&read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.89";')&&read('service-worker.js').includes(cache)&&version.cacheToken===cache);
const tokenMatches=[...html.matchAll(/[?&]v=(18\.\d+\.\d+)/g)].map(m=>m[1]);
check('All HTML local asset version tokens are 18.56.89',tokenMatches.length>0&&tokenMatches.every(v=>v==='18.56.89'));
check('Manifest release metadata is aligned to R44R38',manifest.release?.version==='18.56.89'&&manifest.release?.build===185689&&manifest.release?.phase==='R44R38');

const protectedHashes={
'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
'assets/js/sync-retention.js':'4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b',
'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a',
'assets/js/installations-service.js':'8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153',
'assets/js/installation-scheduling.js':'4abc85317826144e46de22a37f04188fc1c44c957978640d7689cb8dc1b5f958',
'assets/js/installation-execution.js':'fccf11de9e11108756de4669891348941a0aca8bab8c34fd5f4da547d5754fa7',
'assets/js/installation-completion.js':'34fad3e626904b7cdd45ad773d3b0cd15c08fc52aa00fd33c335c94dae7ab8e4',
'assets/js/payroll-service.js':'9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6',
'assets/js/sales-invoices-service.js':'f5199ee2071b7bf060842c24752d1de116e9dc88d8cba590022b001302f7629e',
'assets/js/vehicle-treasury-service.js':'9f00b2fe7527501a33d490e064a0f25b86d55298dc9cf0cba598927f07bc32e7',
'assets/js/sea-vibe-service.js':'072c48f7f5da3110e6c1e262ad4023e9d15901bbede66af3ca717615d1f184b1',
'assets/js/sea-vibe-payroll-service.js':'9d12f4df1a6f40e0c495ac760cef181ea1e5df904927c0f71963e2ea3864f574',
'assets/js/notification-center-service.js':'3e4e803faa96e540b1dbf6d48d5a913af5c6564d4bd401dbec4b8024cf25ee15',
'assets/js/whatsapp-template-service.js':'b3818328ffe6ed9aade0ff0abfe757eef2cfc9992778ac16019ef4b9d82f6292'};
check('Protected business/offline/sync/permission owners are byte-identical',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));

let cssHash=crypto.createHash('sha256');for(const name of fs.readdirSync(path.join(ROOT,'assets/css')).filter(x=>x.endsWith('.css')).sort()){cssHash.update(name);cssHash.update('\0');cssHash.update(fs.readFileSync(path.join(ROOT,'assets/css',name)));cssHash.update('\0');}
check('All CSS owners are byte-identical — no layer above layer',cssHash.digest('hex')==='82ef9f4afd7060595e4912e0a17b17220928fd49bcbe4c476674f67a5599ce90');
check('R43 retention gate is byte-identical',sha('supabase/migrations/phase_p5_13_8_72_r43_production_retention_readiness_rollout_gate.sql')==='85064501979f492cf954d0a5fe39bfe9d11364a63e8824aabfdc777fc19d2e74');
check('R44 bounded pruning engine remains byte-identical and disabled',sha('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql')==='60ac42da073c1693c31d13ce5b7dd5ae954ca7b0005261e6e36722ab22cd0af9'&&/execution_enabled\s*=\s*false/.test(read('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql')));

console.log(`R44R38 full enterprise localization certification: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);

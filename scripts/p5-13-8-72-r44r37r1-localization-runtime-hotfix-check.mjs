import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
const ROOT=process.cwd();
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
let pass=0,fail=0;const check=(n,c)=>{console.log(`${c?'PASS':'FAIL'} - ${n}`);c?pass++:fail++;};
const loc=read('assets/js/localization-center.js');
const app=read('assets/js/app.js');
const schedule=read('assets/js/installation-scheduling.js');
const migration='supabase/migrations/phase_p5_13_8_72_r44r37r1_localization_runtime_placeholder_page_meta_hotfix.sql';
const sql=read(migration);
const sandbox={console:{warn(){},log(){},error(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout(){return 0;},clearTimeout(){},window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}};sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
vm.runInNewContext(loc,sandbox,{filename:'localization-center.js'});
const L=sandbox.window.PetatoeLocalization;const rows=L.getRows();const keys=new Set(rows.map(x=>x.key));
const required=[
'appointments.common.appointmentCountOne','appointments.common.appointmentCountMany','appointments.schedule.completedCountOne','appointments.schedule.completedCountMany','appointments.schedule.openDayAria','appointments.schedule.closeDayAria',
'appointments.overview.page.title','appointments.overview.page.subtitle','appointments.requests.page.subtitle','appointments.schedule.page.subtitle','appointments.completion.page.subtitle','appointments.exceptions.page.subtitle','appointments.reports.page.subtitle','appointmentSettings.page.subtitle','shared.notifications.center.pageSubtitle'];
check('All R44R37R1 runtime/page-meta keys resolve',required.every(k=>keys.has(k)));
L.setLanguage('en');
check('English appointment counters interpolate',L.t('appointments.common.appointmentCountMany',{count:7})==='7 appointments'&&L.t('appointments.schedule.completedCountMany',{count:3})==='3 completed appointments');
check('English day ARIA interpolates',L.t('appointments.schedule.openDayAria',{date:'11/09/2026'})==='Open 11/09/2026');
L.setLanguage('ar');
check('Arabic appointment counters interpolate without raw placeholders',L.t('appointments.common.appointmentCountMany',{count:7})==='7 مواعيد'&&L.t('appointments.schedule.completedCountMany',{count:3})==='3 مواعيد مكتملة');
check('Arabic day ARIA interpolates without raw placeholders',L.t('appointments.schedule.closeDayAria',{date:'11/09/2026'})==='إغلاق يوم 11/09/2026');
// All translation-looking string literals under known namespaces must resolve, including ternary/dynamic-key literals.
const prefixes=new Set(rows.map(x=>String(x.key).split('.')[0]));
const literal=/["']([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_{}-]+){1,})["']/g;
const unresolved=[];
for(const name of fs.readdirSync(path.join(ROOT,'assets/js')).filter(x=>x.endsWith('.js'))){const src=read(`assets/js/${name}`);for(const m of src.matchAll(literal)){const k=m[1];if(prefixes.has(k.split('.')[0])&&!keys.has(k))unresolved.push(`${name}:${k}`);}}
check('No unresolved localization-key literals remain across assets/js',unresolved.length===0);
if(unresolved.length) console.log(unresolved.slice(0,30).join('\n'));
// No static data-i18n binding may point at a parameterized key, because static application has no vars.
const placeholders=new Set(rows.filter(x=>/\{\w+\}/.test(String(x.ar||''))||/\{\w+\}/.test(String(x.en||''))).map(x=>x.key));
const staticBad=[];for(const f of ['index.html',...fs.readdirSync(path.join(ROOT,'assets/js')).filter(x=>x.endsWith('.js')).map(x=>`assets/js/${x}`)]){const src=read(f);for(const m of src.matchAll(/data-(?:petatoe|execution)-i18n(?:-[a-z]+)?=["']([^"']+)["']/g)){if(placeholders.has(m[1]))staticBad.push(`${f}:${m[1]}`);}}
check('No parameterized key is bound through static data-i18n',staticBad.length===0);
// Both app page-meta maps must cover every declared screen except installationExecution (special canonical pageMeta()).
const pageBlock=app.slice(app.indexOf('const pageMeta = {'),app.indexOf('\n};',app.indexOf('const pageMeta = {'))+3);
const pageNames=[...pageBlock.matchAll(/^\s*([A-Za-z0-9_]+): \[/gm)].map(m=>m[1]);
const maps=[...app.matchAll(/const localizedPageMetaKeys = \{([^;]+)\};/gs)].map(m=>new Set([...m[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)].map(x=>x[1])));
const expected=pageNames.filter(x=>x!=='installationExecution');
check('Both page-meta localization maps cover all non-special screens',maps.length===2&&maps.every(set=>expected.every(x=>set.has(x))));
check('Appointment Scheduling header uses canonical localized title/subtitle keys',maps.every(set=>set.has('installationSchedule'))&&app.includes('installationSchedule:["appointments.schedule.title","appointments.schedule.page.subtitle"]'));
check('Notification/Translation/About headers use canonical localization keys',app.includes('notificationCenter:["shared.notifications.center.title","shared.notifications.center.pageSubtitle"]')&&app.includes('translationCenter:["translationCenter.page.title","translationCenter.page.subtitle"]')&&app.includes('aboutApp:["aboutApp.page.title","aboutApp.page.note"]'));
check('Schedule language change rerenders calendar and cached status',schedule.includes("petatoe-language-changed',()=>{if(!document.getElementById('installationScheduleView')?.classList.contains('hidden')){renderCalendar();renderCacheStatus()}}")&&schedule.includes('function renderCacheStatus()'));
const sqlKeys=[...sql.matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
check('Hotfix migration has unique localization keys',sqlKeys.length===new Set(sqlKeys).size);
check('Hotfix migration currently seeds all functional keys',required.every(k=>sqlKeys.includes(k)));
check('Hotfix migration is non-destructive',!/\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|alter\s+table[^;]+drop)\b/i.test(sql));
check('Hotfix migration preserves customized translations',sql.includes("case when nullif(btrim(public.app_translations.ar_text),'') is null")&&sql.includes("case when nullif(btrim(public.app_translations.en_text),'') is null"));
const protectedHashes={
'assets/js/installations-service.js':'8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153',
'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456'};
check('Protected appointment/offline/sync/permission owners remain byte-identical',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
const baseCss='/mnt/data/r44r37_baseline_snapshot/assets/css';
let cssSame=true;for(const n of fs.readdirSync(path.join(ROOT,'assets/css')).filter(x=>x.endsWith('.css'))){const a=fs.readFileSync(path.join(ROOT,'assets/css',n)),b=fs.readFileSync(path.join(baseCss,n));if(!a.equals(b)){cssSame=false;break;}}
check('All CSS files remain byte-identical — no layer above layer',cssSame);
const version=JSON.parse(read('version.json'));
if(version.version==='18.56.84'){
 const pkg=JSON.parse(read('package.json'));const pwa=read('assets/js/pwa.js'),sw=read('service-worker.js');
 check('R44R37R1 version/build/cache aligned',version.build===185684&&pkg.version==='18.56.84'&&pwa.includes('const CURRENT_VERSION = "18.56.84";')&&sw.includes('petatoe-pwa-18-56-84-localization-runtime-hotfix-r44r37r1-p5-13-8-72'));
 check('R44R37R1 release keys resolve',['pwa.update.release.r44r37r1.title','pwa.update.release.r44r37r1.note1','pwa.update.release.r44r37r1.note2','pwa.update.release.r44r37r1.note3'].every(k=>keys.has(k)));
}else check('Pre-version gate remains on R44R37',version.version==='18.56.83'&&version.build===185683);
console.log(`R44R37R1 localization runtime hotfix certification: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);

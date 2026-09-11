import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,rel))).digest('hex');
let pass=0,fail=0;
function check(label,ok){if(ok){console.log(`PASS - ${label}`);pass++;}else{console.error(`FAIL - ${label}`);fail++;}}

const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const html=read('index.html');
const loc=read('assets/js/localization-center.js');
const moduleJs=read('assets/js/installations-module.js');
const scheduleJs=read('assets/js/installation-scheduling.js');
const settingsJs=read('assets/js/installation-settings-management.js');
const reportsJs=read('assets/js/installation-operations-reports.js');
const completionJs=read('assets/js/installation-completion.js');
const pwa=read('assets/js/pwa.js');
const sw=read('service-worker.js');
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const migration='supabase/migrations/phase_p5_13_8_72_r44r34_appointments_l3_localization_completion.sql';
const sql=read(migration);
const expectedVersion='18.56.80';
const expectedBuild=185680;
const cacheToken='petatoe-pwa-18-56-80-appointments-l3-r44r34-p5-13-8-72';

check('R44R34 version/build aligned',version.version===expectedVersion&&version.build===expectedBuild&&pkg.version===expectedVersion);
check('PWA and Service Worker release aligned',pwa.includes(`const CURRENT_VERSION = "${expectedVersion}";`)&&sw.includes(`const CACHE_VERSION = "${cacheToken}";`));
check('index asset tokens aligned',!html.includes('?v=18.56.79')&&(html.match(/\?v=18\.56\.80/g)||[]).length>=90);
check('migration manifest release aligned',manifest.release?.version===expectedVersion&&manifest.release?.build===expectedBuild);

const staticKeys=[
  'appointments.requests.kpiAria','appointments.status.pendingReview','appointments.schedule.calendarAria',
  'appointments.exceptions.title','appointments.reports.services.overviewTitle','appointmentSettings.page.title'
];
check('Appointments static surfaces use localization keys',staticKeys.every(k=>html.includes(k)));

check('Appointment request/new runtime uses canonical localization',moduleJs.includes('appointmentNew.prefill.selectedContract')&&moduleJs.includes('appointmentNew.edit.savedRescheduled')&&moduleJs.includes('appointmentNew.validation.scheduleComplete'));
check('Scheduling runtime uses canonical localization',scheduleJs.includes('appointments.schedule.dayAria')&&scheduleJs.includes('appointments.schedule.validation.duplicateTeamSlot')&&scheduleJs.includes('appointments.schedule.cancelledSuccess'));
check('Appointment settings runtime uses canonical localization',settingsJs.includes('appointmentSettings.excel.uploading')&&settingsJs.includes('appointmentSettings.error.activeTeamDependency')&&settingsJs.includes('appointmentSettings.confirm.delete'));
check('Exceptions/reports runtime uses canonical localization',reportsJs.includes('appointments.exceptions.reason.customerAbsent')&&reportsJs.includes('appointments.reports.summary.payment.todaySales')&&reportsJs.includes('appointments.reports.services.compareLabel'));
check('Completion runtime uses canonical localization',completionJs.includes('appointments.completion.validation.noServicesToConfirm')&&completionJs.includes('appointments.completion.error.serviceLineIdentity')&&completionJs.includes('appointments.completion.error.missingUi'));

check('Appointment surfaces rerender on language change',
  moduleJs.includes("petatoe-language-changed")&&scheduleJs.includes("petatoe-language-changed")&&settingsJs.includes("petatoe-language-changed")&&reportsJs.includes("petatoe-language-changed")&&completionJs.includes("petatoe-language-changed"));

// Evaluate the canonical catalog and verify all literal L3 references resolve.
const sandbox={console:{warn(){},log(){},error(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout(){return 0;},clearTimeout(){},window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}};
sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
vm.runInNewContext(loc,sandbox,{filename:'localization-center.js'});
const rows=sandbox.window.PetatoeLocalization.getRows();
const keySet=new Set(rows.map(x=>x.key));
const ar=/[\u0600-\u06FF]/;
check('Localization catalog has 4044 keys with Arabic/English parity',rows.length===4044&&rows.every(x=>String(x.ar||'').trim()&&String(x.en||'').trim()&&!ar.test(String(x.en||''))));
const literalRefs=new Set();
for(const source of [html,moduleJs,scheduleJs,settingsJs,reportsJs,completionJs]){
  for(const re of [/data-petatoe-i18n(?:-[a-z]+)?=["']([^"']+)["']/g,/\bt\(\s*["']([^"']+)["']/g,/appointmentT\(\s*["']([^"']+)["']/g,/\btr\(\s*["']([^"']+)["']/g]){
    for(const m of source.matchAll(re))literalRefs.add(m[1]);
  }
}
check('All literal L3 localization references resolve', [...literalRefs].every(k=>keySet.has(k)));
check('R44R34 release localization keys exist',['pwa.update.release.r44r34.title','pwa.update.release.r44r34.note1','pwa.update.release.r44r34.note2','pwa.update.release.r44r34.note3'].every(k=>keySet.has(k)));

const sqlKeys=[...sql.matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
check('R44R34 migration has 781 unique translation keys',sqlKeys.length===781&&new Set(sqlKeys).size===781);
check('R44R34 migration is non-destructive',!/\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|alter\s+table[^;]+drop)\b/i.test(sql));
check('R44R34 migration preserves custom translations',sql.includes("case when nullif(btrim(public.app_translations.ar_text),'') is null")&&sql.includes("case when nullif(btrim(public.app_translations.en_text),'') is null"));
const inv=manifest.historicalInventory?.find?.(x=>x.path===migration);
check('R44R34 migration inventoried with matching fingerprint',Boolean(inv)&&inv.sha256===sha(migration)&&inv.bytes===fs.statSync(path.join(ROOT,migration)).size);
check('R44R34 migration in certified order',manifest.policy?.certifiedRecentTailOrder?.includes?.(migration));

const protectedHashes={
 'assets/js/installations-service.js':'8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153',
 'assets/js/installation-execution.js':'fccf11de9e11108756de4669891348941a0aca8bab8c34fd5f4da547d5754fa7',
 'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
 'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
 'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
 'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
 'assets/js/payroll-service.js':'9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6',
 'assets/js/sales-invoices-service.js':'f5199ee2071b7bf060842c24752d1de116e9dc88d8cba590022b001302f7629e',
 'assets/js/sea-vibe.js':'4128d4e7272a791fc8c990304cc879c194d0976e3a79db5ac4f5d16e94b34985',
 'assets/js/vehicle-treasury.js':'62ad93d010534e0002c3a72cb60582f886914eeb59910cb1155ecbe6d1d902a4'
};
check('Protected appointment/offline/permissions/financial owners are byte-identical to R44R33',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
check('L6 generated export owners remain untouched',sha('assets/js/export-center.js')==='46114bbefe42832d274777e02f352af772b1cb737ebf620fdd365820a5d420cc'&&sha('assets/js/customer360-export.js')==='42db55e49ed216b98d11d35a66530efdf953da2810630978ff6ab72d3595fabb');

console.log(`R44R34 certification: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);

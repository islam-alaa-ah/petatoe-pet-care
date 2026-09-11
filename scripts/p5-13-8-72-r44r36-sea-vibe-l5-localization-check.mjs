import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
const ROOT=process.cwd();
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
let pass=0,fail=0;const check=(n,c)=>{console.log(`${c?'PASS':'FAIL'} - ${n}`);c?pass++:fail++;};
const html=read('index.html'),sea=read('assets/js/sea-vibe.js'),pay=read('assets/js/sea-vibe-payroll.js'),loc=read('assets/js/localization-center.js');
const migration='supabase/migrations/phase_p5_13_8_72_r44r36_sea_vibe_l5_localization_residual.sql';
const sql=read(migration),manifest=JSON.parse(read('supabase/migration-manifest.json'));
const sandbox={console:{warn(){},log(){},error(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout(){return 0;},clearTimeout(){},window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}};sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
vm.runInNewContext(loc,sandbox,{filename:'localization-center.js'});const rows=sandbox.window.PetatoeLocalization.getRows();const keys=new Set(rows.map(x=>x.key));const ar=/[\u0600-\u06FF]/;
check('Localization catalog Arabic/English parity is intact',rows.every(x=>String(x.ar||'').trim()&&String(x.en||'').trim()&&!ar.test(String(x.en||''))));
const refs=new Set();for(const src of [html,sea,pay])for(const re of [/data-petatoe-i18n(?:-[a-z]+)?=["']([^"']+)["']/g,/\bt\(\s*["']([^"']+)["']/g])for(const m of src.matchAll(re))refs.add(m[1]);
check('All SEA VIBE literal localization references resolve',[...refs].filter(k=>k.startsWith('seaVibe.')||k.startsWith('seaVibePayroll.')||k==='payroll.commissionPeriod.afterMonth').every(k=>keys.has(k)));
check('SEA VIBE UI translates service errors in display layer',sea.includes('const uiMessage=')&&!/\b(?:alert|showStatus)\([^\n;]*err\.message/.test(sea));
check('SEA VIBE payroll UI translates service errors in display layer',pay.includes('const uiMessage=')&&!/setStatus\([^\n;]*error\.message/.test(pay));
check('Stored system descriptions are localized at display time only',sea.includes('const systemText=')&&sea.includes('systemText(x.description)')&&sea.includes('systemText(x.notes)'));
check('SEA VIBE dates are Gregorian with Latin digits',sea.includes("ar-SA-u-ca-gregory-nu-latn"));
check('SEA VIBE customer toggles and fuel tabs have localized ARIA',html.includes('data-petatoe-i18n-aria="seaVibe.customer.openListAria"')&&html.includes('data-petatoe-i18n-aria="seaVibe.fuel.manageAria"'));
check('SEA VIBE initial KPI values do not leak Arabic units',!html.includes('id="seaVibeZawelBalance">0 نقطة')&&!html.includes('id="seaVibeFuelBalanceLiters">0 لتر')&&!html.includes('id="seaVibeFuelSettlementBalanceLiters">0 لتر'));
check('Zawel fixed rate is localized',html.includes('data-petatoe-i18n="seaVibe.zawel.ratePoints"')&&html.includes('data-petatoe-i18n="seaVibe.zawel.rateSar"'));
const serviceErrRows=rows.filter(x=>x.key.startsWith('seaVibe.service.error.')||x.key.startsWith('seaVibePayroll.service.error.'));
check('SEA VIBE service error residual catalog is populated',serviceErrRows.length>=120&&serviceErrRows.every(x=>x.type==='error'));
const sqlKeys=[...sql.matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
check('R44R36 migration keys are unique',sqlKeys.length===new Set(sqlKeys).size);
check('R44R36 migration is non-destructive',!/\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|alter\s+table[^;]+drop)\b/i.test(sql));
check('R44R36 migration preserves customized translations',sql.includes("case when nullif(btrim(public.app_translations.ar_text),'') is null")&&sql.includes("case when nullif(btrim(public.app_translations.en_text),'') is null"));
const inv=manifest.historicalInventory?.find?.(x=>x.path===migration);check('R44R36 migration fingerprint is inventoried',Boolean(inv)&&inv.sha256===sha(migration)&&inv.bytes===fs.statSync(path.join(ROOT,migration)).size);
check('R44R36 migration is in certified recent tail',manifest.policy?.certifiedRecentTailOrder?.includes?.(migration));
const protectedHashes={
'assets/js/sea-vibe-service.js':'072c48f7f5da3110e6c1e262ad4023e9d15901bbede66af3ca717615d1f184b1',
'assets/js/sea-vibe-payroll-service.js':'9d12f4df1a6f40e0c495ac760cef181ea1e5df904927c0f71963e2ea3864f574',
'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456'};
check('SEA VIBE services and protected offline/permission owners are byte-identical',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
check('SEA VIBE CSS owner is byte-identical',sha('assets/css/sea-vibe.css')==='c1d765212d33a962b08f8d18033620f2ed86c9bbc49fa26b8c902c8ec37d7ddb');
const version=JSON.parse(read('version.json'));const final=version.version==='18.56.82';
if(final){const pkg=JSON.parse(read('package.json'));const pwa=read('assets/js/pwa.js'),sw=read('service-worker.js');check('R44R36 version/build/cache aligned',version.build===185682&&pkg.version==='18.56.82'&&pwa.includes('const CURRENT_VERSION = "18.56.82";')&&sw.includes('petatoe-pwa-18-56-82-sea-vibe-l5-r44r36-p5-13-8-72'));check('R44R36 release localization keys resolve',['pwa.update.release.r44r36.title','pwa.update.release.r44r36.note1','pwa.update.release.r44r36.note2','pwa.update.release.r44r36.note3'].every(k=>keys.has(k)));check('R44R36 migration has 142 translation keys',sqlKeys.length===142);check('Manifest release metadata aligned',manifest.release?.version==='18.56.82'&&manifest.release?.build===185682);}else{check('Pre-version gate stays on R44R35',version.version==='18.56.81'&&version.build===185681);check('Pre-version R44R36 migration has 138 translation keys',sqlKeys.length===138);}
console.log(`R44R36 SEA VIBE L5 certification: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);

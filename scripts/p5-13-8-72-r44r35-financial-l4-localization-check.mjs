import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,rel))).digest('hex');
let pass=0,fail=0;const check=(label,ok)=>{if(ok){console.log(`PASS - ${label}`);pass++;}else{console.error(`FAIL - ${label}`);fail++;}};
const html=read('index.html');const loc=read('assets/js/localization-center.js');const payroll=read('assets/js/payroll.js');const invoices=read('assets/js/sales-invoices.js');const treasury=read('assets/js/vehicle-treasury.js');
const manifest=JSON.parse(read('supabase/migration-manifest.json'));const migration='supabase/migrations/phase_p5_13_8_72_r44r35_financial_runtime_localization.sql';const sql=read(migration);
check('Financial static surfaces use canonical localization',[
'invoices.summary.aria','invoices.loading','vehicleTreasury.filter.searchPlaceholder','vehicleTreasury.loading','vehicleTreasury.expense.addTitle','vehicleTreasury.expense.dialogNote','vehicleTreasury.expense.team','vehicleTreasury.expense.date','vehicleTreasury.expense.description','vehicleTreasury.expense.amount','vehicleTreasury.expense.notes','shared.money.zeroSar'
].every(k=>html.includes(k)));
check('Payroll visible service errors use display-layer translator',payroll.includes('uiMessage')&&/uiMessage\(error\?\.message|uiMessage\(error\.message/.test(payroll));
check('Sales invoice runtime errors and attachments use canonical display localization',invoices.includes('const uiMessage')&&invoices.includes('const attachmentName')&&invoices.includes("invoices.attachments.item")&&invoices.includes("petatoe-language-changed"));
check('Vehicle treasury uses language-aware Gregorian/Latin display formatting',treasury.includes("ar-SA-u-ca-gregory-nu-latn")&&treasury.includes("ar-SA-u-nu-latn")&&treasury.includes('const dateLabel')&&treasury.includes('const money'));
check('Vehicle treasury rerenders on language change',treasury.includes("petatoe-language-changed")&&treasury.includes('applyStatic')&&treasury.includes('renderSummary')&&treasury.includes('renderRows'));
check('Financial UI sources translate service errors without modifying service contracts',payroll.includes('translateMessage')&&invoices.includes('translateMessage')&&treasury.includes('translateMessage'));
const sandbox={console:{warn(){},log(){},error(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout(){return 0;},clearTimeout(){},window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}};sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
vm.runInNewContext(loc,sandbox,{filename:'localization-center.js'});const rows=sandbox.window.PetatoeLocalization.getRows();const keySet=new Set(rows.map(x=>x.key));const ar=/[\u0600-\u06FF]/;
check('Localization catalog has Arabic/English parity and no English Arabic leakage',rows.every(x=>String(x.ar||'').trim()&&String(x.en||'').trim()&&!ar.test(String(x.en||''))));
const l4FunctionalKeys=[...keySet].filter(k=>k==='shared.money.zeroSar'||k.startsWith('vehicleTreasury.')||k.startsWith('invoices.attachments.')||k.startsWith('invoices.error.'));
check('L4 functional catalog keys are present',l4FunctionalKeys.length>=61);
const literalRefs=new Set();for(const source of [html,payroll,invoices,treasury])for(const re of [/data-petatoe-i18n(?:-[a-z]+)?=["']([^"']+)["']/g,/\bt\(\s*["']([^"']+)["']/g])for(const m of source.matchAll(re))literalRefs.add(m[1]);
check('All literal financial localization references resolve',[...literalRefs].every(k=>keySet.has(k)));
const sqlKeys=[...sql.matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
check('R44R35 migration keys are unique',sqlKeys.length===new Set(sqlKeys).size&&sqlKeys.length>=61);
check('R44R35 migration is non-destructive',!/\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|alter\s+table[^;]+drop)\b/i.test(sql));
check('R44R35 migration preserves custom translations',sql.includes("case when nullif(btrim(public.app_translations.ar_text),'') is null")&&sql.includes("case when nullif(btrim(public.app_translations.en_text),'') is null"));
const inv=manifest.historicalInventory?.find?.(x=>x.path===migration);check('R44R35 migration inventoried with matching fingerprint',Boolean(inv)&&inv.sha256===sha(migration)&&inv.bytes===fs.statSync(path.join(ROOT,migration)).size);
check('R44R35 migration in certified order',manifest.policy?.certifiedRecentTailOrder?.includes?.(migration));
const protectedHashes={
'assets/js/payroll-service.js':'9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6',
'assets/js/sales-invoices-service.js':'f5199ee2071b7bf060842c24752d1de116e9dc88d8cba590022b001302f7629e',
'assets/js/vehicle-treasury-service.js':'9f00b2fe7527501a33d490e064a0f25b86d55298dc9cf0cba598927f07bc32e7',
'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456'};
check('Protected finance/offline/permissions service owners are byte-identical',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
const cssChanged=['assets/css/payroll.css','assets/css/sales-invoices.css','assets/css/vehicle-treasury.css'].some(f=>sha(f)!==crypto.createHash('sha256').update(fs.readFileSync(path.join('/mnt/data/r44r34_fin_baseline',f))).digest('hex'));
check('No financial CSS owner changed in L4',!cssChanged);
const version=JSON.parse(read('version.json'));const final=version.version==='18.56.81';
if(final){const pkg=JSON.parse(read('package.json'));const pwa=read('assets/js/pwa.js');const sw=read('service-worker.js');check('R44R35 version/build aligned',version.build===185681&&pkg.version==='18.56.81'&&pwa.includes('const CURRENT_VERSION = "18.56.81";')&&sw.includes('petatoe-pwa-18-56-81-financial-l4-r44r35-p5-13-8-72'));check('R44R35 release localization keys exist',['pwa.update.release.r44r35.title','pwa.update.release.r44r35.note1','pwa.update.release.r44r35.note2','pwa.update.release.r44r35.note3'].every(k=>keySet.has(k)));check('R44R35 migration has 65 translation keys',sqlKeys.length===65);check('Manifest release aligned',manifest.release?.version==='18.56.81'&&manifest.release?.build===185681);}else{check('Pre-version gate remains on R44R34',version.version==='18.56.80'&&version.build===185680);check('Pre-version migration has 61 translation keys',sqlKeys.length===61);}
console.log(`R44R35 financial L4 certification: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);

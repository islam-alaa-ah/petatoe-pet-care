import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const bytes=p=>fs.readFileSync(path.join(ROOT,p));
const sha=p=>crypto.createHash('sha256').update(bytes(p)).digest('hex');
const AR=/[\u0600-\u06FF]/;
let failures=0;
const check=(label,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'} - ${label}${detail?` (${detail})`:''}`);if(!ok)failures++;};

function parseCatalog(){
  const sandbox={console:{warn(){},log(){},error(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},CustomEvent:class{},setTimeout(){return 0;},clearTimeout(){},window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}};
  sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
  vm.runInNewContext(read('assets/js/localization-center.js'),sandbox,{filename:'localization-center.js'});
  return sandbox.window.PetatoeLocalization.getRows();
}

const rows=parseCatalog();
const rowMap=new Map(rows.map(r=>[r.key,r]));
const l1Routes={
  auth:['login','core'],permissions:['permissions','system'],activityLog:['activityLog','system'],backups:['backups','system'],diagnostics:['systemHealth','system'],performance:['systemHealth','system'],syncRecovery:['syncRecoveryCenter','system'],systemHealth:['systemHealth','system'],systemSettings:['systemSettings','system'],aboutApp:['aboutApp','system'],pwa:['aboutApp','system'],users:['users','system'],sidebar:['sidebar','navigation'],shared:['shared','core']
};
const expectedAdded={auth:23,permissions:32,activityLog:22,backups:52,diagnostics:101,performance:33,syncRecovery:52,systemHealth:125,systemSettings:26,aboutApp:42,pwa:18,users:101,sidebar:1,shared:11};
for(const [prefix,[screen,module]] of Object.entries(l1Routes)){
  const scoped=rows.filter(r=>r.key.startsWith(prefix+'.'));
  check(`${prefix} catalog route`,scoped.every(r=>r.screenKey===screen&&r.moduleName===module&&r.ar?.trim()&&r.en?.trim()&&!AR.test(r.en)),`${scoped.length} keys`);
}
check('catalog contains R44R20 L1 keys',rows.length>=2134,`${rows.length} total`);
const release=JSON.parse(read('version.json'));
check('R44R20 release title uses localization key',release.titleI18nKey==='pwa.update.release.r44r20.title'&&rowMap.has(release.titleI18nKey));
check('R44R20 release notes use localization keys',Array.isArray(release.notesI18nKeys)&&release.notesI18nKeys.length===3&&release.notesI18nKeys.every(key=>rowMap.has(key)));
check('PWA rerenders localized release metadata on language change',read('assets/js/pwa.js').includes('renderReleaseMetadata(dialog, updateState.latestRelease)'));

const migration='supabase/migrations/phase_p5_13_8_72_r44r20_localization_l1_core_shell_system_admin.sql';
const sql=read(migration);
const seedBlock=sql.split(')\ninsert into public.app_translations')[0];
const seedKeys=[...seedBlock.matchAll(/^\s*\('((?:''|[^'])+)'/gm)].map(m=>m[1].replaceAll("''","'"));
const seedCounts={};for(const key of seedKeys){const p=key.split('.')[0];seedCounts[p]=(seedCounts[p]||0)+1;}
check('migration seeds exactly the R44R20 delta',seedKeys.length===639,`${seedKeys.length} keys`);
for(const [prefix,count] of Object.entries(expectedAdded))check(`migration ${prefix} delta`,seedCounts[prefix]===count,`${seedCounts[prefix]||0}/${count}`);
check('migration preserves customized Arabic',sql.includes("coalesce(trim(public.app_translations.ar_text),'')='' then excluded.ar_text else public.app_translations.ar_text"));
check('migration preserves customized English',sql.includes("coalesce(trim(public.app_translations.en_text),'')='' then excluded.en_text else public.app_translations.en_text"));
check('migration has no destructive / permission SQL',!/(^|\s)(delete\s+from|truncate|drop\s+|grant\s+|revoke\s+|alter\s+policy|create\s+policy)/im.test(sql));
check('all seeded keys exist in fallback catalog',seedKeys.every(k=>rowMap.has(k)));

const html=read('index.html');
const sectionStack=[],bySection={};
for(const line of html.split(/\r?\n/)){
  for(const m of line.matchAll(/<section[^>]+id=["']([^"']+)["']/g))sectionStack.push(m[1]);
  const section=sectionStack.at(-1)||'shell';let added=0;
  if(AR.test(line)){
    const covered=/data-(?:petatoe|execution)-i18n/.test(line);
    if(!covered){added+=[...line.matchAll(/(?:placeholder|title|aria-label)=["']([^"']*[\u0600-\u06FF][^"']*)["']/g)].length;added+=[...line.matchAll(/>([^<>]*[\u0600-\u06FF][^<>]*)</g)].length;}
  }
  if(added)bySection[section]=(bySection[section]||0)+added;
  const closes=(line.match(/<\/section>/g)||[]).length;for(let i=0;i<closes&&sectionStack.length;i++)sectionStack.pop();
}
for(const id of ['loginView','usersView','permissionsView','activityLogView','backupsView','systemSettingsView','aboutAppView'])check(`${id} static localization debt is zero`,(bySection[id]||0)===0,`${bySection[id]||0}`);
check('systemHealth only retains protected R44 pruning literals',(bySection.systemHealthView||0)===4,`${bySection.systemHealthView||0}`);
check('Notification Center remains outside L1 scope',(bySection.notificationCenterView||0)===27,`${bySection.notificationCenterView||0}`);

const dedicatedZero=['permissions-service.js','activity-service.js','backup-service.js','system-settings-service.js','diagnostics-service.js','diagnostics-engine.js','health-alerts-engine.js','sync-recovery-center.js','auth-session.js','permissions.js','pwa.js'];
for(const name of dedicatedZero){const source=read(`assets/js/${name}`);const candidates=source.split(/\r?\n/).filter(line=>AR.test(line)&&!/^[\s]*\/\//.test(line)&&/["'`]/.test(line));check(`${name} visible Arabic runtime debt is zero`,candidates.length===0,`${candidates.length}`);}
const usersArabic=read('assets/js/users-service.js').split(/\r?\n/).filter(line=>AR.test(line)&&/["'`]/.test(line));
check('users-service retains only raw DB status contract',usersArabic.length===1&&usersArabic[0].includes('.neq("status","غير نشطة")'));
const healthArabic=read('assets/js/system-health-service.js').split(/\r?\n/).filter(line=>AR.test(line)&&/["'`]/.test(line));
check('system-health-service retains only protected retention message',healthArabic.length===1&&healthArabic[0].includes('المزامنة والاحتفاظ'));

const frozen={
  'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
  'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
  'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
  'supabase/migrations/phase_p5_13_8_72_r43_production_retention_readiness_rollout_gate.sql':'85064501979f492cf954d0a5fe39bfe9d11364a63e8824aabfdc777fc19d2e74',
  'supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql':'60ac42da073c1693c31d13ce5b7dd5ae954ca7b0005261e6e36722ab22cd0af9'
};
for(const [file,expected] of Object.entries(frozen))check(`${file} byte-identical to R44R19 baseline`,sha(file)===expected);

const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const entry=manifest.historicalInventory.find(x=>x.path===migration);
check('R44R20 migration is in certified recent tail',manifest.policy.certifiedRecentTailOrder.at(-1)===migration);
check('R44R20 migration fingerprint is current',entry?.sha256===sha(migration)&&entry?.bytes===fs.statSync(path.join(ROOT,migration)).size);

console.log(`R44R20 L1 certification: ${failures?'FAIL':'PASS'}${failures?` (${failures} failures)`:''}`);
if(failures)process.exit(1);

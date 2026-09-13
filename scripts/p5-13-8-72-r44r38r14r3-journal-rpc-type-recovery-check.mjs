import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const html=read('index.html');
const loc=read('assets/js/localization-center.js');
const service=read('assets/js/sea-vibe-service.js');
const migration='supabase/migrations/phase_p5_13_8_72_r44r38r14r3_journal_chart_rpc_type_compatibility_recovery.sql';
const r14='supabase/migrations/phase_p5_13_8_72_r44r38r14_sea_vibe_manual_journals.sql';
const r14r1='supabase/migrations/phase_p5_13_8_72_r44r38r14r1_manual_journal_lock_recovery.sql';
const r14r2='supabase/migrations/phase_p5_13_8_72_r44r38r14r2_legacy_chart_policy_cleanup_recovery.sql';
const sql=read(migration);
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);
check('release version 18.56.108',version.version==='18.56.108'&&pkg.version==='18.56.108');
check('release build 185708',version.build===185708);
check('manifest release R44R38R14R3',manifest.release?.phase==='R44R38R14R3'&&manifest.release?.version==='18.56.108'&&manifest.release?.build===185708);
check('all index cache tokens use 18.56.108',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.108')})());
check('PWA current version updated',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.108"'));
check('service worker cache token updated',read('service-worker.js').includes('petatoe-pwa-18-56-108-journal-rpc-type-recovery-r44r38r14r3'));
check('historical R14 immutable',sha(r14)==='f9acd7a03ab512d499cb274ad01600141483fc1704a26343ad8f43406b527048');
check('historical R14R1 immutable',sha(r14r1)==='e3ddc1e1d8e55920516936686eb5ee59210c6a29d6141b44449a8eac5a69301b');
check('historical R14R2 immutable',sha(r14r2)==='656fa44c9f437f29fe3cfbff7f8a359ede54ee921362cd03c5dfe04405a056d5');
check('R14R3 migration inventoried',(()=>{const e=manifest.historicalInventory.find(x=>x.path===migration);return e&&e.sha256===sha(migration)&&e.bytes===fs.statSync(path.join(root,migration)).size})());
check('manifest stats match inventory',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('legacy three-file manifest drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);
check('RPC same canonical name',sql.includes('create or replace function public.sea_vibe_journal_chart_accounts_r44r14r1()'));
check('RPC contract remains root_class integer',/root_class\s+integer/i.test(sql));
check('source mismatch documented',sql.includes('root_class is SMALLINT')||sql.includes('root_class is smallint'));
check('root_class explicitly cast to integer',sql.includes('a.root_class::integer'));
check('all returned columns explicitly typed', ['a.id::uuid','a.account_code::text','a.name_ar::text','a.name_en::text','a.parent_id::uuid','a.allow_posting::boolean','a.is_system::boolean','a.is_active::boolean','a.sort_order::integer','a.created_at::timestamptz','a.updated_at::timestamptz'].every(x=>sql.includes(x)));
check('SECURITY DEFINER preserved',/sea_vibe_journal_chart_accounts_r44r14r1\(\)[\s\S]*?security definer[\s\S]*?set search_path=public/i.test(sql));
check('journal view permission check preserved',sql.includes("has_screen_permission('seaVibeJournals','view')"));
check('public and anon execute revoked',sql.includes('revoke all on function public.sea_vibe_journal_chart_accounts_r44r14r1() from public,anon'));
check('authenticated execute preserved',sql.includes('grant execute on function public.sea_vibe_journal_chart_accounts_r44r14r1() to authenticated'));
check('service still uses scoped RPC',service.includes("client().rpc('sea_vibe_journal_chart_accounts_r44r14r1')"));
check('service remains byte-identical to R14R2',sha('assets/js/sea-vibe-service.js')==='42024eafca8beb72884b571b8d4e2cbb02953b8c97ad6178f05d4a697f3dca24');
check('no policy DDL in recovery',!(/\b(create|drop|alter)\s+policy\b/i.test(sql)));
check('no chart RLS alteration',!(/alter\s+table\s+public\.sea_vibe_chart_accounts/i.test(sql)));
check('no table/view/schema destructive DDL',!(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|view|column|schema)\b/i.test(sql)));
check('no R44 pruning activation',!/pruning.*(enable|active)|delete.*retention|cron/i.test(sql));
check('final status present',sql.includes('R44R38R14R3_JOURNAL_RPC_TYPE_RECOVERY_OK'));
check('verification exposes source type',sql.includes('source_root_class_type'));
check('verification exposes integer contract',sql.includes('rpc_integer_contract'));
check('verification exposes explicit cast',sql.includes('explicit_root_class_cast'));
check('verification exposes unsafe policy count',sql.includes('unsafe_chart_policy'));
check('static localization includes release keys',loc.includes('pwa.update.release.r44r38r14r3.title')&&loc.includes('pwa.update.release.r44r38r14r3.note3'));
check('migration includes release keys',sql.includes('pwa.update.release.r44r38r14r3.title')&&sql.includes('pwa.update.release.r44r38r14r3.note3'));
check('custom translations preserved',sql.includes('ar_text=case when public.app_translations.ar_text is null')&&sql.includes('en_text=case when public.app_translations.en_text is null'));
const protectedHashes={
 'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
 'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
 'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
 'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
 'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a',
 'assets/js/sea-vibe.js':'373c2be2ad96ff5a1a3f45ffd5712d6c493fcf9f0849ffca4bc444b103477226',
 'assets/css/sea-vibe.css':'70534b54a2d44fe297628215ac68624e5e73ff84c5cbaecb154e0e58d0996388'
};
for(const [rel,expected] of Object.entries(protectedHashes)) check(`protected byte-identical: ${rel}`,sha(rel)===expected);
let passed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R14R3 certification: ${passed}/${checks.length} PASS`); if(passed!==checks.length)process.exit(1);

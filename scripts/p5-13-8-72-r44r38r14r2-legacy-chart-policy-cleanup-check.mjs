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
const recovery='supabase/migrations/phase_p5_13_8_72_r44r38r14r2_legacy_chart_policy_cleanup_recovery.sql';
const r14='supabase/migrations/phase_p5_13_8_72_r44r38r14_sea_vibe_manual_journals.sql';
const r14r1='supabase/migrations/phase_p5_13_8_72_r44r38r14r1_manual_journal_lock_recovery.sql';
const sql=read(recovery);
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);

check('release version 18.56.107',version.version==='18.56.107'&&pkg.version==='18.56.107');
check('release build 185707',version.build===185707);
check('manifest release R44R38R14R2',manifest.release?.phase==='R44R38R14R2'&&manifest.release?.version==='18.56.107'&&manifest.release?.build===185707);
check('all index cache tokens use 18.56.107',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.107')})());
check('PWA current version updated',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.107"'));
check('service worker cache token updated',read('service-worker.js').includes('petatoe-pwa-18-56-107-journal-policy-cleanup-r44r38r14r2'));

check('historical R14 migration immutable',sha(r14)==='f9acd7a03ab512d499cb274ad01600141483fc1704a26343ad8f43406b527048');
check('historical R14R1 migration immutable',sha(r14r1)==='e3ddc1e1d8e55920516936686eb5ee59210c6a29d6141b44449a8eac5a69301b');
check('R14R2 migration inventoried',(()=>{const e=manifest.historicalInventory.find(x=>x.path===recovery);return e&&e.sha256===sha(recovery)&&e.bytes===fs.statSync(path.join(root,recovery)).size})());
check('manifest stats match inventory',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('legacy three-file manifest drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);

check('policy definition guard exists',sql.includes('R44R38R14R2_LEGACY_CHART_POLICY_DEFINITION_UNEXPECTED'));
check('guard checks SELECT command',sql.includes("upper(coalesce(v_cmd,'')) <> 'SELECT'"));
check('guard checks authenticated role',sql.includes("position('authenticated' in lower(coalesce(v_roles,'')))"));
check('guard checks journal permission function',sql.includes("position('has_screen_permission' in lower(coalesce(v_qual,'')))"));
check('cleanup drops only legacy journal chart policy',sql.includes('drop policy if exists "sea vibe chart accounts journal read" on public.sea_vibe_chart_accounts'));
check('cleanup policy drop occurs before other DDL',sql.indexOf('drop policy if exists "sea vibe chart accounts journal read"')<sql.indexOf('create extension if not exists pgcrypto'));
check('cleanup uses isolated 3s lock timeout',/begin;\s*set local lock_timeout = '3s';\s*drop policy if exists "sea vibe chart accounts journal read"[\s\S]*?commit;/i.test(sql));
check('recovery never recreates legacy chart policy',!sql.includes('create policy "sea vibe chart accounts journal read"'));
check('recovery does not widen chart RLS',!sql.includes('alter table public.sea_vibe_chart_accounts enable row level security'));

check('journal account RPC preserved',sql.includes('create or replace function public.sea_vibe_journal_chart_accounts_r44r14r1()'));
check('journal account RPC is SECURITY DEFINER',/sea_vibe_journal_chart_accounts_r44r14r1\(\)[\s\S]*?security definer[\s\S]*?set search_path=public/i.test(sql));
check('journal account RPC permission check preserved',sql.includes("has_screen_permission('seaVibeJournals','view')"));
check('journal service uses permission-scoped RPC',service.includes("client().rpc('sea_vibe_journal_chart_accounts_r44r14r1')"));
check('journal service does not directly read chart view in context loader',(()=>{const a=service.indexOf('async function loadManualJournalContext()');const b=service.indexOf('async function',a+30);const x=service.slice(a,b);return a>=0&&!x.includes("from('sea_vibe_chart_accounts_view')")})());

check('R14 VAT account preserved',sql.includes("select '2101','ضريبة القيمة المضافة','VAT Payable',p.id,2,true,false,true,2101")&&sql.includes("where p.account_code='21'"));
check('journal tables preserved',['sea_vibe_journal_entries','sea_vibe_journal_entry_lines','sea_vibe_journal_entry_attachments'].every(x=>sql.includes(`create table if not exists public.${x}`)));
check('journal save RPC preserved',sql.includes('create or replace function public.sea_vibe_save_manual_journal_r44r14('));
check('posting validation preserved',sql.includes('SEA_VIBE_JOURNAL_TWO_LINES_REQUIRED')&&sql.includes('SEA_VIBE_JOURNAL_UNBALANCED')&&sql.includes('SEA_VIBE_JOURNAL_POSTING_ACCOUNT_REQUIRED'));
check('journal RLS policies preserved',sql.includes('sea vibe journals read')&&sql.includes('sea vibe journal lines read')&&sql.includes('sea vibe journal attachments read')&&sql.includes('sea vibe journal attachments insert'));
check('private journal storage bucket preserved',sql.includes("values('sea-vibe-journal-entries','sea-vibe-journal-entries',false,10485760"));
check('journal storage policies preserved',sql.includes('sea vibe journal storage read')&&sql.includes('sea vibe journal storage insert'));
check('recovery uses multiple short transactions',(sql.match(/\bbegin;/g)||[]).length>=6&&(sql.match(/\bcommit;/g)||[]).length>=6);
check('recovery uses 5s lock timeout after isolated cleanup',(sql.match(/set local lock_timeout = '5s';/g)||[]).length>=5);
check('no destructive business data/table/view DDL',!(/\bdelete\s+from\b|\btruncate\s+(table\s+)?|\bdrop\s+(table|view|column|schema)\b/i.test(sql)));
check('no R44 pruning activation',!/pruning.*(enable|active)|delete.*retention|cron/i.test(sql));

check('R14R2 PWA localization keys in static catalog',loc.includes('pwa.update.release.r44r38r14r2.title')&&loc.includes('pwa.update.release.r44r38r14r2.note3'));
check('R14R2 PWA localization keys in migration',sql.includes('pwa.update.release.r44r38r14r2.title')&&sql.includes('pwa.update.release.r44r38r14r2.note3'));
check('custom translations preserved',sql.includes('ar_text=case when public.app_translations.ar_text is null')&&sql.includes('en_text=case when public.app_translations.en_text is null'));
check('final cleanup status present',sql.includes('R44R38R14R2_LEGACY_POLICY_CLEANUP_OK'));
check('final gate requires zero unsafe policy',sql.includes('v_unsafe_chart_policy<>0'));
check('final read-only result exposes recovery counts',sql.includes('journal_account_rpc')&&sql.includes('unsafe_chart_policy')&&sql.includes('journal_policies')&&sql.includes('storage_policies')&&sql.includes('storage_bucket'));

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

let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R14R2 certification: ${passed}/${checks.length} PASS`);
if(passed!==checks.length)process.exit(1);

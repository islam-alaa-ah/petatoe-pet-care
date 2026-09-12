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
const service=read('assets/js/sea-vibe-service.js');
const loc=read('assets/js/localization-center.js');
const recovery='supabase/migrations/phase_p5_13_8_72_r44r38r14r1_manual_journal_lock_recovery.sql';
const historical='supabase/migrations/phase_p5_13_8_72_r44r38r14_sea_vibe_manual_journals.sql';
const sql=read(recovery);
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);

check('release version 18.56.106',version.version==='18.56.106'&&pkg.version==='18.56.106');
check('release build 185706',version.build===185706);
check('manifest phase R44R38R14R1',manifest.release?.phase==='R44R38R14R1'&&manifest.release?.version==='18.56.106'&&manifest.release?.build===185706);
check('all index cache tokens use 18.56.106',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.106')})());
check('PWA current version updated',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.106"'));
check('service worker cache token updated',read('service-worker.js').includes('petatoe-pwa-18-56-106-journal-lock-recovery-r44r38r14r1'));

check('historical R14 migration still exists',fs.existsSync(path.join(root,historical)));
check('historical R14 migration is immutable',sha(historical)==='f9acd7a03ab512d499cb274ad01600141483fc1704a26343ad8f43406b527048');
check('recovery migration inventoried',(()=>{const e=manifest.historicalInventory.find(x=>x.path===recovery);return e&&e.sha256===sha(recovery)&&e.bytes===fs.statSync(path.join(root,recovery)).size})());
check('manifest stats match inventory',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('legacy three-file manifest drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);

check('recovery preflight refuses legacy chart journal policy',sql.includes('R44R38R14R1_LEGACY_CHART_POLICY_PRESENT_REQUIRES_REVIEW'));
check('recovery does not create chart-table journal policy',!sql.includes('create policy "sea vibe chart accounts journal read"'));
check('recovery does not alter RLS on chart accounts',!sql.includes('alter table public.sea_vibe_chart_accounts enable row level security'));
check('journal account RPC exists',sql.includes('create or replace function public.sea_vibe_journal_chart_accounts_r44r14r1()'));
check('journal account RPC is SECURITY DEFINER',/sea_vibe_journal_chart_accounts_r44r14r1\(\)[\s\S]*?security definer[\s\S]*?set search_path=public/i.test(sql));
check('journal account RPC checks journal view permission',sql.includes("has_screen_permission('seaVibeJournals','view')"));
check('journal account RPC returns only active accounts',sql.includes('where a.is_active=true'));
check('journal account RPC execute grant is authenticated only',sql.includes('revoke all on function public.sea_vibe_journal_chart_accounts_r44r14r1() from public,anon')&&sql.includes('grant execute on function public.sea_vibe_journal_chart_accounts_r44r14r1() to authenticated'));
check('service journal context uses recovery RPC',service.includes("client().rpc('sea_vibe_journal_chart_accounts_r44r14r1')"));
check('service journal context no longer reads shared chart view directly',(()=>{const a=service.indexOf('async function loadManualJournalContext()');const b=service.indexOf('async function',a+30);const x=service.slice(a,b);return a>=0&&!x.includes("from('sea_vibe_chart_accounts_view')")})());

check('recovery is split into short transactions',(sql.match(/\bbegin;/g)||[]).length>=5&&(sql.match(/\bcommit;/g)||[]).length>=5);
check('recovery uses local lock timeout',(sql.match(/set local lock_timeout = '5s';/g)||[]).length>=5);
check('R14 VAT account is preserved',sql.includes("select '2101','ضريبة القيمة المضافة','VAT Payable',p.id,2,true,false,true,2101")&&sql.includes("where p.account_code='21'"));
check('R14 journal tables are preserved',['sea_vibe_journal_entries','sea_vibe_journal_entry_lines','sea_vibe_journal_entry_attachments'].every(x=>sql.includes(`create table if not exists public.${x}`)));
check('R14 save RPC preserved',sql.includes('create or replace function public.sea_vibe_save_manual_journal_r44r14('));
check('posted journal accounting validation preserved',sql.includes('SEA_VIBE_JOURNAL_TWO_LINES_REQUIRED')&&sql.includes('SEA_VIBE_JOURNAL_UNBALANCED')&&sql.includes('SEA_VIBE_JOURNAL_POSTING_ACCOUNT_REQUIRED'));
check('journal-owned RLS policies preserved',sql.includes('sea vibe journals read')&&sql.includes('sea vibe journal lines read')&&sql.includes('sea vibe journal attachments read')&&sql.includes('sea vibe journal attachments insert'));
check('private storage bucket preserved',sql.includes("values('sea-vibe-journal-entries','sea-vibe-journal-entries',false,10485760"));
check('storage policies preserved',sql.includes('sea vibe journal storage read')&&sql.includes('sea vibe journal storage insert'));
check('no destructive data/table/view DDL',!(/\bdelete\s+from\b|\btruncate\s+(table\s+)?|\bdrop\s+(table|view|column|schema)\b/i.test(sql)));
check('no R44 pruning activation',!/pruning.*(enable|active)|delete.*retention|cron/i.test(sql));
check('translations preserve custom values',sql.includes('ar_text=case when public.app_translations.ar_text is null')&&sql.includes('en_text=case when public.app_translations.en_text is null'));
check('R14 recovery PWA localization keys exist',loc.includes('pwa.update.release.r44r38r14r1.title')&&loc.includes('pwa.update.release.r44r38r14r1.note3'));
check('final recovery status present',sql.includes('R44R38R14R1_JOURNAL_LOCK_RECOVERY_OK'));
check('final gate requires zero unsafe chart policy',sql.includes('v_unsafe_chart_policy<>0'));
check('final read-only result exposes RPC and policy counts',sql.includes('journal_account_rpc')&&sql.includes('unsafe_chart_policy')&&sql.includes('journal_policies')&&sql.includes('storage_policies')&&sql.includes('storage_bucket'));

check('offline queue unchanged from R14',sha('assets/js/offline-queue.js')===crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/js/offline-queue.js'))).digest('hex'));
check('smart cache file present',fs.existsSync(path.join(root,'assets/js/smart-cache.js')));
check('sync engine file present',fs.existsSync(path.join(root,'assets/js/sync-engine.js')));
check('permissions runtime file present',fs.existsSync(path.join(root,'assets/js/permissions.js')));

let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R14R1 certification: ${passed}/${checks.length} PASS`);
if(passed!==checks.length)process.exit(1);

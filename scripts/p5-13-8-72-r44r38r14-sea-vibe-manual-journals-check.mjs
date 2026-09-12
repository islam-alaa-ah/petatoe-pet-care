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
const app=read('assets/js/app.js');
const ui=read('assets/js/sea-vibe.js');
const service=read('assets/js/sea-vibe-service.js');
const css=read('assets/css/sea-vibe.css');
const loc=read('assets/js/localization-center.js');
const tc=read('assets/js/translation-center.js');
const sqlRel='supabase/migrations/phase_p5_13_8_72_r44r38r14_sea_vibe_manual_journals.sql';
const sql=read(sqlRel);
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);

check('release version is 18.56.105',version.version==='18.56.105'&&pkg.version==='18.56.105');
check('release build is 185705',version.build===185705);
check('release phase is R44R38R14',manifest?.release?.phase==='R44R38R14'&&manifest?.release?.build===185705&&manifest?.release?.version==='18.56.105');
check('all versioned index assets use 18.56.105',(()=>{const x=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(m=>m[1]);return x.length>0&&x.every(v=>v==='18.56.105')})());

check('SEA VIBE sidebar exposes Journal Entries',html.includes('data-view="seaVibeJournals"')&&html.includes('data-petatoe-i18n="sidebar.seaVibeJournals"'));
check('Journal view exists exactly once',html.match(/id="seaVibeJournalsView"/g)?.length===1);
check('Journal command bar has post draft and cancel',['seaVibeJournalPostBtn','seaVibeJournalDraftBtn','seaVibeJournalCancelBtn'].every(id=>html.includes(`id="${id}"`)));
check('Journal header has date currency number description and attachments',['seaVibeJournalDate','seaVibeJournalCurrency','seaVibeJournalNo','seaVibeJournalDescription','seaVibeJournalAttachments'].every(id=>html.includes(`id="${id}"`)));
check('Journal table contains canonical accounting columns',['seaVibe.journal.account','seaVibe.journal.lineDescription','seaVibe.journal.tax','seaVibe.journal.debit','seaVibe.journal.credit'].every(k=>html.includes(`data-petatoe-i18n="${k}"`)));
check('Journal view intentionally excludes tags and cost center',(()=>{const a=html.indexOf('id="seaVibeJournalsView"');const b=html.indexOf('</section>',a);const x=html.slice(a,b);return !/وسوم|Tags|مركز التكلفة|Cost Center/i.test(x)})());
check('Journal totals expose debit credit and difference',['seaVibeJournalTotalDebit','seaVibeJournalTotalCredit','seaVibeJournalDifference'].every(id=>html.includes(`id="${id}"`)));
check('app canonical view map includes Journal Entries',app.includes('seaVibeJournals: document.getElementById("seaVibeJournalsView")')&&app.includes('seaVibeJournals: ["seaVibe.page.journals.title", "seaVibe.page.journals.subtitle"]'));

check('UI uses active posting accounts only',ui.includes('function journalPostingAccounts()')&&ui.includes('allowPosting'));
check('UI initializes two accounting lines',ui.includes("journalLineTemplate()+journalLineTemplate()"));
check('UI mutually excludes debit and credit inputs',ui.includes("target?.matches?.('[data-sv-journal-debit]')")&&ui.includes("querySelector('[data-sv-journal-credit]')")&&ui.includes("peer.value=''"));
check('UI prevents posting an unbalanced journal',ui.includes("Math.abs(totals.difference)>0.004")&&ui.includes("SEA_VIBE_JOURNAL_UNBALANCED"));
check('UI supports draft and posted saves',ui.includes("saveJournalUI('draft')")&&ui.includes("saveJournalUI('posted')"));
check('UI language/data refresh owns Journal screen',ui.includes("active==='seaVibeJournalsView')renderJournal()"));

check('service loads isolated Journal context',service.includes('async function loadManualJournalContext()')&&service.includes("permission('seaVibeJournals','view')")&&service.includes("from('sea_vibe_chart_accounts_view')"));
check('Journal context does not require full SEA VIBE snapshot',(()=>{const a=service.indexOf('async function loadManualJournalContext()');const b=service.indexOf('async function',a+20);const x=service.slice(a,b);return !x.includes('loadSnapshot')&&!x.includes('loadAll')})());
check('Journal save is explicitly online-only',service.includes("if(navigator.onLine===false)throw new Error('SEA_VIBE_JOURNAL_ONLINE_REQUIRED')"));
check('Journal save uses canonical R14 RPC',service.includes("client().rpc('sea_vibe_save_manual_journal_r44r14'"));
check('Journal attachment bucket and 10MB cap are canonical',service.includes("storage.from('sea-vibe-journal-entries')")&&service.includes('10*1024*1024'));

check('SQL adds VAT Payable 2101 under Current Liabilities 21',sql.includes("select '2101','ضريبة القيمة المضافة','VAT Payable',p.id,2,true,false,true,2101")&&sql.includes("where p.account_code='21'"));
check('SQL creates journal header lines and attachment tables',['sea_vibe_journal_entries','sea_vibe_journal_entry_lines','sea_vibe_journal_entry_attachments'].every(name=>sql.includes(`create table if not exists public.${name}`)));
check('SQL generates JE year serials',sql.includes("return 'JE-'||v_year||'-'||lpad(v_seq::text,6,'0')"));
check('SQL RPC authorizes create and edit separately',sql.includes("has_screen_permission('seaVibeJournals','add')")&&sql.includes("has_screen_permission('seaVibeJournals','edit')"));
check('SQL locks posted journal edits',sql.includes("if v_existing.status='posted' then raise exception 'SEA_VIBE_JOURNAL_POSTED_LOCKED'"));
check('SQL validates active posting accounts',sql.includes('not v_account.is_active or not v_account.allow_posting'));
check('SQL requires two lines and balanced posted totals',sql.includes("if v_valid_lines<2 then raise exception 'SEA_VIBE_JOURNAL_TWO_LINES_REQUIRED'")&&sql.includes("v_total_debit<>v_total_credit")&&sql.includes("SEA_VIBE_JOURNAL_UNBALANCED"));
check('SQL draft revision retires lines without destructive delete',sql.includes('update public.sea_vibe_journal_entry_lines set is_active=false')&&!/\bdelete\s+from\b/i.test(sql));
check('SQL creates Journal permission without delete authority',sql.includes("values('seaVibeJournals','SEA VIBE - قيود اليومية','SEA VIBE',157,true)")&&sql.includes("'seaVibeJournals',true,true,true,false,true"));
check('SQL does not widen shared SEA VIBE read gate',!sql.includes('create or replace function public.sea_vibe_can_view()')&&sql.includes('sea vibe chart accounts journal read'));
check('SQL Journal RLS is screen-scoped',sql.includes("has_screen_permission(''seaVibeJournals'',''view'')")&&sql.includes('alter table public.sea_vibe_journal_entries enable row level security'));
check('SQL private attachment bucket is 10MB',sql.includes("values('sea-vibe-journal-entries','sea-vibe-journal-entries',false,10485760")&&sql.includes("'application/pdf'"));
check('SQL has no destructive DROP/DELETE FROM/TRUNCATE',!/\bdrop\s+(policy|table|column|view|function|trigger|schema|index|sequence)\b|\bdelete\s+from\b|\btruncate\s+(table\s+)?/i.test(sql));
check('SQL has no R44 pruning or retention activation',!/pruning.*(enable|active)|delete.*retention|cron/i.test(sql));
check('translation migration preserves customized values',sql.includes("ar_text=case when public.app_translations.ar_text is null")&&sql.includes("en_text=case when public.app_translations.en_text is null"));
check('SQL final verification row is present',sql.includes('R44R38R14_MANUAL_JOURNALS_OK')&&sql.includes('vat_accounts')&&sql.includes('journal_tables')&&sql.includes('journal_screens'));

check('localization catalog covers Journal UI',['sidebar.seaVibeJournals','seaVibe.page.journals.title','seaVibe.journal.save','seaVibe.journal.saveDraft','seaVibe.journal.account','seaVibe.journal.tax','seaVibe.journal.totalDebit','seaVibe.accounts.vatPayable'].every(k=>loc.includes(k)));
check('translation center maps Journal screen label',tc.includes("seaVibeJournals:'sidebar.seaVibeJournals'"));
check('R14 PWA localization keys exist',loc.includes('pwa.update.release.r44r38r14.title')&&loc.includes('pwa.update.release.r44r38r14.note3'));
check('SEA VIBE CSS has canonical Journal workspace styles',css.includes('sea-vibe-journal-commandbar')&&css.includes('sea-vibe-journal-table')&&css.includes('sea-vibe-journal-totals'));
check('SEA VIBE CSS adds no important override',!css.includes('!important'));

check('new migration is inventoried with matching fingerprint',(()=>{const e=manifest.historicalInventory.find(x=>x.path===sqlRel);return e&&e.sha256===sha(sqlRel)&&e.bytes===fs.statSync(path.join(root,sqlRel)).size})());
check('manifest inventory stats match inventoried entries',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('new migration preserves pre-existing three-file manifest drift',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-(manifest?.inventoryStats?.sqlFileCount||0)===3);
check('R13 migration remains byte-identical','b1d4318c80b426e5e6bc9ab99c6c961d72172bea1f0bf14d5b78e2c0a582f59b'===sha('supabase/migrations/phase_p5_13_8_72_r44r38r13_sea_vibe_treasury_vouchers.sql'));
check('R13R1 recovery remains byte-identical','269099742fb916f2d2b72906608968bdec98084afd13ae188ea43f4ae0075781'===sha('supabase/migrations/phase_p5_13_8_72_r44r38r13r1_treasury_view_numeric_compatibility_recovery.sql'));
check('offline queue remains byte-identical','5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7'===sha('assets/js/offline-queue.js'));
check('smart cache remains byte-identical','b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d'===sha('assets/js/smart-cache.js'));
check('sync engine remains byte-identical','7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e'===sha('assets/js/sync-engine.js'));
check('permissions runtime remains byte-identical','bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456'===sha('assets/js/permissions.js'));
check('permissions service remains byte-identical','e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a'===sha('assets/js/permissions-service.js'));

let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R14 certification: ${passed}/${checks.length} PASS`);
if(passed!==checks.length)process.exit(1);

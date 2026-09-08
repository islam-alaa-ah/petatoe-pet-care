import fs from 'node:fs';
import crypto from 'node:crypto';

const migrationPath='supabase/migrations/phase_p5_13_8_72_r44r25_august_history_recovery_effective_date_required.sql';
const migration=fs.readFileSync(migrationPath,'utf8');
const settings=fs.readFileSync('assets/js/installation-settings-management.js','utf8');
const localization=fs.readFileSync('assets/js/localization-center.js','utf8');
const manifest=JSON.parse(fs.readFileSync('supabase/migration-manifest.json','utf8'));
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const sha=crypto.createHash('sha256').update(fs.readFileSync(migrationPath)).digest('hex');
const bytes=fs.statSync(migrationPath).size;

const checks=[];
const check=(name,ok)=>{checks.push([name,Boolean(ok)]);console.log(`${ok?'PASS':'FAIL'} - ${name}`)};

check('August correction is explicitly full month',migration.includes("date '2026-08-01'") && migration.includes("date '2026-08-31'"));
check('invoice 101343 is the VAN A evidence anchor',migration.includes("btrim(si.invoice_number)='101343'") && migration.includes('v_team_van_a:=v_team_101343'));
check('invoices 101342 and 101344 are the VAN B evidence anchors',migration.includes("btrim(si.invoice_number)='101342'") && migration.includes("btrim(si.invoice_number)='101344'") && migration.includes('v_team_van_b:=v_team_101342'));
check('VAN B evidence requires 101342 and 101344 same raw team ID',migration.includes('if v_team_101342<>v_team_101344 then'));
check('historical VAN A assignment is Chris + Brian',migration.includes('v_team_van_a,v_chris_id,v_brian_id,v_van_a_id'));
check('historical VAN B assignment is Roland + Dinmark',migration.includes('v_team_van_b,v_roland_id,v_dinmark_id,v_van_b_id'));
check('September/current rows are not deleted',!migration.includes("effective_from>=date '2026-09-01'") && !migration.includes("effective_from=v_sep"));
check('invoices are not rewritten',!/(update|delete\s+from)\s+public\.sales_invoices/i.test(migration));
check('requests are not rewritten',!/(update|delete\s+from)\s+public\.installation_requests/i.test(migration));
check('visits are not rewritten',!/(update|delete\s+from)\s+public\.installation_execution_visits/i.test(migration));
check('paid salary rows are not rewritten',!/(update|delete\s+from)\s+public\.payroll_salary_statements/i.test(migration));
check('commission statements are not rewritten',!/(update|delete\s+from)\s+public\.payroll_commission_statements/i.test(migration));
check('commission range SQL ambiguity fix is consolidated',migration.includes('create or replace function public.payroll_live_commission_rows_range') && migration.includes('ia.installation_team_id') && migration.includes('c.installation_team_id'));
check('canonical save RPC has no current_date fallback',migration.includes('v_effective date:=p_effective_from;') && !migration.includes('v_effective date:=coalesce(p_effective_from,current_date)'));
check('canonical save RPC rejects missing effective date',migration.includes("if v_effective is null then") && migration.includes("raise exception 'تاريخ سريان الربط مطلوب'"));
check('team edit UI effective date starts empty',/name="effectiveFrom"[^>]*value=""[^>]*required/.test(settings));
check('team edit UI no longer auto-fills today',!settings.includes('name="effectiveFrom" type="date" min="${TEAM_ASSIGNMENT_CUTOVER}" max="${today}" value="${today}"'));
check('Super Admin existing-team override is consolidated',migration.includes("v_super_admin_existing_team_override := (tg_op='UPDATE') and v_is_super_admin"));
check('new-team collision protection remains',migration.includes("if coalesce(new.status,'')<>'غير نشطة' and not v_super_admin_existing_team_override"));
check('same-team history overlap remains protected',migration.includes("raise exception 'فترة ربط الفريق تتداخل مع فترة موجودة بالفعل'"));
for(const key of ['pwa.update.release.r44r25.title','pwa.update.release.r44r25.note1','pwa.update.release.r44r25.note2','pwa.update.release.r44r25.note3']){
  check(`localized release key ${key}`,localization.includes(key) && migration.includes(key));
}
check('release version is R44R25 build',version.version==='18.56.68' && Number(version.build)===185668 && String(version.cacheToken||'').includes('r44r25'));
const entry=(manifest.historicalInventory||[]).find(x=>x.path===migrationPath);
check('migration is registered in manifest',Boolean(entry));
check('migration manifest hash and bytes are exact',entry?.sha256===sha && Number(entry?.bytes)===bytes);
const tail=manifest?.policy?.certifiedRecentTailOrder||[];
const p24=tail.indexOf('supabase/migrations/phase_p5_13_8_72_r44r24_super_admin_team_assignment_override.sql');
const p25=tail.indexOf(migrationPath);
check('R44R25 follows R44R24 in certified tail order',p24>=0 && p25===p24+1);

const failed=checks.filter(([,ok])=>!ok).length;
console.log(`R44R25 August recovery certification: ${failed?'FAIL':'PASS'} (${checks.length-failed}/${checks.length})`);
process.exit(failed?1:0);

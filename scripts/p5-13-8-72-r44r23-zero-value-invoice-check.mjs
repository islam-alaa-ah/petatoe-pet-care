import fs from 'node:fs';
import crypto from 'node:crypto';

const migrationPath='supabase/migrations/phase_p5_13_8_72_r44r23_zero_value_executed_service_invoice.sql';
const migration=fs.readFileSync(migrationPath,'utf8');
const service=fs.readFileSync('assets/js/installations-service.js','utf8');
const localization=fs.readFileSync('assets/js/localization-center.js','utf8');
const schemaMigration=fs.readFileSync('supabase/migrations/phase_m15_0_sales_invoices_registry.sql','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('supabase/migration-manifest.json','utf8'));
const sha=crypto.createHash('sha256').update(fs.readFileSync(migrationPath)).digest('hex');
const bytes=fs.statSync(migrationPath).size;

const checks=[];
const check=(name,ok)=>{checks.push([name,Boolean(ok)]); console.log(`${ok?'PASS':'FAIL'} - ${name}`)};

check('canonical invoice financial function is replaced', migration.includes('create or replace function public.get_installation_execution_group_invoice_financials'));
check('invoice eligibility explicitly tracks executed quantity', migration.includes('has_executed_quantity boolean:=false') && migration.includes('greatest(coalesce(vs.executed_quantity,0),0)>0'));
check('groups with no executed quantity remain rejected', migration.includes('if not has_executed_quantity then') && migration.includes("raise exception 'لا توجد كمية منفذة في مجموعة التنفيذ'"));
check('old positive-amount eligibility error is removed from new canonical definition', !migration.includes("raise exception 'لا توجد كمية منفذة بقيمة قابلة للفوترة في مجموعة التنفيذ'"));
check('zero final amount remains a valid numeric output', migration.includes('invoice_amount:=round(group_final/tax_factor,2)') && migration.includes('final_amount_including_tax:=round(group_final,2)'));
check('no artificial minimum invoice value is introduced', !/greatest\s*\(\s*group_final\s*,\s*0\.0?1\s*\)/i.test(migration) && !/group_final\s*:=\s*0\.0?1/i.test(migration));
check('sales invoice schema permits zero amount', /invoice_amount\s+numeric\(14,2\)[^\n]*check\s*\(invoice_amount\s*>=\s*0\)/i.test(schemaMigration));
check('completion UI still reads canonical invoice financials RPC', service.includes("db().rpc('get_installation_execution_group_invoice_financials'"));
check('migration does not rewrite invoice rows', !/\b(update|delete)\s+public\.sales_invoices\b/i.test(migration));
check('migration does not change commission or vehicle treasury tables', !/public\.(payroll_commission|vehicle_treasury)/i.test(migration));
for(const key of ['pwa.update.release.r44r23.title','pwa.update.release.r44r23.note1','pwa.update.release.r44r23.note2','pwa.update.release.r44r23.note3']){
  check(`localized release key ${key}`, localization.includes(key) && migration.includes(key));
}
check('release version is R44R23 build', version.version==='18.56.66' && Number(version.build)===185666 && String(version.cacheToken||'').includes('r44r23'));
const entry=(manifest.historicalInventory||[]).find(x=>x.path===migrationPath);
check('migration is registered in manifest', Boolean(entry));
check('migration manifest hash and bytes are exact', entry?.sha256===sha && Number(entry?.bytes)===bytes);
const tail=manifest?.policy?.certifiedRecentTailOrder||[];
const p22=tail.indexOf('supabase/migrations/phase_p5_13_8_72_r44r22_team_assignment_cutover.sql');
const p23=tail.indexOf(migrationPath);
check('R44R23 follows R44R22 in certified tail order', p22>=0 && p23===p22+1);

const failed=checks.filter(([,ok])=>!ok).length;
console.log(`R44R23 zero-value invoice certification: ${failed?'FAIL':'PASS'} (${checks.length-failed}/${checks.length})`);
process.exit(failed?1:0);

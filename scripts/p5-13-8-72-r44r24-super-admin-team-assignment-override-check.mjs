import fs from 'node:fs';
import crypto from 'node:crypto';

const migrationPath='supabase/migrations/phase_p5_13_8_72_r44r24_super_admin_team_assignment_override.sql';
const migration=fs.readFileSync(migrationPath,'utf8');
const r44r22=fs.readFileSync('supabase/migrations/phase_p5_13_8_72_r44r22_team_assignment_cutover.sql','utf8');
const settings=fs.readFileSync('assets/js/installation-settings-management.js','utf8');
const localization=fs.readFileSync('assets/js/localization-center.js','utf8');
const manifest=JSON.parse(fs.readFileSync('supabase/migration-manifest.json','utf8'));
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const sha=crypto.createHash('sha256').update(fs.readFileSync(migrationPath)).digest('hex');
const bytes=fs.statSync(migrationPath).size;

const checks=[];
const check=(name,ok)=>{checks.push([name,Boolean(ok)]);console.log(`${ok?'PASS':'FAIL'} - ${name}`)};

check('canonical history overlap guard is replaced',migration.includes('create or replace function public.guard_installation_team_assignment_history_overlap()'));
check('override is explicitly restricted to super admin',migration.includes("public.current_user_role()='super_admin'::public.app_role"));
check('override is restricted to existing-team edit sources',migration.includes("in ('assignment_change','assignment_correction_same_start')"));
check('new-team create source is not whitelisted',!migration.includes("in ('assignment_change','assignment_correction_same_start','create')") && !migration.includes("in ('create','assignment_change'"));
check('same-team historical overlap remains enforced before resource checks',migration.indexOf("raise exception 'فترة ربط الفريق تتداخل مع فترة موجودة بالفعل'")>=0 && migration.indexOf("raise exception 'فترة ربط الفريق تتداخل مع فترة موجودة بالفعل'")<migration.indexOf("raise exception 'الجرومر مرتبط بفريق آخر"));
check('groomer collision remains for standard users',migration.includes('not v_super_admin_edit_override and new.groomer_employee_id is not null'));
check('driver collision remains for standard users',migration.includes('not v_super_admin_edit_override and new.driver_employee_id is not null'));
check('vehicle collision remains for standard users',migration.includes('not v_super_admin_edit_override and new.appointment_car_id is not null'));
check('canonical save RPC remains unchanged and still owns assignment sources',r44r22.includes("'assignment_change',auth.uid()") && r44r22.includes("source='assignment_correction_same_start'"));
check('UI still writes through canonical save RPC',settings.includes("db().rpc('save_installation_team_assignment_v1'"));
check('migration does not widen RLS or grants',!/(create\s+policy|alter\s+policy|grant\s+(insert|update|delete)|grant\s+all)/i.test(migration));
check('migration does not touch commissions or treasury',!/public\.(payroll_commission|vehicle_treasury)/i.test(migration));
for(const key of ['pwa.update.release.r44r24.title','pwa.update.release.r44r24.note1','pwa.update.release.r44r24.note2','pwa.update.release.r44r24.note3']){
  check(`localized release key ${key}`,localization.includes(key) && migration.includes(key));
}
check('release version is R44R24 build',version.version==='18.56.67' && Number(version.build)===185667 && String(version.cacheToken||'').includes('r44r24'));
const entry=(manifest.historicalInventory||[]).find(x=>x.path===migrationPath);
check('migration is registered in manifest',Boolean(entry));
check('migration manifest hash and bytes are exact',entry?.sha256===sha && Number(entry?.bytes)===bytes);
const tail=manifest?.policy?.certifiedRecentTailOrder||[];
const p23=tail.indexOf('supabase/migrations/phase_p5_13_8_72_r44r23_zero_value_executed_service_invoice.sql');
const p24=tail.indexOf(migrationPath);
check('R44R24 follows R44R23 in certified tail order',p23>=0 && p24===p23+1);

const failed=checks.filter(([,ok])=>!ok).length;
console.log(`R44R24 super-admin team assignment override certification: ${failed?'FAIL':'PASS'} (${checks.length-failed}/${checks.length})`);
process.exit(failed?1:0);

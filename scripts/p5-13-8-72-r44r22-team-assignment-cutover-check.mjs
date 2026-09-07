import fs from 'node:fs';
import crypto from 'node:crypto';
import process from 'node:process';

const read=file=>fs.readFileSync(file,'utf8');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sqlPath='supabase/migrations/phase_p5_13_8_72_r44r22_team_assignment_cutover.sql';
const priorSqlPath='supabase/migrations/phase_p5_13_8_72_r44r21_team_assignment_history.sql';
const sql=read(sqlPath);
const settings=read('assets/js/installation-settings-management.js');
const loc=read('assets/js/localization-center.js');
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
let failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)failed++;};
const has=(source,...needles)=>needles.every(x=>source.includes(x));

check('R44R21 historical migration remains immutable',sha(priorSqlPath)==='3107b77e8ce58ce3ce363ee2d25a5a4c9d0d95fd41ac650149c6698e13b2eae5');
check('cutover date is canonical 2026-09-01',has(sql,'installation_team_assignment_cutover_date',"date '2026-09-01'"));
check('segment spanning cutover is split instead of overwritten',has(sql,'h.effective_from < v_cutover','h.effective_to is null or h.effective_to >= v_cutover','set effective_to = v_cutover - 1'));
check('cutover preflight rejects duplicate groomer/driver/car ownership',has(sql,'count(distinct h.installation_team_id)>1',"يوجد جرومر مرتبط بأكثر من فريق","يوجد سائق مرتبط بأكثر من فريق","توجد سيارة مرتبطة بأكثر من فريق"));
check('pre-cutover side is explicitly frozen',sql.includes("'legacy_frozen_pre_cutover'"));
check('post-cutover side begins exactly on cutover',has(sql,"v_cutover,v_original_to,'cutover_current'",'effective_from = v_cutover'));
check('split copies groomer driver car and display snapshots',has(sql,'r.groomer_employee_id,r.driver_employee_id,r.appointment_car_id','r.groomer_name_snapshot,r.driver_name_snapshot,r.car_name_snapshot,r.plate_number_snapshot,r.team_name_snapshot'));
check('resolver does not leak mutable current team into an existing historical team',has(sql,'not exists(\n        select 1 from public.installation_team_assignment_history x','w.business_date>=w.cutover_date'));
check('new effective-dated edits cannot precede cutover',has(sql,'if v_effective<v_cutover then',"raise exception 'تاريخ سريان الربط لا يمكن أن يكون قبل %'"));
check('same-start correction can update the 2026-09-01 current segment without touching legacy',has(sql,'elsif v_effective=v_open.effective_from then',"source='assignment_correction_same_start'",'where id=v_open.id'));
check('missing current history recovery starts at cutover not 1900',has(sql,"v_cutover,null,'recovered_current_cutover'"));
check('cutover migration contains no R44 pruning activation',!/(execution_enabled\s*=\s*true|bounded_pruning|r45|pruning_enabled)/i.test(sql));

check('settings effective date input is cutover bounded',has(settings,"const TEAM_ASSIGNMENT_CUTOVER='2026-09-01'",'min="${TEAM_ASSIGNMENT_CUTOVER}"'));
check('settings rejects a pre-cutover date before RPC',settings.includes("if(effectiveFrom<TEAM_ASSIGNMENT_CUTOVER)throw new Error(tr('appointmentSettings.team.cutoverMinimum'"));
check('settings tells user pre-cutover data is frozen',settings.includes("appointmentSettings.team.cutoverHint"));

const keys=[
  'appointmentSettings.team.cutoverMinimum','appointmentSettings.team.cutoverHint',
  'pwa.update.release.r44r22.title','pwa.update.release.r44r22.note1','pwa.update.release.r44r22.note2','pwa.update.release.r44r22.note3'
];
for(const key of keys)check(`localization catalog + migration seed ${key}`,loc.includes(`\"${key}\"`)&&sql.includes(`('${key}'`));

function splitSegment(segment,cutover='2026-09-01'){
  if(!(segment.from<cutover && (!segment.to || segment.to>=cutover)))return [segment];
  return [
    {...segment,to:'2026-08-31',source:['baseline_current','recovered_current'].includes(segment.source)?'legacy_frozen_pre_cutover':segment.source},
    {...segment,from:cutover,to:segment.to,source:'cutover_current'}
  ];
}
const sample=splitSegment({team:'A',groomer:'OldAsDisplayed',driver:'Driver',car:'VAN A',from:'1900-01-01',to:null,source:'baseline_current'});
check('simulation: pre-cutover data stays frozen through 2026-08-31',sample.length===2&&sample[0].from==='1900-01-01'&&sample[0].to==='2026-08-31'&&sample[0].groomer==='OldAsDisplayed');
check('simulation: current assignment starts 2026-09-01 unchanged',sample[1].from==='2026-09-01'&&sample[1].to===null&&sample[1].groomer==='OldAsDisplayed'&&sample[1].car==='VAN A');
const futureChange=[...sample.slice(0,1),{...sample[1],to:'2026-09-14'},{...sample[1],groomer:'New',car:'VAN B',from:'2026-09-15',to:null,source:'assignment_change'}];
const at=date=>futureChange.find(r=>r.from<=date&&(!r.to||r.to>=date));
check('simulation: later transfer cannot rewrite pre-cutover data',at('2026-08-20')?.groomer==='OldAsDisplayed'&&at('2026-08-20')?.car==='VAN A');
check('simulation: later transfer applies only from selected date',at('2026-09-14')?.car==='VAN A'&&at('2026-09-15')?.car==='VAN B');

const migrationEntry=manifest.historicalInventory?.find?.(x=>x.path===sqlPath);
check('migration is registered in manifest',Boolean(migrationEntry));
check('migration manifest hash is exact',Boolean(migrationEntry)&&migrationEntry.sha256===sha(sqlPath));
check('migration is in certified tail order',manifest.policy?.certifiedRecentTailOrder?.includes(sqlPath));

if(failed){console.error(`R44R22 team assignment cutover certification: FAIL (${failed})`);process.exit(1);}
console.log('R44R22 team assignment cutover certification: PASS');

import fs from 'node:fs';
import process from 'node:process';

const read=file=>fs.readFileSync(file,'utf8');
const sql=read('supabase/migrations/phase_p5_13_8_72_r44r21_team_assignment_history.sql');
const svc=read('assets/js/installations-service.js');
const settings=read('assets/js/installation-settings-management.js');
const moduleJs=read('assets/js/installations-module.js');
const schedule=read('assets/js/installation-scheduling.js');
const reports=read('assets/js/installation-operations-reports.js');
const payroll=read('assets/js/payroll.js');
const treasurySvc=read('assets/js/vehicle-treasury-service.js');
const treasuryUi=read('assets/js/vehicle-treasury.js');
const loc=read('assets/js/localization-center.js');
const html=read('index.html');

let failed=0;
function check(name,ok){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)failed++;}
function has(source,...needles){return needles.every(x=>source.includes(x));}

check('effective-dated assignment history table',has(sql,'create table if not exists public.installation_team_assignment_history','effective_from date not null','effective_to date'));
check('history overlap / resource collision guard',has(sql,'guard_installation_team_assignment_history_overlap','h.groomer_employee_id=new.groomer_employee_id','h.driver_employee_id=new.driver_employee_id','h.appointment_car_id=new.appointment_car_id'));
check('one open assignment per team',sql.includes('uq_installation_team_assignment_history_open_team'));
check('known current baseline seed is explicit and non-guessing',has(sql,"'baseline_current'",'repository has no authoritative generic audit trail'));
check('canonical assignment-at-date resolver',has(sql,'public.installation_team_assignment_at(','h.effective_from<=w.business_date','h.effective_to>=w.business_date'));
check('team edit closes old segment and opens new segment',has(sql,'public.save_installation_team_assignment_v1(','set effective_to=v_effective-1',"'assignment_change'"));
check('current installation_teams remains current projection',has(sql,'update public.installation_teams','groomer_employee_id=v_groomer.id','appointment_car_id=v_car.id'));
check('commission rows resolve assignment by invoice date',has(sql,'public.payroll_live_commission_rows_range','public.installation_team_assignment_at(b.installation_team_id,b.invoice_date)'));
check('commission persistence is vehicle-segment aware',has(sql,'uq_payroll_commission_statement_vehicle_segment','payroll_month,installation_team_id,appointment_car_id,employee_id,commission_role'));
check('commission total sales remains canonical invoice total',has(sql,"'totalSales'",'public.payroll_commission_invoice_base b','b.invoice_date between v_from and v_to'));
check('vehicle treasury v2 is physical-car filtered',has(sql,'public.get_vehicle_treasury_workspace_v2(','p_car_id uuid default null','p_car_id is null or m.car_id=p_car_id'));
check('treasury revenue resolves car by movement date',has(sql,'public.installation_team_assignment_at(rb.team_id,rb.movement_date)'));
check('treasury expenses persist historical car id',has(sql,'select appointment_car_id into v_car from public.installation_team_assignment_at(p_team_id,v_date)','appointment_car_id=v_car'));
check('no R44 pruning activation in phase migration',!/(bounded_pruning|pruning_enabled|execution_enabled\s*=\s*true|r45)/i.test(sql));

check('settings exposes effective date',has(settings,'name="effectiveFrom"','appointmentSettings.team.effectiveFrom'));
check('settings saves through historical RPC',settings.includes("rpc('save_installation_team_assignment_v1'"));
check('add appointment groomer is derived from selected team/date',has(moduleJs,'teamAssignmentForDate(teamId,scheduledDate)','groomerInput.readOnly=hasTeam'));
check('scheduling renderer resolves groomer by business date',has(schedule,'InstallationsServiceSafe?.teamAssignmentForDate','businessDate'));
check('single-day scheduling persists resolved groomer',has(svc,'const assignment=await teamAssignmentForDate(payload.teamId,payload.scheduledDate)','p_technician_name:technicianName'));
check('multi-day scheduling resolves every visit date',has(svc,'const assignment=await teamAssignmentForDate(teamId,scheduledDate)','technician_name:technicianName'));
check('schedule list displays historical assignment segment',has(svc,'const scheduleHistory=await teamAssignmentHistory(scheduleTeamIds)','teamAssignmentAt(scheduleHistory'));
check('execution workspace displays historical assignment segment',has(svc,'const executionHistory=await teamAssignmentHistory(executionTeamIds)','teamAssignmentAt(executionHistory'));
check('execution preserves stored visit technician snapshot first',svc.includes('groomerName:v.technician_name||assignment?.groomerName'));
check('appointment reports load historical assignment rows',has(svc,'async function teamAssignmentHistory','teamAssignmentGroupKey','teamAssignmentId:assignment?.id'));
check('sales invoice report groups by historical assignment',has(reports,'invoice.teamAssignmentId','`${teamId}|${carId}`'));
check('commission UI groups physical cars by carId',payroll.includes("const commissionVehicleKey=row=>String(row?.carId||row?.teamId||'')"));
check('commission car sales sums historical role segments',has(payroll,"const roleSales=role=>g.rows.filter(r=>r.role===role).reduce", "Math.max(roleSales('groomer'),roleSales('driver'),roleSales('representative'),0)"));
check('vehicle treasury service uses v2 car workspace',has(treasurySvc,"rpc('get_vehicle_treasury_workspace_v2'",'carId: String(filters?.carId'));
check('vehicle treasury cache schema bumped for car ownership',has(treasurySvc,"const CACHE_PREFIX = 'vehicle-treasury:workspace:v3:'",'const CACHE_SCHEMA_VERSION = 3'));
check('vehicle treasury main UI filter is car id',treasuryUi.includes("function filters() { return { carId:$('vehicleTreasuryTeam')?.value||''"));
check('expense team options resolve assignment at expense date',has(treasuryUi,'function assignmentsForDate(date)','function fillExpenseTeams(date','vehicleTreasuryExpenseDate'));
check('visible vehicle treasury label is vehicle-only',has(html,'data-petatoe-i18n="vehicleTreasury.filter.car">السيارة<','<select id="vehicleTreasuryTeam"><option value="">اختر السيارة</option>'));
check('new localization namespace is routed',has(loc,"value.startsWith('appointmentSettings.')","screenKey:'installationSettings'"));

const requiredKeys=[
 'appointmentNew.schedule.groomerFromTeam','appointmentSettings.team.effectiveFrom','appointmentSettings.team.effectiveHint',
 'appointments.schedule.error.historyMigrationRequired','appointments.reports.error.historyMigrationRequired',
 'vehicleTreasury.expense.noTeamForDate','vehicleTreasury.error.historyMigrationRequired','vehicleTreasury.error.load',
 'pwa.update.release.r44r21.title','pwa.update.release.r44r21.note1','pwa.update.release.r44r21.note2','pwa.update.release.r44r21.note3'
];
for(const key of requiredKeys)check(`catalog + SQL seed ${key}`,loc.includes(`"${key}"`)||loc.includes(`'${key}'`) ? sql.includes(`('${key}'`) : false);

if(failed){console.error(`R44R21 team assignment history certification: FAIL (${failed})`);process.exit(1);}
console.log('R44R21 team assignment history certification: PASS');

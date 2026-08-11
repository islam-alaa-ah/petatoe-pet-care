import fs from 'node:fs';

const read = p => fs.readFileSync(p,'utf8');
const checks = [];
const check = (name, ok) => { checks.push([name,!!ok]); console.log(`${ok?'PASS':'FAIL'}: ${name}`); };

const moduleJs=read('assets/js/installations-module.js');
const serviceJs=read('assets/js/installations-service.js');
const schedulingJs=read('assets/js/installation-scheduling.js');
const html=read('index.html');
const migration=read('supabase/migrations/phase_p5_11_4_10_appointment_financials_multi_schedule_date_recovery.sql');

check('Discount type selector exists', html.includes('newInstallationDiscountType') && html.includes('percentage'));
check('Client VAT is calculated before discount', /const tax=Math\.round\(subtotal\*0\.15/.test(moduleJs) && /gross-discount/.test(moduleJs));
check('Client persists discount type and raw value', moduleJs.includes('discountType: financials.discountType') && serviceJs.includes('p_discount_type:payload.discountType'));
check('Database stores discount type and value', migration.includes('add column if not exists discount_type') && migration.includes('add column if not exists discount_value'));
check('Database VAT is calculated before discount', migration.includes('v_tax := round(v_subtotal*new.tax_rate/100.0,2)') && migration.includes('v_gross := round(v_subtotal+v_tax,2)'));
check('Database percentage discount applies to VAT-inclusive gross', migration.includes('v_discount := round(v_gross*v_discount_value/100.0,2)'));
check('Monthly schedule uses local calendar date key', schedulingJs.includes('function key(d){return localKey(d)}') && !schedulingJs.includes('function key(d){return d.toISOString().slice(0,10)}'));
check('Multi-visit date control is a calendar input', schedulingJs.includes('data-visit-date="${i}" type="date"'));
check('Multi-visit RPC accepts every non-empty selected visit list', migration.includes("jsonb_array_length(p_visits)<1"));
check('Same team can use same day at different times', migration.includes('Exact team slot conflict') && migration.includes('x.scheduled_time=v_time') && migration.includes('x.installation_team_id=v_team'));
check('Exact duplicate team/day/slot inside plan is blocked', migration.includes('لا يمكن حجز نفس الفرقة مرتين في نفس اليوم ونفس الوقت داخل الخطة'));
check('Existing visit numbering is preserved before appending plan', migration.includes('select coalesce(max(visit_no),0) into v_no'));
check('Schedule list still expands execution visits into calendar entries', serviceJs.includes('const expanded=[]') && serviceJs.includes('executionNumber:`${row.requestNumber}-'));

const failed=checks.filter(([,ok])=>!ok);
console.log(`\n${checks.length-failed.length}/${checks.length} checks passed.`);
if(failed.length)process.exit(1);

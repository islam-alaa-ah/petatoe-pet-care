import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const checks=[
 ['execution current requires canonical selection',read('assets/js/installation-execution.js').includes('rows.filter(r=>r.isCurrentUserSelection===true)')],
 ['legacy progress no longer makes current',read('assets/js/installation-execution.js').includes('function isActive(r){return Boolean(r.isCurrentUserSelection)')],
 ['completion navigation explicit',read('assets/js/installation-execution.js').includes("KYUMNavigation?.open?.('installationCompletion'")],
 ['completion supports append to next visit',read('assets/js/installation-completion.js').includes('append_to_next_visit')],
 ['completion supports return to scheduling',read('assets/js/installation-completion.js').includes('return_to_schedule')],
 ['completion carries next scheduled visit',read('assets/js/installations-service.js').includes('nextScheduledVisit')],
 ['migration adds pending scheduling visit state',read('supabase/migrations/phase_m15_11_2_completion_handoff_remaining_quantity_routing.sql').includes("'بانتظار الجدولة','مجدولة','قيد التنفيذ'")],
 ['finish clears current selection',read('supabase/migrations/phase_m15_11_2_completion_handoff_remaining_quantity_routing.sql').includes("selected_for_execution_at=case when p_next_status='مكتمل' then null")],
 ['finish routes visit to confirmation',read('supabase/migrations/phase_m15_11_2_completion_handoff_remaining_quantity_routing.sql').includes("then 'بانتظار التأكيد'")],
 ['quantity mismatch routing enforced',read('supabase/migrations/phase_m15_11_2_completion_handoff_remaining_quantity_routing.sql').includes("اختر طريقة معالجة فرق الكمية")],
 ['returned remainder is independently schedulable',read('supabase/migrations/phase_m15_11_2_completion_handoff_remaining_quantity_routing.sql').includes("values(p_request_id,v_no,'بانتظار الجدولة')")],
 ['version bumped',read('version.json').includes('18.53.19')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}if(failed)process.exit(1);console.log(`PASS ${checks.length}/${checks.length}`);

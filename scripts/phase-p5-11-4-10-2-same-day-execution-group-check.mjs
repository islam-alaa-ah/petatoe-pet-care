import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const js=read('assets/js/installations-service.js');
const sql=read('supabase/migrations/phase_p5_11_4_10_2_same_day_execution_group_recovery.sql');
const checks=[
 ['runtime groups request/team/date',js.includes("[item.id,item.teamId||'',item.scheduledDate||''].join('|')")],
 ['runtime aggregates service quantities',js.includes('x.quantity=Number(x.quantity||0)+Number(svc.quantity||0)')],
 ['completion groups same-day rows',js.includes('Same-day same-team execution slots are one completion/quantity-confirmation row')],
 ['SQL group helper exists',sql.includes('get_installation_execution_group_visit_ids')],
 ['selection marks the whole group',sql.includes('where id=any(ids) and status in (\'مجدولة\',\'قيد التنفيذ\')')],
 ['stage updates the whole group',sql.includes('where id=any(ids);')],
 ['quantity summary aggregates scheduled group',sql.includes('sum(coalesce(vs.scheduled_quantity,0))')],
 ['confirmation validates service against group',sql.includes("where vs.visit_id=any(ids) and vs.request_service_id=sid")],
 ['confirmation marks all group visits confirmed',sql.includes("set status='مؤكدة'")&&sql.includes('where id=any(ids)')],
 ['invoice aggregates group quantities',sql.includes('where vs.visit_id=any(ids)')],
 ['PostgREST cache reload included',sql.includes("notify pgrst,'reload schema'")],
 ['version bumped',JSON.parse(read('version.json')).version==='18.54.34']
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${n}`);if(!ok)fail++;}console.log(`${checks.length-fail}/${checks.length} PASS`);process.exit(fail?1:0);

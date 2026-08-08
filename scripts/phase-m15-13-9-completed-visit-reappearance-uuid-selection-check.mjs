import fs from 'node:fs';
const svc=fs.readFileSync(new URL('../assets/js/installations-service.js', import.meta.url),'utf8');
const mig=fs.readFileSync(new URL('../supabase/migrations/phase_m15_13_9_completed_visit_reappearance_uuid_selection_hotfix.sql', import.meta.url),'utf8');
const checks=[
  ['workspace loads all visit refs', svc.includes("db().from('installation_execution_visits').select('installation_request_id')")],
  ['historical visit set exists', svc.includes('requestsWithAnyVisit=new Set')],
  ['legacy fallback blocked for historical visits', svc.includes("if(requestsWithAnyVisit.has(String(r.id)))return")],
  ['migration replaces selection function', mig.includes('create or replace function public.select_installation_execution_visit')],
  ['no min(id)', !/min\s*\(\s*id\s*\)/i.test(mig)],
  ['single active visit selected by ordered id query', mig.includes('if active_count=1 then') && mig.includes('select id into v_id')],
  ['historical completed requests cannot auto-create', mig.includes("raise exception 'لا توجد زيارة تنفيذ نشطة لهذا الطلب'")],
  ['legacy ensure retained only when no visits', mig.includes('v_id:=public.ensure_installation_execution_visit(p_request_id)')]
];
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)process.exitCode=1;}
console.log(`${checks.filter(x=>x[1]).length}/${checks.length} PASS`);

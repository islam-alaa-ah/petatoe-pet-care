import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const svc=read('assets/js/installations-service.js');
const migration=read('supabase/migrations/phase_p5_13_8_42_completion_group_invoice_authority.sql');
const checks=[
  ['completion groups same execution identity', /const key=\[row\.id,row\.teamId\|\|'',row\.scheduledDate/.test(svc)],
  ['completion retains all group visit ids', /groupVisitIds:\[row\.visitId\]/.test(svc) && /prev\.groupVisitIds\.push\(row\.visitId\)/.test(svc)],
  ['direct confirmation uses group invoice RPC', /confirm_installation_execution_group_and_create_invoice_v5/.test(svc)],
  ['confirmed-only conversion carries group ids', /groupVisitIds:quantityCurrent\.groupVisitIds\|\|\[\]/.test(read('assets/js/installation-completion.js'))],
  ['invoice marker RPC is canonical source', /get_installation_completion_invoice_markers/.test(svc)],
  ['marker expands stored invoice anchor to execution group', /get_installation_execution_group_visit_ids/.test(migration)],
  ['marker preserves legacy request invoice', /installation_execution_visit_id is null/.test(migration)],
  ['no JS duplicate group expansion remains', !/completionCandidateVisits/.test(svc)],
  ['visit invoice filtering applies to pending visits', /for\(const v of pendingVisits\).*invoicedVisitIds\.has\(v\.id\)/s.test(svc)],
  ['visit invoice filtering applies to confirmed visits', /for\(const v of confirmedHistoryVisits\).*invoicedVisitIds\.has\(v\.id\)/s.test(svc)]
];
let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)fail++;}
console.log(`Completion group invoice authority: ${checks.length-fail}/${checks.length} PASS`);
if(fail)process.exit(1);

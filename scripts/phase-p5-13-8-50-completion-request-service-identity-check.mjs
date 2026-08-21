import fs from 'node:fs';

const completion=fs.readFileSync('assets/js/installation-completion.js','utf8');
const service=fs.readFileSync('assets/js/installations-service.js','utf8');
const migration=fs.readFileSync('supabase/migrations/phase_p5_13_8_50_completion_workspace_request_service_identity.sql','utf8');
const checks=[];
const check=(name,ok)=>checks.push([name,Boolean(ok)]);

check('workspace DOM preserves request_service_id',completion.includes('data-request-service-id')&&completion.includes('requestServiceId:row.dataset.requestServiceId'));
check('workspace no longer rejects duplicate service types',!completion.includes("throw new Error('لا يمكن تكرار نفس الخدمة أكثر من مرة.')"));
check('client sends request_service_id',service.includes('request_service_id:x.requestServiceId||null'));
check('RPC payload has canonical request-service identity',migration.includes('request_service_id uuid')&&migration.includes('resolved_request_service_id uuid'));
check('RPC updates exact service row by ID',migration.includes('s.id=t.request_service_id'));
check('RPC deletes only omitted persisted IDs',migration.includes('where t.request_service_id=s.id'));
check('new duplicate service type rows remain independently insertable',migration.includes('where request_service_id is null')&&migration.includes('returning id into v_new_service_id'));
check('allocation snapshot and rebuild use request_service_id',migration.includes('where a.request_service_id=svc.id')&&!migration.includes('where a.service_type_id=svc.service_type_id'));
check('executed history is protected per request-service row',migration.includes('vs.request_service_id=svc.id')&&migration.includes('Cannot remove a service with executed quantity'));
check('service-type mutation with execution history is guarded',migration.includes('Cannot change the service type of a line with executed quantity'));

for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} - ${name}`);
const failed=checks.filter(([,ok])=>!ok);
console.log(`\n${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length)process.exit(1);

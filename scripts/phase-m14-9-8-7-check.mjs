import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const checks=[
 ['quotation workflow filter',read('index.html').includes('quotationWorkflowFilter')],
 ['quotation conversion action',read('assets/js/app.js').includes('data-create-installation-from-quotation')],
 ['converted quotation open action',read('assets/js/app.js').includes('data-open-installation-request')],
 ['new request prefill event',read('assets/js/installations-module.js').includes('kyum-installation-create-from-quotation')],
 ['only accepted unconverted options',read('assets/js/installations-module.js').includes("quotation.status === 'مقبول'") && read('assets/js/installations-module.js').includes('!quotation.installation_request_id')],
 ['client create validation',read('assets/js/installations-service.js').includes("quotation.status!=='مقبول'") && read('assets/js/installations-service.js').includes('quotation.installation_request_id')],
 ['database unique quotation link',read('supabase/migrations/phase_m14_9_8_7_accepted_quotation_installation_workflow.sql').includes('ux_installation_requests_quotation_once')],
 ['database accepted-only trigger',read('supabase/migrations/phase_m14_9_8_7_accepted_quotation_installation_workflow.sql').includes('Only accepted quotations can be converted')],
 ['version',read('version.json').includes('18.46.6')]
];
let fail=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(!ok) fail++;} if(fail) process.exit(1);

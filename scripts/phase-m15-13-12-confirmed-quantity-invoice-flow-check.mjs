import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const completion=read('assets/js/installation-completion.js');
const installs=read('assets/js/installations-service.js');
const invoices=read('assets/js/sales-invoices-service.js');
const migration=read('supabase/migrations/phase_m15_13_12_confirmed_quantity_superadmin_cancel_visit_invoice_flow.sql');
const version=JSON.parse(read('version.json'));
const checks=[
  ['confirmed history has invoice action',completion.includes('تحويل إلى فاتورة')&&completion.includes('r.confirmedHistory')],
  ['cancel action gated by super admin in UI',completion.includes('isSuperAdmin()')&&completion.includes('data-cancel-confirmed-quantity')],
  ['cancel action server call exists',installs.includes('cancel_installation_execution_visit_confirmation')],
  ['visit invoice client RPC exists',invoices.includes('create_sales_invoice_from_installation_visit')],
  ['visit invoice database link exists',migration.includes('installation_execution_visit_id')],
  ['visit invoice DB requires confirmed visit',migration.includes("v.status<>'مؤكدة'")],
  ['cancel DB enforces super admin',migration.includes("public.current_user_role() is distinct from 'super_admin'::public.app_role")],
  ['cancel blocked after invoice',migration.includes('لا يمكن إلغاء الكمية المنفذة بعد إصدار فاتورة لها')],
  ['version bumped',version.version==='18.53.39']
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);

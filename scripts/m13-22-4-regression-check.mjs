import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const app=read('assets/js/app.js');
const html=read('index.html');
const sql=read('supabase/migrations/phase_m13_22_4_enterprise_regression_merge_recovery.sql');
const checks = [
 ['customer add UI/action', app.includes('canScreenAction("customers", "add")') && app.includes('requireScreenAction("customers", "add"')],
 ['quotation add UI/action', app.includes('canScreenAction("quotations", action)') && app.includes('requireScreenAction("quotations", action')],
 ['quotation searchable customer input', html.includes('id="quotationCustomerSearch"') && app.includes('quotationCustomerSearch')],
 ['search supports phone/name/code', app.includes('customer.phone') && app.includes('customer.customerNumber') && app.includes('customer.name')],
 ['role permission migration', sql.includes("('sales_representative', 'customers'") && sql.includes("('sales_representative', 'quotations'")],
 ['RLS insert policies', sql.includes('customers permission insert') && sql.includes('quotations permission insert')]
];
let failed=0;
for (const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'}: ${name}`); if(!ok) failed++; }
if(failed) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length}`);

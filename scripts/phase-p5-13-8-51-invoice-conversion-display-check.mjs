import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const service=read('assets/js/installations-service.js');
const completion=read('assets/js/installation-completion.js');
const version=JSON.parse(read('version.json'));
const checks=[
  ['visit services load executed_quantity',service.includes("select('visit_id,request_service_id,scheduled_quantity,executed_quantity')")],
  ['request services load unit_price',service.includes("select('id,installation_request_id,quantity,unit_price,line_total")],
  ['confirmed visit amount uses actual visit execution',service.includes('const actualExecuted=confirmedExecutionByVisit.get(String(v.id))||new Map()')&&service.includes('executedQuantity:Number(actualExecuted.get(String(x.request_service_id))||0)')],
  ['grouped invoice amount recalculated after merge',service.includes('row.invoiceAmount=row.quantities.reduce')&&service.includes('row.groupVisitIds=[...new Set(row.groupVisitIds||[])]')],
  ['invoice date defaults to scheduled date',completion.includes('r.report?.invoice_date||r.scheduledDate||today()')],
  ['invoice date remains user editable',!completion.includes('installationCompletionInvoiceDate").readOnly=true')&&!completion.includes('installationCompletionInvoiceDate").disabled=true')],
  ['version bumped',version.version==='18.55.69'&&version.build===185569]
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(ok)pass++;}
console.log(`\n${pass}/${checks.length} PASS`);
if(pass!==checks.length)process.exit(1);

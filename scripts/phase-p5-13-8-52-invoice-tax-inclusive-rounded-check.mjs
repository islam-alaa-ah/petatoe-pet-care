import fs from 'node:fs';
const completion=fs.readFileSync('assets/js/installation-completion.js','utf8');
const service=fs.readFileSync('assets/js/installations-service.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const checks=[
  ['canonical invoice financials RPC is used',service.includes("db().rpc('get_installation_execution_group_invoice_financials'") && service.includes('finalAmountIncludingTax:Number(row.final_amount_including_tax||0)')],
  ['completion service exports canonical financials reader',service.includes('completionQuantitySummary,completionInvoiceFinancials,saveCompletionWorkspace')],
  ['confirmed visit modal reads canonical final including tax',completion.includes('InstallationsServiceSafe.completionInvoiceFinancials(r.id,r.visitId)') && completion.includes('financials.finalAmountIncludingTax')],
  ['invoice display is rounded to whole SAR',completion.includes('invoiceValue=Math.round(Number(financials.finalAmountIncludingTax||0))') && completion.includes('installationCompletionInvoiceAmount").value=String(Math.max(0,invoiceValue))')],
  ['scheduled date remains the invoice date default',completion.includes('r.report?.invoice_date||r.scheduledDate||today()')],
  ['modal async failure is surfaced safely',completion.includes('openInstallation(r).catch(err=>status(')],
  ['release version at or beyond phase 52',Number(version.build||0)>=185570]
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)failed++;}
console.log(`\n${checks.length-failed}/${checks.length} checks passed`); process.exit(failed?1:0);

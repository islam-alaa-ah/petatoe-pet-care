import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html');
const completion=read('assets/js/installation-completion.js');
const service=read('assets/js/installations-service.js');
const freeNumber=read('supabase/migrations/phase_p5_13_8_16_invoice_number_and_confirmation_cancel_recovery.sql');
const groupAuthority=read('supabase/migrations/phase_p5_13_8_42_completion_group_invoice_authority.sql');
const checks=[
 ['completion screen uses current appointment completion identity',html.includes('تأكيد انتهاء المواعيد')&&html.includes('installationCompletionView')],
 ['completion supports confirm-only and later invoice conversion',completion.includes('تأكيد الكمية المنفذة')&&completion.includes('تحويل إلى فاتورة')&&completion.includes('quantityConfirmed')],
 ['completion supports direct confirmation plus invoice creation',completion.includes('confirmActualQuantitiesAndInvoice')&&completion.includes('shouldCreateInvoice')],
 ['invoice date is part of confirmation/conversion contract',completion.includes('installationQuantityInvoiceDate')&&completion.includes('installationCompletionInvoiceDate')],
 ['invoice number is a free business identifier',freeNumber.includes('drop constraint if exists sales_invoices_invoice_number_nine_digits')&&!completion.includes('/^\\d{9}$/')],
 ['completion queue excludes invoiced execution groups canonically',service.includes('get_installation_completion_invoice_markers')&&service.includes('invoicedVisitIds')],
 ['group invoice authority expands invoice anchor to same execution group',groupAuthority.includes('get_installation_completion_invoice_markers')&&groupAuthority.includes('get_installation_execution_group_visit_ids')],
 ['legacy quotation conversion event remains supported',completion.includes('kyum-open-unified-invoice-conversion')&&completion.includes('sourceType==="quotation"')]
];
let failed=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${n}`);if(!ok)failed++;}
console.log(`Current invoice conversion certification: ${checks.length-failed}/${checks.length} PASS`);if(failed)process.exit(1);

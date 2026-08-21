import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const ui=read('assets/js/installation-completion.js');
const svc=read('assets/js/installations-service.js');
const html=read('index.html');
const css=read('assets/css/installation-completion.css');
const version=JSON.parse(read('version.json'));
const checks=[
  ['version 18.55.71',version.version==='18.55.71'&&version.build===185571],
  ['scheduled date default',ui.includes("detail.scheduledDate||quantityCurrent?.scheduledDate||today()")],
  ['payment method normalization',ui.includes('normalizePaymentMethod')&&!ui.includes("const payment=noInvoice?'نقدي'" )],
  ['whole-SAR collected display',ui.includes('Math.round(isFullyCollected?f.final:storedAmount)')&&ui.includes('amountForStorage=amountDisplay===roundedFinal?f.final:amountDisplay')],
  ['attachment field',html.includes('installationQuantityAttachments')&&html.includes('viewInstallationQuantityAttachments')&&css.includes('.installation-quantity-attachments-field')],
  ['attachment rollback',svc.includes('uploadCompletionConfirmationAttachments')&&svc.includes("uploadExecutionFile(requestId,file,'collection',visitId||null)")&&svc.includes('rollbackExecutionFiles(uploaded)')],
  ['direct invoice trigger',ui.includes('shouldCreateInvoice=Boolean(directWithoutInvoice||directInvoiceNumber)')&&ui.includes('confirmActualQuantitiesAndInvoice')],
  ['non-invoice confirmation remains separate',ui.includes('confirmActualQuantities({')&&ui.includes('await load()')]
];
let fail=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}
console.log(`${checks.length-fail}/${checks.length} PASS`);if(fail)process.exit(1);

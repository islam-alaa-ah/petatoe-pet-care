import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('assets/js/installation-operations-reports.js');
const svc=read('assets/js/installations-service.js');
const html=read('index.html');
const css=read('assets/css/installation-operations-reports.css');
const version=JSON.parse(read('version.json'));
const checks=[
 ['all years option',js.includes('كل السنوات')],
 ['all months option',js.includes('كل الشهور')],
 ['all days option',js.includes('كل الأيام')],
 ['period range engine',js.includes("kind:'year'")&&js.includes("kind:'month'")&&js.includes("kind:'all'")],
 ['previous equivalent period',js.includes('period.previous')&&js.includes('مقارنة')],
 ['service range backend',svc.includes('filters.dateFrom')&&svc.includes('filters.dateTo')],
 ['paged reporting source',svc.includes('fetchPaged')&&svc.includes('pageSize=1000')],
 ['visual section titles',html.includes('الملخص التنفيذي للخدمات')&&html.includes('التحليل المالي')&&html.includes('التحليل التشغيلي')&&html.includes('التحليل الجغرافي')],
 ['period comparison section',html.includes('مقارنة الفترات')],
 ['visual section css',css.includes('.installation-service-section-title')&&css.includes('.installation-service-section{')],
 ['version',version.version==='18.53.16'],
 ['cache token',version.cacheToken==='kyum-crm-pwa-18-53-16-service-analytics-structure-s4-1']
];
let fail=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++}console.log(`S4.1 ${checks.length-fail}/${checks.length} PASS`);if(fail)process.exit(1);

import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const moduleJs=read('assets/js/installations-module.js');
const service=read('assets/js/installations-service.js');
const css=read('assets/css/installation-request-inline-dialogs.css');
const checks=[
 ['editable neighborhood',html.includes('installationServicesEditNeighborhood')],
 ['editable map url',html.includes('installationServicesEditMapUrl')],
 ['editable customer order',html.includes('installationServicesEditCustomerOrder')],
 ['editable quotation',html.includes('installationServicesEditQuotation')],
 ['unified context save',moduleJs.includes('updateRequestContextServices')],
 ['service validates quotation ownership',service.includes('عرض السعر لا يخص عميل طلب التركيب')],
 ['service uses request source fields',service.includes('p_neighborhood_id:payload.neighborhoodId')&&service.includes('p_customer_map_url:normalizeGoogleMapsUrl(payload.customerMapUrl)')],
 ['responsive no clip rules',css.includes('editable request context without clipped content')&&css.includes('overflow-wrap:anywhere')],
 ['version synchronized',html.includes('18.50.3')&&read('version.json').includes('18.50.3')&&read('assets/js/pwa.js').includes('18.50.3')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);

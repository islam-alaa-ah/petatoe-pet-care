import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html');
const geo=read('assets/js/geographic-address.js');
const app=read('assets/js/app.js');
const customers=read('assets/js/customers-service.js');
const installs=read('assets/js/installations-service.js');
const installModule=read('assets/js/installations-module.js');
const settings=read('assets/js/installation-settings-management.js');
const sw=read('service-worker.js');
const ver=JSON.parse(read('version.json'));
const checks=[
 ['shared geography runtime loads before customer/install services',html.indexOf(`geographic-address.js?v=${ver.version}`)>html.indexOf(`supabase-client.js?v=${ver.version}`)&&html.indexOf(`geographic-address.js?v=${ver.version}`)<html.indexOf(`customers-service.js?v=${ver.version}`)&&html.indexOf(`geographic-address.js?v=${ver.version}`)<html.indexOf(`installations-service.js?v=${ver.version}`)],
 ['canonical geography module owns catalog/index/validation',geo.includes('function buildIndexes()')&&geo.includes('function scoreSearch(type, row, query)')&&geo.includes('function canonicalizeAddress(address = {})')&&geo.includes('function validateCanonicalAddress(address = {}')&&geo.includes('function createController(config)')],
 ['geography catalog is active-only and cache-backed',geo.includes('.eq("is_active", true)')&&geo.includes('KYUMSmartCache.get')&&geo.includes('KYUMSmartCache.set')&&geo.includes('citiesByRegion')&&geo.includes('districtsByCity')],
 ['customer UI consumes unified active neighborhood catalog',app.includes('await window.KYUMGeography.loadCatalog(force)')&&app.includes('customerDistrictCatalog=geo.districts')&&app.includes('.filter(row=>row?.is_active!==false)')&&app.includes('button.dataset.customerNeighborhoodId')],
 ['customer service validates and persists canonical active neighborhood',customers.includes('from("installation_neighborhoods")')&&customers.includes('.eq("is_active", true)')&&customers.includes('neighborhood_id: neighborhood.id')&&customers.includes('address: String(neighborhood.name || address || "").trim() || null')],
 ['installation writes validate active neighborhood canonically',installs.includes('async function validateNeighborhoodIntegrity(neighborhoodId)')&&installs.includes(".eq('is_active',true).maybeSingle()")&&installs.includes('const geo=await validateNeighborhoodIntegrity(payload.neighborhoodId)')],
 ['installation edit/settings retain shared cascading controller',installModule.includes('window.KYUMGeography.createController')&&installModule.includes("installationGeoController('edit')")&&settings.includes('window.KYUMGeography.createController')&&settings.includes('installationReferenceRegionSearch')&&settings.includes('installationReferenceCitySearch')],
 ['new installation uses the same active canonical neighborhood catalog',installModule.includes("function setNewNeighborhood(neighborhoodId='')")&&installModule.includes('(opts.neighborhoods||[]).find')&&installs.includes("neighborhoods:fetchPaged((from,to)=>db().from('installation_neighborhoods')")],
 ['schema compatibility avoids optional national address columns',!geo.includes('national_address_region_id')&&!geo.includes('national_address_city_id')&&!geo.includes('national_address_district_id')],
 ['geography runtime is cached and release token is unified',sw.includes('./assets/js/geographic-address.js')&&html.includes(`geographic-address.js?v=${ver.version}`)]
];
let failed=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${n}`);if(!ok)failed++;}
console.log(`Current geography certification: ${checks.length-failed}/${checks.length} PASS`);if(failed)process.exit(1);

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('index.html');
const geo=read('assets/js/geographic-address.js');
const app=read('assets/js/app.js');
const installModule=read('assets/js/installations-module.js');
const installService=read('assets/js/installations-service.js');
const settings=read('assets/js/installation-settings-management.js');
const customers=read('assets/js/customers-service.js');
const excel=read('assets/js/customer-excel-center.js');
const sw=read('service-worker.js');
const pwa=read('assets/js/pwa.js');
const pkg=JSON.parse(read('package.json'));
const version=JSON.parse(read('version.json'));
const policy=JSON.parse(read('enterprise-offline-policy.json'));
let passed=0, failed=0;
function test(name,ok){ if(ok){passed++;console.log(`PASS ${name}`)} else {failed++;console.error(`FAIL ${name}`)} }

const sandbox={window:{},console,navigator:{onLine:true},CustomEvent:function(){}};
vm.runInNewContext(geo,sandbox,{filename:'geographic-address.js'});
const G=sandbox.window.KYUMGeography;
G.setCatalog({
  regions:[{id:'r1',name:'منطقة مكة المكرمة',is_active:true},{id:'r2',name:'منطقة الرياض',is_active:true}],
  cities:[{id:'c1',region_id:'r1',name:'جدة',is_active:true},{id:'c2',region_id:'r2',name:'الرياض',is_active:true}],
  districts:[{id:'d1',region_id:'r1',city_id:'c1',name:'حي الصفا',is_active:true},{id:'d2',region_id:'r2',city_id:'c2',name:'حي الياسمين',is_active:true}]
});

const valid=G.validateCanonicalAddress({regionId:'r1',cityId:'c1',districtId:'d1'});
const invalid=G.validateCanonicalAddress({regionId:'r1',cityId:'c2',districtId:'d2'});

test('unified geography module loads before customer/install services',
  html.indexOf('geographic-address.js?v=18.53.6')>html.indexOf('supabase-client.js?v=18.53.6') &&
  html.indexOf('geographic-address.js?v=18.53.6')<html.indexOf('customers-service.js?v=18.53.6') &&
  html.indexOf('geographic-address.js?v=18.53.6')<html.indexOf('installations-service.js?v=18.53.6'));

test('canonical Region-City-District chain validates and mismatch is rejected',valid.valid===true&&invalid.valid===false&&invalid.code==='CITY_REGION_MISMATCH');
test('Arabic search normalization remains certified',G.normalizeSearch('أَحْيَــاء')===G.normalizeSearch('احياء')&&G.normalizeSearch('حي الصفا')===G.normalizeSearch('الصفا')&&G.normalizeSearch('منطقة مكة المكرمة')===G.normalizeSearch('مكة المكرمة'));
test('ranked indexed search and keyboard/ARIA UX retained',geo.includes('buildIndexes()')&&geo.includes('scoreSearch(type, row, query)')&&geo.includes('aria-activedescendant')&&geo.includes('event.key === "Home"')&&geo.includes('event.key === "End"'));
test('persistent Smart Cache and runtime relation indexes retained',geo.includes('KYUMSmartCache.get')&&geo.includes('KYUMSmartCache.set')&&geo.includes('citiesByRegion')&&geo.includes('districtsByCity')&&geo.includes('networkRefreshPromise'));
test('customer add/edit and Excel import use canonical geography',app.includes('ensureCustomerGeoController')&&app.includes('canonicalGeo.region')&&excel.includes('KYUMGeography.canonicalizeAddress')&&excel.includes('العنوان يجب أن يطابق المنطقة ثم المدينة ثم الحي من القوائم المعتمدة'));
test('installation create/edit/settings use unified cascading component',installModule.includes('window.KYUMGeography.createController')&&installModule.includes("installationGeoController('new')")&&installModule.includes("installationGeoController('edit')")&&settings.includes('installationReferenceRegionSearch')&&settings.includes('installationReferenceCitySearch'));
test('service-side integrity validation remains enforced',installService.includes('validateNeighborhoodIntegrity')&&installService.includes("eq('is_active',true).maybeSingle()")&&customers.includes('validateCustomerGeography')&&customers.includes('validateCanonicalAddress'));
test('inactive geographic master records remain excluded',geo.includes('.eq("is_active", true)')&&installService.includes(".eq('is_active',true)"));
test('geographic direct data path is registered in enterprise offline policy',policy.domains?.geographic_reference?.file==='assets/js/geographic-address.js'&&policy.domains?.geographic_reference?.status==='compliant'&&policy.registeredDirectDataFiles.includes('assets/js/geographic-address.js'));
test('release version/cache tokens are unified',version.version==='18.53.6'&&version.build===185306&&pkg.version==='18.53.6'&&pwa.includes('CURRENT_VERSION = "18.53.6"')&&sw.includes('18-53-6-geographic-enterprise-certification')&&html.includes('geographic-address.js?v=18.53.6'));
test('service worker still caches geographic runtime',sw.includes('./assets/js/geographic-address.js'));

console.log(`\nM15.7 certification checks: ${passed} passed, ${failed} failed`);
if(failed) process.exit(1);

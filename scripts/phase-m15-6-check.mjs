import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const geo=read('assets/js/geographic-address.js');
const installs=read('assets/js/installations-service.js');
const moduleJs=read('assets/js/installations-module.js');
const customers=read('assets/js/customers-service.js');
const html=read('index.html');
const sw=read('service-worker.js');
const pwa=read('assets/js/pwa.js');
const pkg=JSON.parse(read('package.json'));
const version=JSON.parse(read('version.json'));
let passed=0,failed=0;
function test(name,ok){if(ok){passed++;console.log(`PASS ${name}`)}else{failed++;console.error(`FAIL ${name}`)}}

const sandbox={window:{},console,navigator:{onLine:true},CustomEvent:function(){}};
vm.runInNewContext(geo,sandbox,{filename:'geographic-address.js'});
const G=sandbox.window.KYUMGeography;
G.setCatalog({
 regions:[{id:'r1',name:'منطقة مكة المكرمة',is_active:true},{id:'r2',name:'منطقة الرياض',is_active:true}],
 cities:[{id:'c1',region_id:'r1',name:'جدة',is_active:true},{id:'c2',region_id:'r2',name:'الرياض',is_active:true}],
 districts:[{id:'d1',region_id:'r1',city_id:'c1',name:'حي الصفا',is_active:true},{id:'d2',region_id:'r2',city_id:'c2',name:'حي الياسمين',is_active:true}]
});
const valid=G.validateCanonicalAddress({regionId:'r1',cityId:'c1',districtId:'d1'});
const wrongCity=G.validateCanonicalAddress({regionId:'r1',cityId:'c2',districtId:'d2'});
const wrongDistrict=G.validateCanonicalAddress({regionId:'r1',cityId:'c1',districtId:'d2'});
const missing=G.validateCanonicalAddress({regionId:'r1',cityId:'missing',districtId:'d1'});

test('central canonical validation accepts a valid Region-City-District chain',valid.valid===true&&valid.value.complete===true);
test('central validation rejects City outside selected Region',wrongCity.valid===false&&wrongCity.code==='CITY_REGION_MISMATCH');
test('central validation rejects District outside selected City',wrongDistrict.valid===false&&wrongDistrict.code==='DISTRICT_CITY_MISMATCH');
test('inactive or unknown requested ids cannot silently fall back',missing.valid===false&&missing.code==='CITY_NOT_ACTIVE');
test('installation UI validates the full chain before create and edit saves',moduleJs.includes("installationGeoController('new').validate({ requireRegion: true, requireCity: true, requireDistrict: true })")&&moduleJs.includes("installationGeoController('edit').validate({requireRegion:true,requireCity:true,requireDistrict:true})"));
test('installation service revalidates neighborhood, city and region before write',installs.includes('validateNeighborhoodIntegrity')&&installs.includes("eq('is_active',true).maybeSingle()")&&installs.includes('سلامة العنوان مرفوضة'));
test('customer service canonicalizes and validates any supplied geographic address before write',customers.includes('validateCustomerGeography')&&customers.includes('validateCanonicalAddress')&&customers.includes('canonicalGeo.region'));
test('version/cache advanced consistently',version.version==='18.53.5'&&version.build===185305&&pkg.version==='18.53.5'&&pwa.includes('CURRENT_VERSION = "18.53.5"')&&sw.includes('18-53-5-geographic-validation-integrity')&&html.includes('geographic-address.js?v=18.53.5'));
console.log(`\nM15.6 checks: ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);

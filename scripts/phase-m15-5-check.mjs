import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const geo=read('assets/js/geographic-address.js');
const html=read('index.html');
const sw=read('service-worker.js');
const pwa=read('assets/js/pwa.js');
const pkg=JSON.parse(read('package.json'));
const version=JSON.parse(read('version.json'));
let passed=0,failed=0;
function test(name,ok){if(ok){passed++;console.log(`PASS ${name}`)}else{failed++;console.error(`FAIL ${name}`)}}

const cachedCatalog={
  regions:[{id:'r1',name:'منطقة مكة المكرمة',is_active:true}],
  cities:[{id:'c1',region_id:'r1',name:'جدة',is_active:true}],
  districts:[{id:'d1',region_id:'r1',city_id:'c1',name:'حي الصفا',is_active:true}]
};
const smartCache={
  async get(){return {hit:true,stale:true,data:cachedCatalog,metadata:{updatedAt:123}}},
  async set(){return {updatedAt:456}},
  hashValue(value){return JSON.stringify(value)}
};
const sandbox={window:{KYUMSmartCache:smartCache,KYUMOfflineSessionStore:{currentUserId:()=> 'u1'}},console,navigator:{onLine:false},CustomEvent:function(){}};
vm.runInNewContext(geo,sandbox,{filename:'geographic-address.js'});
const G=sandbox.window.KYUMGeography;
const loaded=await G.loadCatalog(false);
const status=G.getCacheStatus();

test('persistent Smart Cache is integrated',geo.includes('GEO_CACHE_KEY')&&geo.includes('KYUMSmartCache.get')&&geo.includes('KYUMSmartCache.set'));
test('offline stale cache is accepted safely',loaded.regions.length===1&&loaded.cities.length===1&&loaded.districts.length===1&&status.source==='persistent-cache'&&status.stale===true);
test('catalog network refresh is single-flight',geo.includes('networkRefreshPromise')&&geo.includes('if (networkRefreshPromise) return networkRefreshPromise'));
test('catalog load is single-flight in memory',geo.includes('if (catalogPromise) return catalogPromise')&&geo.includes('hasCompleteCatalog()'));
test('parent relation indexes avoid repeated full scans',geo.includes('citiesByRegion')&&geo.includes('districtsByCity')&&geo.includes('relationIndex.citiesByRegion.get')&&geo.includes('relationIndex.districtsByCity.get'));
test('id indexes accelerate canonical resolution',geo.includes('regionById')&&geo.includes('cityById')&&geo.includes('districtById')&&geo.includes('relationIndex.districtById.get'));
test('background refresh updates cache without blocking cached render',geo.includes('persistent.data')&&geo.includes('refreshCatalogFromNetwork(namespace, persistent.data).catch'));
test('version/cache advanced consistently',version.version==='18.53.4'&&version.build===185304&&pkg.version==='18.53.4'&&pwa.includes('CURRENT_VERSION = "18.53.4"')&&sw.includes('18-53-4-geographic-cache-performance')&&html.includes('geographic-address.js?v=18.53.4'));
console.log(`\nM15.5 checks: ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);

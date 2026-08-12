import fs from "node:fs";

const geo=fs.readFileSync(new URL("../assets/js/geographic-address.js",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../assets/js/app.js",import.meta.url),"utf8");
const version=JSON.parse(fs.readFileSync(new URL("../version.json",import.meta.url),"utf8"));
const checks=[
 ["Geography regions use base schema columns only",geo.includes('fetchAll("installation_regions", "id,name,is_active")')],
 ["Geography cities use base schema columns only",geo.includes('fetchAll("installation_cities", "id,region_id,name,is_active")')],
 ["Geography neighborhoods use base schema columns only",geo.includes('fetchAll("installation_neighborhoods", "id,region_id,city_id,name,city,region,is_active")')],
 ["Runtime no longer selects optional national address columns",!geo.includes('national_address_region_id')&&!geo.includes('national_address_city_id')&&!geo.includes('national_address_district_id')],
 ["Customer neighborhood still uses unified geography catalog",app.includes('await window.KYUMGeography.loadCatalog(force)')&&app.includes('customerDistrictCatalog=geo.districts')],
 ["Customer active-neighborhood filtering preserved",app.includes('.filter(row=>row?.is_active!==false)')],
 ["Version bumped",version.version==="18.54.37"],
 ["Cache token bumped",version.cacheToken.includes("18-54-37")]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"}: ${name}`);if(!ok)failed++;}
console.log(`\n${checks.length-failed}/${checks.length} checks passed.`);
if(failed)process.exit(1);

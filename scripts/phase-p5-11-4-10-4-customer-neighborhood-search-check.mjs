import fs from "node:fs";

const files={
  index:fs.readFileSync(new URL("../index.html",import.meta.url),"utf8"),
  app:fs.readFileSync(new URL("../assets/js/app.js",import.meta.url),"utf8"),
  service:fs.readFileSync(new URL("../assets/js/customers-service.js",import.meta.url),"utf8"),
  version:JSON.parse(fs.readFileSync(new URL("../version.json",import.meta.url),"utf8"))
};
const checks=[
  ["Customer address uses searchable combobox",files.index.includes('id="customerNeighborhoodCombobox"')&&files.index.includes('id="customerNeighborhoodOptions"')],
  ["Customer neighborhood id is stored separately",files.index.includes('id="customerNeighborhoodId" type="hidden"')],
  ["Neighborhood catalog comes from unified geography",files.app.includes('await window.KYUMGeography.loadCatalog(force)')&&files.app.includes('customerDistrictCatalog=geo.districts')],
  ["Customer neighborhood search filters active Supabase neighborhoods",files.app.includes('.filter(row=>row?.is_active!==false)')&&files.app.includes('normalizeCustomerNeighborhoodSearch(row?.name).includes(q)')],
  ["Typing clears stale selected neighborhood id",files.app.includes('hidden.value="";')&&files.app.includes('search.dataset.selectedId=""')],
  ["Customer save requires selected neighborhood",files.app.includes('if(!neighborhoodId)')&&files.app.includes('اختر الحي من القائمة.')],
  ["Customer save sends neighborhoodId",files.app.includes('name,address,neighborhoodId,googleMapsUrl,phone')],
  ["Customers service validates active neighborhood",files.service.includes('from("installation_neighborhoods")')&&files.service.includes('.eq("is_active", true)')],
  ["Customers service persists neighborhood_id",files.service.includes('neighborhood_id: neighborhood.id')],
  ["Customer address is canonical neighborhood name",files.service.includes('address: String(neighborhood.name || address || "").trim() || null')],
  ["Version bumped",files.version.version==="18.54.36"]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"}: ${name}`);if(!ok)failed++;}
console.log(`\n${checks.length-failed}/${checks.length} checks passed.`);
if(failed)process.exit(1);

import fs from "node:fs";
const index=fs.readFileSync("index.html","utf8");
const scheduling=fs.readFileSync("assets/js/installation-scheduling.js","utf8");
const service=fs.readFileSync("assets/js/installations-service.js","utf8");
const checks=[
 ["pending table has nine columns",["رقم الطلب","العميل","الخدمات","إجمالي الخدمات","الموقع","المندوب","الموعد","الحالة","الإجراء"].every(x=>index.includes(`<th>${x}</th>`))],
 ["technician removed from pending header",!index.includes("<th>الفني</th><th>الإجراء</th>")],
 ["representative joined in scheduleList",service.includes("representative:sales_representatives(id,full_name)")],
 ["representative mapped",service.includes("representativeName:r.representative?.full_name||''")],
 ["services rendered in pending table",scheduling.includes("servicesSummary(r)")],
 ["total rendered in pending table",scheduling.includes("money(r.totalServicesAmount)")],
 ["location rendered in pending table",scheduling.includes("locationSummary(r)")],
 ["empty colspan updated",scheduling.includes('colspan=\"9\"')&&index.includes('colspan="9"')]
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} - ${name}`);if(!ok)failed++;} if(failed)process.exit(1);

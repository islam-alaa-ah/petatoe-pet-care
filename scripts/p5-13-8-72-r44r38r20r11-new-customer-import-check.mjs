import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));
const checks=[]; const check=(name,ok)=>checks.push([name,Boolean(ok)]);
const ui=read("assets/js/appointment-historical-import.js");
const svc=read("assets/js/appointment-historical-import-service.js");
const html=read("index.html");
const loc=read("assets/js/localization-center.js");
const ver=JSON.parse(read("version.json"));
const manifest=JSON.parse(read("supabase/migration-manifest.json"));
check("version",ver.version==="18.56.122"&&Number(ver.build)===185722);
check("plan rpc",svc.includes("plan_appointment_historical_customer_creation_r44r38r20"));
check("customer add permission",svc.includes("canCustomerAdd")&&svc.includes("'customers','add'"));
check("plan called after validation",ui.includes("planCustomerCreation(state.rows)"));
check("new customer summary",html.includes("appointmentHistoricalImportSummaryNewCustomers")&&ui.includes("NewCustomers:summary.newCustomers"));
check("new customer preview",ui.includes("plan?.action==='create'")&&ui.includes("appointmentDataImport.match.created"));
check("exact name label",ui.includes("exact_unique_name"));
check("historical map label",ui.includes("historical_customer_map"));
check("import confirmation",ui.includes("confirm.importWithCustomers"));
check("import result customers",ui.includes("createdCustomers"));
check("canonical css owner",read("assets/css/appointment-historical-import.css").includes(".appointment-history-import-summary .is-info strong"));
check("localization new customer",loc.includes("appointmentDataImport.summary.newCustomers")&&loc.includes("appointmentDataImport.error.customerAddPermission"));
check("release localization",loc.includes("pwa.update.release.r44r38r20r11.title"));
check("cache bust",html.includes("?v=18.56.122"));
check("pwa version",read("assets/js/pwa.js").includes('CURRENT_VERSION = "18.56.122"'));
check("sw cache",read("service-worker.js").includes("petatoe-pwa-18-56-122-historical-new-customer-import-r44r38r20r11"));
const migrations=[
"supabase/migrations/phase_p5_13_8_72_r44r38r20r4_legacy_customer_code_normalization.sql",
"supabase/migrations/phase_p5_13_8_72_r44r38r20r6_exact_unique_name_fallback.sql",
"supabase/migrations/phase_p5_13_8_72_r44r38r20r7_null_safe_name_fallback.sql",
"supabase/migrations/phase_p5_13_8_72_r44r38r20r10_new_customer_creation_gate.sql"];
for(const p of migrations){
  check(`migration ${path.basename(p)}`,exists(p));
  const e=manifest.historicalInventory.find(x=>x.path===p);
  const h=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,p))).digest("hex");
  check(`manifest ${path.basename(p)}`,e?.sha256===h);
}
check("phase",manifest.release?.phase==="R44R38R20R11");
const failed=checks.filter(x=>!x[1]);
for(const [name,ok] of checks) console.log(`${ok?"PASS":"FAIL"}  ${name}`);
console.log(`R44R38R20R11 Certification: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length) process.exit(1);

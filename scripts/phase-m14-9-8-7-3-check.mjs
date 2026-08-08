import fs from "node:fs";
const moduleText=fs.readFileSync("assets/js/installations-module.js","utf8");
const appText=fs.readFileSync("assets/js/app.js","utf8");
const checks=[
 ["session intent",moduleText.includes("QUOTATION_PREFILL_KEY")],
 ["supabase fetch",moduleText.includes("fetchQuotationPrefill")],
 ["accepted guard",moduleText.includes("لا يمكن إنشاء طلب تركيب إلا من عرض سعر مقبول")],
 ["refresh restore",moduleText.includes("readQuotationPrefillIntent")],
 ["customer sync",moduleText.includes("syncCustomerSearch(customer.id)")],
 ["quotation sync",moduleText.includes("quotationSelect.value = quotation.id")],
 ["direct api",appText.includes("KYUMInstallationsModule?.openFromQuotation")],
 ["version",fs.readFileSync("version.json","utf8").includes("18.46.10")]
];
for(const [name,pass] of checks){console.log(`${pass?"PASS":"FAIL"} - ${name}`);if(!pass)process.exitCode=1;}

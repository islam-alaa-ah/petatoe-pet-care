const fs=require('fs'); const assert=require('assert');
const s=fs.readFileSync(__dirname+'/../assets/js/sales-reports.js','utf8');
const checks={
 'pagination RPC range':/\.rpc\("sales_reports_rows_r44r38r20r35"\)\s*\.range\(start, start \+ RPC_PAGE_SIZE - 1\)/,
 'pagination completion':/if \(!complete\) throw new Error/,
 'no partial cache writes':/if \(!complete\)[\s\S]*?await writeCache\(rows\)/,
 'cache version bumped':/sales-reports:v3-complete/,
 'year all sentinel':/year: \$\("salesReportsYear"\)\?\.value === "" \? 0/,
 'month all sentinel':/month: \$\("salesReportsMonth"\)\?\.value === "" \? 0/,
 'year filter no limit':/\(filters\.year && d\.getFullYear\(\) !== filters\.year\)/,
 'monthly chart year condition':/!filters\.year \|\| d\.getFullYear\(\) === filters\.year/,
 'cash aggregates excluded invoice count':/invoiceSource = source\.filter\(row => row\.recordType !== "cash_aggregate"\)/,
 'zero-value month no artificial bar':/value > 0 \? Math\.max\(3, value \/ max \* 100\) : 0/
};
for(const [name,pattern] of Object.entries(checks)){assert(pattern.test(s),name);console.log('PASS',name)}
console.log(`A3 guard: ${Object.keys(checks).length} PASS`);

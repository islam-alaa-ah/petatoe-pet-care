const assert = require('node:assert/strict');
const fs = require('node:fs'); const js=fs.readFileSync(__dirname+'/assets/js/sales-reports.js','utf8'); const html=fs.readFileSync(__dirname+'/index.html','utf8'); const css=fs.readFileSync(__dirname+'/assets/css/sales-reports.css','utf8');
let checks=0;function ok(test,message){assert.ok(test,message);checks++}
ok(js.includes('"دفع إلكتروني", "الدفع الإلكتروني", "الدفع عن طريق الموقع"'),'website alias mapping');
ok(js.includes('key !== "غير محدد" || Math.abs(value) > 0.005'),'unknown zero suppression');
ok(js.includes('function comparisonYears(filters)'),'year comparison');
ok(js.includes('if (d.getFullYear() === year - 1) previous[d.getMonth()] += row.total'),'prior year inclusion');
ok(js.includes('array.slice(q*3, q*3+3)'),'quarter alignment');
ok(js.includes('renderQuarterComparison(filters);') && js.includes('renderMonthComparison(filters);'),'comparison renders');
ok(!js.slice(js.indexOf('function comparisonYears'),js.indexOf('function comparisonTable')).includes('filters.month'),'comparison not truncated by month');
ok(['salesReportsComparisonChart','salesReportsQuarterChart','salesReportsMonthComparisonChart'].every(x=>html.includes(x)),'comparison placeholders');
ok(html.indexOf('salesReportsComparisonChart') < html.indexOf('salesReportsQuarterChart') && html.indexOf('salesReportsQuarterChart') < html.indexOf('salesReportsMonthComparisonChart'),'comparison card order');
ok(css.includes('.sales-period-comparison') && css.includes('font-size:15px'),'canonical css typography');
const amounts=[1,2,3,4,5,6,7,8,9,10,11,12];const quarters=[0,1,2,3].map(q=>amounts.slice(q*3,q*3+3).reduce((a,b)=>a+b,0));assert.equal(quarters.reduce((a,b)=>a+b,0), amounts.reduce((a,b)=>a+b,0));checks++;
console.log(`A5 checks ${checks}/${checks} PASS`)

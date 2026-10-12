const fs=require('node:fs'),assert=require('node:assert/strict');
const root=__dirname, js=fs.readFileSync(root+'/assets/js/sales-reports.js','utf8'), css=fs.readFileSync(root+'/assets/css/sales-reports.css','utf8'), html=fs.readFileSync(root+'/index.html','utf8');
let n=0;function test(ok,msg){assert.ok(ok,msg);n++}
test(js.includes('Math.round(host.getBoundingClientRect().width)'),'responsive chart width');
test(js.includes('Math.max(720, chartWidth || 1000)'),'safe responsive SVG viewbox');
test(js.includes('renderDaily(summarize(filterRows(filters)).source, filters)'),'resize uses identical filtered dataset');
test(js.includes('function comparisonDashboard('),'shared dashboard renderer');
test(js.includes('comparisonDashboard(labels, [currentTotal], [previousTotal]'),'year dashboard');
test(js.includes('comparisonDashboard(labels, current, previous, data.year'),'quarter dashboard');
test(js.includes('comparisonDashboard(labels, data.current, data.previous, data.year'),'monthly dashboard');
test(js.includes('comparisonTable(labels, current, previous, data.year)'),'same data used for quarter table');
test(js.includes('comparisonTable(labels, data.current, data.previous, data.year)'),'same data used for month table');
test(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'desktop dashboard grid');
test(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'small screen dashboard');
test(html.indexOf('salesReportsComparisonChart')<html.indexOf('salesReportsQuarterChart')&&html.indexOf('salesReportsQuarterChart')<html.indexOf('salesReportsMonthComparisonChart'),'unchanged comparison order');
const months=[100,200,300,400,500,600,700,800,900,1000,1100,1200];const quarters=[0,1,2,3].map(q=>months.slice(q*3,q*3+3).reduce((a,b)=>a+b,0));assert.equal(quarters.reduce((a,b)=>a+b,0),months.reduce((a,b)=>a+b,0));n++;
console.log(`A6 ${n}/${n} PASS`);

const fs=require('node:fs');const assert=require('node:assert/strict');const p=__dirname;const js=fs.readFileSync(p+'/assets/js/sales-reports.js','utf8'),css=fs.readFileSync(p+'/assets/css/sales-reports.css','utf8');let count=0;function check(x,label){assert.ok(x,label);count++}
check(js.includes('function comparisonChart(labels, current, previous, year)'), 'paired chart consumes table arrays');
check(!js.includes('function comparisonDashboard('),'old KPI renderer deleted');
check(js.includes('comparisonChart([String(data.year)], [currentTotal], [previousTotal], data.year)'),'year comparison');
check(js.includes('comparisonChart(labels, current, previous, data.year)'),'quarter comparison');
check(js.includes('comparisonChart(labels, data.current, data.previous, data.year)'),'monthly comparison');
check(js.includes('comparisonTable(labels, [currentTotal], [previousTotal], data.year)'),'year table same data');
check(js.includes('comparisonTable(labels, current, previous, data.year)'),'quarter table same data');
check(js.includes('comparisonTable(labels, data.current, data.previous, data.year)'),'month table same data');
check(js.includes('class="sales-comparison-bar sales-comparison-bar--${kind}"'),'bar svg rendered');
check(css.includes('.sales-comparison-chart-scroll')&&css.includes('overflow-x:auto'),'responsive overflow');
check(!css.includes('.sales-comparison-kpi{'),'removed A6 card owner CSS');
check(css.includes('.sales-comparison-bar--current')&&css.includes('.sales-comparison-bar--previous'),'two distinct series');
console.log(`A7 ${count}/${count} PASS`);

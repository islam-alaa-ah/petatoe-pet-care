const fs=require('fs'), assert=require('assert');
const js=fs.readFileSync(__dirname+'/assets/js/sales-reports.js','utf8');
const css=fs.readFileSync(__dirname+'/assets/css/sales-reports.css','utf8');
let n=0; const test=(ok,desc)=>{assert.ok(ok,desc);n++;};
// A9 comparison chart sizing and anti-overlap logic
['const isMonth = length === 12;','const isQuarter = length === 4;','const isYear = length === 1;'].forEach(s=>test(js.includes(s),s));
test(js.includes('const width = isMonth ? 1760 : isQuarter ? 1120 : 620;'),'responsive width tiers');
test(js.includes('const height = isYear ? 320 : 395;'),'year chart compact height');
test(js.includes('const ceiling = maxValue * (isYear ? 1.12 : isMonth ? 1.22 : 1.18);'),'dynamic headroom');
test(js.includes("const labelAnchor = isMonth ? (lane === 0 ? 'end' : 'start') : 'middle';"),'month label anchor separation');
test(js.includes('const labelX = isMonth ? cx + (lane === 0 ? -6 : 6) : cx;'),'month label x offset');
// change column colors
['.sales-period-row .positive,.sales-period-row>strong.positive{color:#16a34a!important}','.sales-period-row .negative,.sales-period-row>strong.negative{color:#dc2626!important}'].forEach(s=>test(css.includes(s),s));
// payment legend structure split value and pct
['<small><bdi dir="ltr">${esc(pct(method.pct))}</bdi></small>','.sales-chart-legend strong small{font-size:13px;font-weight:700;color:var(--muted)}'].forEach(s=>test((js+css).includes(s),s));
// year chart constrained visual size
['.sales-comparison-svg--year{max-width:820px;margin-inline:auto;min-width:520px}','.sales-comparison-svg--month{min-width:1760px}'].forEach(s=>test(css.includes(s),s));
console.log('A9 '+n+'/'+n+' PASS');

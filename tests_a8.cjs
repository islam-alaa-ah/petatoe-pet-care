const fs=require('fs'), assert=require('assert');
const js=fs.readFileSync(__dirname+'/assets/js/sales-reports.js','utf8');
const css=fs.readFileSync(__dirname+'/assets/css/sales-reports.css','utf8');
let n=0;function test(ok,desc){assert.ok(ok,desc);n++}
test(js.includes('center - (bar + gap) / 2'),'previous bar separate');
test(js.includes('center + (bar + gap) / 2'),'current bar separate');
test(js.includes('lane === 0 ? 28 : 9'),'labels staggered');
test(js.includes('const height = 395'),'chart vertical space');
test(js.includes('const width = length === 12 ? 1440 : length === 4 ? 1100 : 780'),'per chart sizing');
test(js.includes('const ceiling = maxValue * 1.18'),'headroom');
test(js.includes('a > b ? "positive" : a < b ? "negative" : "neutral"'),'sign styles');
test(js.includes('<bdi dir="ltr">${esc(change(a,b))}</bdi>'),'RTL minus positioning');
test(css.includes('.sales-period-row .negative{color:var(--danger)}'),'negative red');
test(css.includes('.sales-period-row .positive{color:var(--success)}'),'positive green');
test(css.includes('paint-order:stroke'),'label legibility');
test(!css.includes('max-height:370px'),'no aspect distortion');
console.log('A8 '+n+'/'+n+' PASS');

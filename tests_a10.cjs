const fs = require('fs');
const assert = require('assert');
const js = fs.readFileSync(__dirname + '/assets/js/sales-reports.js', 'utf8');
const css = fs.readFileSync(__dirname + '/assets/css/sales-reports.css', 'utf8');
let n = 0;
const test = (ok, desc) => { assert.ok(ok, desc); n++; };

// Daily chart improvements
['const width = Math.max(920, days * 34, chartWidth || 1100)','class="sales-chart-label sales-chart-label--day"','data-day="${index + 1}"','function bindDailyTooltip(host)','sales-chart-tooltip'].forEach(s => test(js.includes(s) || css.includes(s), s));

// Payment method report converted to mini-table layout
['sales-payment-table','sales-payment-table-head','sales-payment-table-row','Payment method','طريقة السداد'].forEach(s => test((js + css).includes(s), s));

// Monthly selected-year chart values positioned above each bar
['class="sales-month-value" style="bottom:${labelBottom}"','sales-month-track{height:100%;position:relative','sales-month-value{position:absolute'].forEach(s => test((js + css).includes(s), s));

// Comparison charts spacing + month anti-overlap
['const width = isMonth ? 1960 : isQuarter ? 1180 : 660;','const close = Math.abs(entries[0].top - entries[1].top) < 22;','sales-comparison-svg--month{min-width:1960px}','sales-comparison-axis--guide'].forEach(s => test((js + css).includes(s), s));

// Change column color classes applied directly to generated cell
['data-role="change"','[data-role="change"].positive','[data-role="change"].negative'].forEach(s => test((js + css).includes(s), s));

console.log('A10 ' + n + '/' + n + ' PASS');

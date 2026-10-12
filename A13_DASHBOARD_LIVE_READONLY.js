(async () => {
  'use strict';
  const client = window.customerSupabase;
  if (!client?.rpc) return console.error('A13: Supabase client unavailable');
  const $ = id => document.getElementById(id);
  const payment = value => {
    const k = String(value || '').trim().replace(/\s+/g, ' ');
    if (['شبكة','بطاقة','بطاقة / شبكة','بطاقة/شبكة'].includes(k)) return 'بطاقة / شبكة';
    if (['دفع إلكتروني','الدفع الإلكتروني','الدفع عن طريق الموقع'].includes(k)) return 'الدفع عن طريق الموقع';
    return k || 'غير محدد';
  };
  const selector = id => $(id)?.value ?? '';
  const filters = {
    year: Number(selector('salesReportsYear')) || 0,
    month: Number(selector('salesReportsMonth')) || 0,
    car: selector('salesReportsVehicle'),
    customer: selector('salesReportsCustomer'),
    team: selector('salesReportsTeam'),
    payment: selector('salesReportsPayment'),
    status: selector('salesReportsStatusFilter')
  };
  const rows = [], seen = new Set();
  const PAGE_SIZE = 500;
  let complete = false;
  for (let p = 0; p < 40; p++) {
    const {data, error} = await client.rpc('sales_reports_rows_r44r38r20r35')
      .range(p * PAGE_SIZE, (p+1)*PAGE_SIZE-1);
    if (error) return console.error('A13: RPC page failed; no partial results accepted', {page:p+1,error});
    if (!Array.isArray(data)) return console.error('A13: Non-array RPC response');
    for (const r of data) {
      const id = `${r.is_historical?'h':'c'}:${r.row_id}`;
      if (!r.row_id || seen.has(id)) return console.error('A13: duplicate/missing row ID; STOP',id);
      seen.add(id); rows.push(r);
    }
    if (data.length < PAGE_SIZE) {complete=true;break;}
  }
  if (!complete) return console.error('A13: MAX_PAGES reached; STOP');
  const frows = rows.filter(r => {
    const date = String(r.invoice_date || '').slice(0,10);
    const y = Number(date.slice(0,4)), m = Number(date.slice(5,7));
    return (!filters.year || y===filters.year) && (!filters.month || m===filters.month)
      && (!filters.car || String(r.car_id||'')===filters.car)
      && (!filters.customer || String(r.customer_id||'')===filters.customer)
      && (!filters.team || String(r.team_id||'')===filters.team)
      && (!filters.payment || payment(r.payment_method)===filters.payment)
      && (!filters.status || String(r.status||'')===filters.status);
  });
  const cents = (arr,k) => arr.reduce((v,r)=>v+Math.round(Number(r[k]||0)*100),0);
  const value = (arr,k) => (cents(arr,k)/100).toFixed(2);
  const invoices = frows.filter(r=>r.record_type!=='cash_aggregate');
  const keys = new Set(invoices.map(r => r.is_historical
    ? `historical:${r.invoice_number||''}:${r.invoice_date||''}:${r.customer_id||r.customer_name_ar||''}`
    : `current:${r.row_id}`));
  const invoiceAmount = cents(invoices,'amount_incl_tax');
  const cashRows = frows.filter(r=>payment(r.payment_method)==='نقدي');
  const creditRows = frows.filter(r=>payment(r.payment_method)==='آجل');
  const byPayment = new Map();
  frows.forEach(r => byPayment.set(payment(r.payment_method), (byPayment.get(payment(r.payment_method))||0)+Math.round(Number(r.amount_incl_tax||0)*100)));
  const metrics = {
    totalSales: Number(value(frows,'amount_incl_tax')),
    invoiceCount: keys.size,
    beforeTax: Number(value(frows,'amount_before_tax')),
    tax: Number(value(frows,'tax_amount')),
    discount: Number(value(frows,'discount_amount')),
    averageInvoice: keys.size ? invoiceAmount / 100 / keys.size : 0,
    cashSales: Number(value(cashRows,'amount_incl_tax')),
    creditSales: Number(value(creditRows,'amount_incl_tax')),
    issuedShare: frows.length ? frows.filter(r=>r.status==='صادرة').length / frows.length*100 : 0
  };
  const dom = (key) => $(`salesReportsKpiGrid`)?.querySelector(`.sales-report-kpi-card--${key} strong`)?.textContent?.trim() || '';
  const parse = value => Number(String(value||'').replace(/[^0-9.\-]/g,''));
  const results = Object.entries(metrics).map(([key,expected])=>{
    const displayed = dom(key);
    const observed = parse(displayed);
    const tolerance = ['invoiceCount'].includes(key) ? 0 : (key==='issuedShare'?0.051:key==='averageInvoice'?0.011:0.011);
    return {metric:key,expected:Number(expected.toFixed(2)),displayed,delta:Number((observed-expected).toFixed(2)),status:!displayed?'MISSING':(Math.abs(observed-expected)<=tolerance?'PASS':'REVIEW')};
  });
  const historical = rows.filter(r=>r.is_historical===true);
  const monthly = new Map();
  frows.forEach(r=>{
    const month=String(r.invoice_date||'').slice(0,7);
    monthly.set(month,(monthly.get(month)||0)+Math.round(Number(r.amount_incl_tax||0)*100));
  });
  const sumPayments = [...byPayment.values()].reduce((a,b)=>a+b,0);
  const audit = [{
    complete, rpc_rows:rows.length, historical_rows:historical.length,
    filtered_rows:frows.length, filtered_cash_aggregate:frows.filter(r=>r.record_type==='cash_aggregate').length,
    payment_delta:(sumPayments-cents(frows,'amount_incl_tax'))/100,
    months_delta:([...monthly.values()].reduce((a,b)=>a+b,0)-cents(frows,'amount_incl_tax'))/100,
    historical_reference_3141:historical.length===3141?'PASS':'REVIEW_PERMISSION_SCOPE'
  }];
  console.log('A13 DASHBOARD — SELECTED FILTERS',filters);
  console.log('A13 DASHBOARD — INTEGRITY'); console.table(audit);
  console.log('A13 DASHBOARD — KPI VS LIVE RPC'); console.table(results);
  console.log('A13 DASHBOARD — PAYMENT BREAKDOWN');
  console.table([...byPayment.entries()].map(([method,totalCents])=>({method,total:(totalCents/100).toFixed(2)})));
  console.log('A13 DASHBOARD — DISCOUNT SIGN DIAGNOSTIC');
  console.table([{
    positive_discount_rows:frows.filter(r=>Number(r.discount_amount)>0).length,
    negative_discount_rows:frows.filter(r=>Number(r.discount_amount)<0).length,
    discount_signed_total:value(frows,'discount_amount'),
    formula_gross_beforeTax_plus_discount:(Number(value(frows,'amount_before_tax'))+Number(value(frows,'discount_amount'))).toFixed(2)
  }]);
  console.log('A13: read-only diagnostic completed; no UI state or database data changed');
})();

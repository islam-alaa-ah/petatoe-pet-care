/* A14.3A — read-only customer reporting input certification.
   Run in authenticated Petatoe browser Console. Does not mutate state. */
(async () => {
  'use strict';
  const db = window.customerSupabase;
  if (!db?.rpc || !db?.from) { console.error('A14.3A FAIL: authenticated Supabase client missing'); return; }
  const pageSize = 500, maxPages = 200;
  async function fetchPaged(makeQuery, label) {
    const rows = [], seen = new Set();
    let completed = false;
    for (let p = 0; p < maxPages; p++) {
      const {data, error} = await makeQuery().range(p * pageSize, (p + 1) * pageSize - 1);
      if (error) throw new Error(`${label} page ${p+1}: ${error.message}`);
      if (!Array.isArray(data)) throw new Error(`${label}: unexpected response`);
      for (const item of data) {
        const id = String(item.row_id ?? item.id ?? '');
        const key = `${item.is_historical ? 'h:' : 'c:'}${id}`;
        if (!id || seen.has(key)) throw new Error(`${label}: duplicate/missing ID ${key}`);
        seen.add(key); rows.push(item);
      }
      if (data.length < pageSize) { completed = true; break; }
    }
    if (!completed) throw new Error(`${label}: pagination incomplete; refusing partial totals`);
    return rows;
  }
  try {
    const sales = await fetchPaged(() => db.rpc('sales_reports_rows_r44r38r20r35'), 'sales');
    const customers = await fetchPaged(() => db.from('customers').select('id,created_at,neighborhood_id').order('created_at',{ascending:false}).order('id',{ascending:true}), 'customers');
    const ids = new Set(customers.map(c=>String(c.id)));
    const historical = sales.filter(x=>x.is_historical===true);
    const noCustomer = historical.filter(x=>!x.customer_id);
    const orphan = sales.filter(x=>x.customer_id && !ids.has(String(x.customer_id)));
    const numbered = historical.filter(x=>x.record_type==='invoice_line' && x.customer_id && String(x.invoice_number || '').trim() && !['نقدي','كاش','cash','بدون فاتورة'].includes(String(x.invoice_number).trim().toLowerCase()));
    const invoiceKeys = new Set(numbered.map(x=>[x.customer_id,String(x.invoice_date||'').slice(0,10),String(x.invoice_number).trim()].join('|')));
    const perCustomer = new Map();
    for (const key of invoiceKeys) {const id=key.split('|')[0];perCustomer.set(id,(perCustomer.get(id)||0)+1);}
    const total = items => (items.reduce((v,r)=>v+Math.round(Number(r.amount_incl_tax||0)*100),0)/100).toFixed(2);
    const expectedHistorical = historical.length===3141;
    console.log('A14.3A — INTEGRITY (historical reference is a snapshot, not a permanent constraint)');
    console.table([{sales_rows:sales.length,historical_rows:historical.length,customers_visible:customers.length,customer_ids_unique:ids.size===customers.length,historical_reference_3141:expectedHistorical?'MATCH':'CHANGED / SCOPE CHECK', historical_cash_aggregate:historical.filter(x=>x.record_type==='cash_aggregate').length, historical_without_customer:noCustomer.length, historical_unassigned_sales:total(noCustomer), sales_customer_ids_outside_visible_customer_scope:orphan.length}]);
    console.log('A14.3A — HISTORICAL PURCHASE IDENTITY');
    console.table([{numbered_invoice_lines:numbered.length,distinct_customer_invoice_keys:invoiceKeys.size,customers_with_numbered_purchases:perCustomer.size,one_purchase_customers:[...perCustomer.values()].filter(n=>n===1).length,repeat_purchase_customers:[...perCustomer.values()].filter(n=>n>=2).length}]);
    console.log('A14.3A — HISTORICAL ANNUAL SALES');
    console.table([...new Set(historical.map(x=>String(x.invoice_date||'').slice(0,4)))].sort().map(y=>({year:y,rows:historical.filter(x=>String(x.invoice_date||'').startsWith(y)).length,inclusive:total(historical.filter(x=>String(x.invoice_date||'').startsWith(y)))})));
    console.log('A14.3A — READ ONLY COMPLETE. Important: a missing customer from the visible customer scope is NOT necessarily an orphan in the database.');
  } catch(error) { console.error('A14.3A BLOCKED — do not release customer reports until resolved:',error); }
})();

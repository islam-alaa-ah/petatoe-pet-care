(async () => {
  'use strict';
  const rpc = window.customerSupabase;
  if (!rpc?.rpc) return console.error('A13 STOP: Supabase RPC client unavailable');
  const specs = [
    ['year','salesReportsYear'],['month','salesReportsMonth'],
    ['vehicle','salesReportsVehicle'],['customer','salesReportsCustomer'],
    ['team','salesReportsTeam'],['payment','salesReportsPayment'],
    ['status','salesReportsStatusFilter']
  ];
  const elements = Object.fromEntries(specs.map(([k,id])=>[k,document.getElementById(id)]));
  if (Object.values(elements).some(x=>!x)) return console.error('A13 STOP: filter element missing',specs.filter(([k])=>!elements[k]));
  const canonical = v => {
    const k=String(v||'').trim().replace(/\s+/g,' ');
    if (['شبكة','بطاقة','بطاقة / شبكة','بطاقة/شبكة'].includes(k)) return 'بطاقة / شبكة';
    if (['دفع إلكتروني','الدفع الإلكتروني','الدفع عن طريق الموقع'].includes(k)) return 'الدفع عن طريق الموقع';
    return k||'غير محدد';
  };
  const rows=[]; const seen=new Set(); const pageSize=500; let complete=false;
  for(let p=0;p<200;p++) {
    const {data,error}=await rpc.rpc('sales_reports_rows_r44r38r20r35').range(p*pageSize,(p+1)*pageSize-1);
    if(error || !Array.isArray(data)) return console.error('A13 STOP: page error',p+1,error);
    for(const r of data){const key=`${r.is_historical?'H':'C'}:${r.row_id}`;
      if(!r.row_id||seen.has(key)) return console.error('A13 STOP: duplicate or missing row key',key);
      seen.add(key);rows.push(r);
    }
    if(data.length<pageSize){complete=true;break;}
  }
  if(!complete) return console.error('A13 STOP: incomplete pagination');
  const cents=(r,k)=>Math.round(Number(r[k]||0)*100);
  const sum=(a,k)=>a.reduce((n,r)=>n+cents(r,k),0);
  const fmt=n=>(n/100).toFixed(2);
  const field={vehicle:'car_id',customer:'customer_id',team:'team_id',payment:'payment_method',status:'status'};
  const norm=(k,r)=>k==='payment'?canonical(r.payment_method):String(r[field[k]]||'');
  const date=r=>String(r.invoice_date||'').slice(0,10);
  const filt={year:Number(elements.year.value)||0,month:Number(elements.month.value)||0,
    vehicle:elements.vehicle.value,customer:elements.customer.value,
    team:elements.team.value,payment:elements.payment.value,status:elements.status.value};
  const matches=(r,f)=>{
    const d=date(r), year=Number(d.slice(0,4)),month=Number(d.slice(5,7));
    return (!f.year||year===f.year)&&(!f.month||month===f.month)&&
      (['vehicle','customer','team','payment','status'].every(k=>!f[k]||norm(k,r)===f[k]));
  };
  const selected=rows.filter(r=>matches(r,filt));
  const optionAudit=[];
  for(const [key] of specs){
    const select=elements[key],options=[...select.options];
    const nonEmpty=options.filter(o=>o.value!=='');
    const blank=nonEmpty.filter(o=>!o.textContent.trim());
    const dup=nonEmpty.length-new Set(nonEmpty.map(o=>o.value)).size;
    const dataValues= new Set(rows.map(r=>key==='year'?date(r).slice(0,4):key==='month'?String(Number(date(r).slice(5,7))):norm(key,r)).filter(Boolean));
    const stale=nonEmpty.filter(o=>!dataValues.has(o.value));
    const missing=[...dataValues].filter(v=>!nonEmpty.some(o=>o.value===v));
    optionAudit.push({filter:key,options:nonEmpty.length,blank_labels:blank.length,duplicate_values:dup,
      stale_options:stale.length,missing_options:missing.length,
      status:blank.length||dup||stale.length||missing.length?'REVIEW':'PASS',
      samples:blank.slice(0,3).map(x=>x.value).join(', ')});
  }
  const partition=[];
  for(const key of ['year','month','vehicle','customer','team','payment','status']){
    const original=fmt(sum(rows,'amount_incl_tax'));
    const groups=new Map();let unassigned=0,unassignedTotal=0;
    for(const r of rows){
      const value=key==='year'?date(r).slice(0,4):key==='month'?String(Number(date(r).slice(5,7))):norm(key,r);
      if(!value){unassigned++;unassignedTotal+=cents(r,'amount_incl_tax');continue;}
      const entry=groups.get(value)||{rows:0,inclusive:0,tax:0,discount:0};
      entry.rows++;entry.inclusive+=cents(r,'amount_incl_tax');entry.tax+=cents(r,'tax_amount');entry.discount+=cents(r,'discount_amount');groups.set(value,entry);
    }
    const groupedTotal=[...groups.values()].reduce((v,g)=>v+g.inclusive,0);
    const delta=groupedTotal+unassignedTotal-sum(rows,'amount_incl_tax');
    partition.push({filter:key,groups:groups.size,unassigned_rows:unassigned,
      unassigned_sales:fmt(unassignedTotal),total_source:original,partition_delta:fmt(delta),
      status:delta===0?'PASS':'REVIEW'});
    if(['year','payment','status'].includes(key)) {
      console.log(`A13 GROUPS — ${key}`);
      console.table([...groups.entries()].map(([value,g])=>({value,rows:g.rows,inclusive:fmt(g.inclusive),tax:fmt(g.tax),discount:fmt(g.discount)})));
    }
  }
  const discounts = [
    ['POSITIVE',rows.filter(r=>Number(r.discount_amount)>0)],
    ['NEGATIVE',rows.filter(r=>Number(r.discount_amount)<0)],
    ['ZERO',rows.filter(r=>Number(r.discount_amount)===0)],
    ['ALL',rows]
  ].map(([type,list])=>({type,rows:list.length,before_tax:fmt(sum(list,'amount_before_tax')),
    discount:fmt(sum(list,'discount_amount')),inclusive:fmt(sum(list,'amount_incl_tax'))}));
  const rateRows = rows.map(r=>({ ...r, _yr:date(r).slice(0,4)}));
  const discountByYear = [...new Set(rateRows.map(r=>r._yr))].sort().map(year=>{
    const subset=rateRows.filter(r=>r._yr===year);const before=sum(subset,'amount_before_tax');const d=sum(subset,'discount_amount');
    return {year,rows:subset.length,positive:subset.filter(r=>Number(r.discount_amount)>0).length,
      negative:subset.filter(r=>Number(r.discount_amount)<0).length,signed_discount:fmt(d),
      app_gross_formula:fmt(before+d),app_discount_rate_pct:(before+d ? 100*d/(before+d):0).toFixed(3)};
  });
  console.log('A13 — PAGINATION / CURRENT FILTERS', {complete,rows:rows.length,historical:rows.filter(r=>r.is_historical===true).length,filters:filt,selected_rows:selected.length,selected_sales:fmt(sum(selected,'amount_incl_tax'))});
  console.log('A13 — FILTER OPTION INTEGRITY');console.table(optionAudit);
  console.log('A13 — FILTER PARTITION RECONCILIATION');console.table(partition);
  console.log('A13 — DISCOUNT SIGN SPLIT');console.table(discounts);
  console.log('A13 — DISCOUNT FORMULA BY YEAR (DIAGNOSTIC, NOT ACCOUNTING APPROVAL)');console.table(discountByYear);
  console.log('A13 COMPLETE: READ ONLY. No filters, UI state, cache, or database changed.');
})();

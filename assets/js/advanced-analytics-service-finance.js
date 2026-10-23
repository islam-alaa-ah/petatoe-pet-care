/* A17.3.3.2 — financially conservative service intelligence; no invoice amount allocation */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const tr = k => window.PetatoeLocalization?.t?.('advancedAnalytics.'+k) || k;
 const can = () => ['advancedAnalytics','servicesReports','salesReports'].every(k => window.PermissionEngine?.canView?.(k)===true);
 const psize=500,cap=200;
 let busy=false,ready=false, historical=[],current=[],names=new Map();
 const cents = v => { const n=Number(v); if(!Number.isFinite(n)) throw Error('INVALID_AMOUNT');return Math.round((n+Number.EPSILON)*100);};
 const money = v => (v/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const el=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e;};
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
 const shift=(k,n)=>{const [y,m]=k.split('-').map(Number),d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,7);};
 const clear=()=>{for(const k of ['a17FinanceKpis','a17FinanceTrend','a17FinanceTrendBody','a17FinanceTrendFoot','a17FinanceGrowth','a17FinanceGrowthBody','a17FinanceShare','a17FinanceShareBody','a17FinanceShareFoot'])$(k)?.replaceChildren();};
 const status=k=>{if($('a17FinanceStatus'))$('a17FinanceStatus').textContent=tr(k);};
 async function pages(make,label) {const out=[],seen=new Set();let ended=false;for(let i=0;i<cap;i++){const {data,error}=await make().range(i*psize,(i+1)*psize-1);if(error)throw error;if(!Array.isArray(data))throw Error(label+'_INVALID');for(const r of data){const id=String(r.id||r.row_id||'');if(!id||seen.has(id))throw Error(label+'_DUPLICATE');seen.add(id);out.push(r);}if(data.length<psize){ended=true;break;}}if(!ended)throw Error(label+'_INCOMPLETE');return out;}
 async function load(){if(busy)return;ready=false;historical=[];current=[];names=new Map();clear();if(!can()){status('financeBlocked');return;}
  const db=window.customerSupabase;if(navigator.onLine===false||!db?.from||!db?.rpc){status('financeFailed');return;}
  busy=true;status('financeLoading');$('a17FinanceLoad').disabled=true;
  try{
   const [h,services,rpc]=await Promise.all([
    pages(()=>db.from('appointment_historical_sales_reporting').select('id,sales_date,record_type,service_type_id,sales_inclusive,item_is_unspecified'),'HIST'),
    pages(()=>db.from('installation_service_types').select('id,name,service_code'),'CATALOG'),
    pages(()=>db.rpc('sales_reports_rows_r44r38r20r35'),'RPC')
   ]);
   names=new Map(services.map(x=>[x.id,String(x.name||x.service_code||x.id)]));
   historical=h.map(r=>{const d=String(r.sales_date||'').slice(0,10);if(!validDate(d))throw Error('HIST_DATE');const v=cents(r.sales_inclusive??0);const classified=r.record_type!=='cash_aggregate'&&!!r.service_type_id&&!r.item_is_unspecified;if(classified&&!names.has(r.service_type_id))throw Error('HIST_UNKNOWN_TYPE');return {month:d.slice(0,7),value:v,service:classified?r.service_type_id:null};});
   current=rpc.filter(r=>r.is_historical===false).map(r=>{const d=String(r.invoice_date||'').slice(0,10);if(!validDate(d))throw Error('CURRENT_DATE');return {month:d.slice(0,7),value:cents(r.amount_incl_tax??0)};});
   ready=true;render();status('financeLoaded');
  }catch(e){console.error('A17.3.3.2 finance load',e);ready=false;historical=[];current=[];names=new Map();clear();status('financeFailed');}
  finally{busy=false;$('a17FinanceLoad').disabled=false;}
 }
 const buckets=rows=>{const m=new Map();for(const r of rows)m.set(r.month,(m.get(r.month)||0)+r.value);return m;};
 const aggregate=(arr,fn)=>{const m=new Map();for(const r of arr){const k=fn(r);m.set(k,(m.get(k)||0)+r.value);}return m;};
 function line(root,name,val,max,suffix){const div=el('div','a17-service-chart-row'),label=el('span','a17-service-chart-label',name),track=el('div','a17-service-chart-track'),fill=el('span','a17-service-chart-fill'),v=el('strong','a17-service-chart-value',suffix);fill.style.width=(max?Math.max(0,val/max*100):0).toFixed(2)+'%';track.append(fill);div.append(label,track,v);root.append(div);}
 function table(id,vals){const trEl=el('tr');for(const v of vals)trEl.append(el('td','',v));$(id)?.append(trEl);}
 const ratio=(a,b)=>b>0?((a-b)*100/b).toFixed(1)+'%':tr('financeNoBaseline');
 function render(){clear();if(!ready||!can()){if(!can())status('financeBlocked');return;}
  const year=$('a17Year')?.value,mon=$('a17Month')?.value||'',mode=$('a17Compare')?.value||'previous';if(!/^\d{4}$/.test(year||''))return;
  const now=new Date(),monthNow=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const ks=(mon?[year+'-'+mon]:Array.from({length:12},(_,i)=>year+'-'+String(i+1).padStart(2,'0'))).filter(x=>x<=monthNow);
  const reference=k=>shift(k,mode==='yoy'?-12:-ks.length),baseSet=new Set(ks.map(reference)),set=new Set(ks),partial=ks.includes(monthNow);
  // Classified historical service line amounts are exact. Current canonical invoice totals have no verified per-service allocation.
  const byMonth=buckets(historical.filter(x=>x.service));
  const totals=buckets([...historical,...current]);
  const cHist=aggregate(historical.filter(x=>x.service&&set.has(x.month)),r=>r.service);
  const bHist=aggregate(historical.filter(x=>x.service&&baseSet.has(x.month)),r=>r.service);
  const currClass=[...cHist.values()].reduce((a,b)=>a+b,0),refClass=[...bHist.values()].reduce((a,b)=>a+b,0);
  const selected=ks.reduce((a,k)=>a+(totals.get(k)||0),0),unassigned=selected-currClass; if(unassigned<0) { clear();status('financeFailed');console.error('A17_SERVICE_SALES_RECONCILIATION_NEGATIVE_UNATTRIBUTED',{selected,currClass});return; }
  const kpis=$('a17FinanceKpis');for(const [label,value] of [[tr('financeClassified'),money(currClass)+' SAR'],[tr('financeUnassigned'),money(unassigned)+' SAR'],[tr('financeCoverage'),selected>0?(100*currClass/selected).toFixed(2)+'%':tr('financeNoBaseline')]]){const b=el('div','a17-kpi');b.append(el('span','',label),el('strong','',value));kpis?.append(b);}
  const trend=$('a17FinanceTrend');const max=Math.max(1,...ks.map(k=>Math.max(byMonth.get(k)||0,byMonth.get(reference(k))||0)));
  for(const k of ks){const a=byMonth.get(k)||0,b=byMonth.get(reference(k))||0;line(trend,k,a,max,money(a)+' SAR');table('a17FinanceTrendBody',[k,reference(k),money(a),money(b)]);}
  if(!ks.length)trend.textContent=tr('noData');else table('a17FinanceTrendFoot',[tr('totalRow'),'—',money(currClass),money(refClass)]);
  const ids=[...new Set([...cHist.keys(),...bHist.keys()])];const rows=ids.map(id=>({id,name:names.get(id)||id,a:cHist.get(id)||0,b:bHist.get(id)||0})).sort((a,b)=>b.a-a.a||a.name.localeCompare(b.name));
  const growth=$('a17FinanceGrowth'),sort=[...rows].sort((a,b)=>(b.b?((b.a-b.b)/b.b):-Infinity)-(a.b?((a.a-a.b)/a.b):-Infinity));const top=Math.max(1,...rows.map(r=>r.a));
  for(const r of sort){const v=(partial||!r.b)?tr('financeNoBaseline'):ratio(r.a,r.b);line(growth,r.name,r.a,top,v);table('a17FinanceGrowthBody',[r.name,money(r.a),money(r.b),v]);}if(!sort.length)growth.textContent=tr('noData');
  const share=$('a17FinanceShare');for(const r of rows.filter(x=>x.a>0)){line(share,r.name,r.a,top,currClass?(100*r.a/currClass).toFixed(2)+'%':'—');table('a17FinanceShareBody',[r.name,money(r.a),currClass?(100*r.a/currClass).toFixed(2)+'%':'—']);}
  if(unassigned>0){line(share,tr('financeUnassigned'),unassigned,Math.max(top,unassigned),money(unassigned)+' SAR');table('a17FinanceShareBody',[tr('financeUnassigned'),money(unassigned),tr('financeNotAttributed')]);}
  if(!rows.length&&!unassigned)share.textContent=tr('noData');else table('a17FinanceShareFoot',[tr('totalRow'),money(selected),'—']);
  status(partial?'financePartial':'financeLoaded');
 }
 function toggle(name){const d=$('a17Finance'+name+'Details'),btn=$('a17Finance'+name+'Toggle');if(!d||!btn)return;d.hidden=!d.hidden;btn.setAttribute('aria-expanded',String(!d.hidden));btn.textContent=tr(d.hidden?'showDetails':'hideDetails');}
 document.addEventListener('DOMContentLoaded',()=>{const mode=$('a17ServiceMetric');function sync(){const financial=mode?.value==='sales';for(const id of ['a17FinancePanel','a17FinanceGrowthPanel','a17FinanceSharePanel']){if($(id))$(id).hidden=!financial;}for(const id of ['a17ServicesPanel','a17ServiceGrowthPanel','a17ServiceSharePanel']){if($(id))$(id).classList.toggle('a17-finance-hidden',financial);}if(financial){if(ready)render();else status('financeNotLoaded');}}
 mode?.addEventListener('change',sync);$('a17FinanceLoad')?.addEventListener('click',load);$('a17Apply')?.addEventListener('click',()=>{if(ready)render();});$('a17Compare')?.addEventListener('change',()=>{if(ready)render();});for(const x of ['Trend','Growth','Share'])$('a17Finance'+x+'Toggle')?.addEventListener('click',()=>toggle(x));sync();});
 document.addEventListener('petatoe:language-changed',()=>{if(ready)render();else status(can()?'financeNotLoaded':'financeBlocked');});
 window.AdvancedAnalyticsServiceFinance=Object.freeze({load,render});
})();

(() => {
 'use strict';
 const $=id=>document.getElementById(id),t=k=>window.PetatoeLocalization?.t?.('advancedAnalytics.'+k)||k;
 const allowed=()=>['advancedAnalytics','servicesReports','salesReports','installationReports'].every(x=>window.PermissionEngine?.canView?.(x)===true);
 const page=500,maxPages=200;let busy=false,ready=false,records=[],types=new Map(),loadingError=false;
 const number=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:3});
 const text=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value);return el;};
 const keyOf=x=>String(x||'').slice(0,7);
 const dateOk=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;};
 const shift=(key,n)=>{const [y,m]=key.split('-').map(Number),d=new Date(Date.UTC(y,m-1+n,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');};
 const clear=()=>{for(const id of ['a17ServiceKpis','a17ServiceTrend','a17ServiceTrendBody','a17ServiceTrendFoot','a17ServiceGrowth','a17ServiceGrowthBody','a17ServiceShare','a17ServiceShareBody','a17ServiceShareFoot'])$(id)?.replaceChildren();};
 const status=k=>{if($('a17ServiceStatus'))$('a17ServiceStatus').textContent=t(k);};
 async function all(query,name){const out=[],seen=new Set();let finished=false;for(let n=0;n<maxPages;n++){const {data,error}=await query.range(n*page,(n+1)*page-1);if(error)throw error;if(!Array.isArray(data))throw Error(name+'_INVALID');for(const r of data){if(!r.id||seen.has(r.id))throw Error(name+'_DUPLICATE');seen.add(r.id);out.push(r);}if(data.length<page){finished=true;break;}}if(!finished)throw Error(name+'_INCOMPLETE');return out;}
 async function load(){if(busy)return;ready=false;records=[];types=new Map();clear();if(!allowed()){status('serviceBlocked');return;}
  busy=true;status('serviceLoading');$('a17ServiceLoad').disabled=true;
  try{
   const db=window.customerSupabase;if(navigator.onLine===false||!db?.from)throw Error('OFFLINE');
   const [visits,lines,requests,catalogue]=await Promise.all([
    all(db.from('installation_execution_visits').select('id,installation_request_id,status,scheduled_date'),'VISITS'),
    all(db.from('installation_execution_visit_services').select('id,visit_id,request_service_id,executed_quantity'),'LINES'),
    all(db.from('installation_request_services').select('id,installation_request_id,service_type_id'),'REQUEST_LINES'),
    all(db.from('installation_service_types').select('id,name,service_code'),'CATALOGUE')
   ]);
   const op=await window.InstallationsServiceSafe?.operationalReport?.({});if(!op||!Array.isArray(op.rows))throw Error('OPERATIONAL_SCOPE_UNAVAILABLE');
   const scopes=new Set();for(const row of op.rows){if(!row.id||scopes.has(row.id))throw Error('OPERATIONAL_DUPLICATE');scopes.add(row.id);}
   const visitById=new Map(visits.map(x=>[x.id,x])),requestById=new Map(requests.map(x=>[x.id,x]));types=new Map(catalogue.map(x=>[x.id,String(x.name||x.service_code||x.id)]));
   const built=[];for(const l of lines){const v=visitById.get(l.visit_id);if(!v)throw Error('MISSING_VISIT');if(String(v.status||'').trim()!=='مؤكدة')continue;
    const rs=requestById.get(l.request_service_id);if(!rs||rs.installation_request_id!==v.installation_request_id)throw Error('MISSING_OR_MISMATCHED_SERVICE');
    if(!scopes.has(v.installation_request_id))throw Error('OUTSIDE_OPERATIONAL_SCOPE');if(!types.has(rs.service_type_id))throw Error('UNKNOWN_SERVICE');
    const date=String(v.scheduled_date||'').slice(0,10);if(!dateOk(date))throw Error('INVALID_DATE');
    const qty=Number(l.executed_quantity??0);if(!Number.isFinite(qty)||qty<0)throw Error('INVALID_QUANTITY');if(qty===0)continue;
    built.push({date,month:keyOf(date),service:rs.service_type_id,qty});
   }
   records=built;ready=true;populate();render();status('serviceLoaded');
  }catch(error){console.error('A17.3.3 services execution load',error);ready=false;records=[];types=new Map();clear();status('serviceFailed');}
  finally{busy=false;$('a17ServiceLoad').disabled=false;}
 }
 function populate(){const select=$('a17ServiceSelect');if(!select)return;const prev=select.value;select.replaceChildren();const opt=text('option','',t('serviceAll'));opt.value='';select.append(opt);const ids=[...new Set(records.map(r=>r.service))].sort((a,b)=>(types.get(a)||a).localeCompare(types.get(b)||b));for(const id of ids){const o=text('option','',types.get(id)||id);o.value=id;select.append(o);}if(ids.includes(prev))select.value=prev;}
 const sums=(list,sel)=>{const m=new Map();for(const r of list){const key=sel(r);m.set(key,(m.get(key)||0)+r.qty);}return m;};
 const row=(body,values)=>{const r=document.createElement('tr');for(const v of values)r.append(text('td','',v));body.append(r);};
 const bar=(root,name,qty,max,label)=>{const box=text('div','a17-service-chart-row',''),title=text('span','a17-service-chart-label',name),track=text('div','a17-service-chart-track',''),fill=text('span','a17-service-chart-fill','');fill.style.width=(max>0?Math.max(0,qty/max*100):0).toFixed(2)+'%';track.append(fill);box.append(title,track,text('strong','a17-service-chart-value',label));root.append(box);};
 function render(){clear();if(!ready||!allowed()){if(!allowed())status('serviceBlocked');return;}
  const year=$('a17Year')?.value,month=$('a17Month')?.value||'',mode=$('a17Compare')?.value||'previous',service=$('a17ServiceSelect')?.value||'';
  if(!year){status('serviceNotLoaded');return;}
  const now=new Date(),currentMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const periods=(month?[year+'-'+month]:Array.from({length:12},(_,i)=>year+'-'+String(i+1).padStart(2,'0'))).filter(k=>k<=currentMonth);
  const base=k=>shift(k,mode==='yoy'?-12:-periods.length);
  const byMonth=sums(records.filter(r=>!service||r.service===service),r=>r.month);
  const cells=periods.map(k=>({month:k,current:byMonth.get(k)||0,reference:byMonth.get(base(k))||0}));
  const sum=key=>cells.reduce((v,r)=>v+r[key],0),total=sum('current'),reference=sum('reference'),partial=periods.includes(currentMonth);
  const kpis=$('a17ServiceKpis');for(const [label,value] of [[t('serviceQuantity'),number(total)],[t('reference'),number(reference)],[t('serviceGrowthPct'),partial||reference===0?t('serviceUnavailable'):((total-reference)/reference*100).toFixed(1)+'%']]){const el=text('div','a17-kpi','');el.append(text('span','',label),text('strong','',value));kpis.append(el);}
  const trend=$('a17ServiceTrend');if(cells.length){const max=Math.max(1,...cells.map(r=>Math.max(r.current,r.reference)));for(const r of cells){bar(trend,r.month,r.current,max,number(r.current)+' / '+number(r.reference));row($('a17ServiceTrendBody'),[r.month,number(r.current),number(r.reference),number(r.current-r.reference)]);}row($('a17ServiceTrendFoot'),[t('totalRow'),number(total),number(reference),number(total-reference)]);}else trend.textContent=t('noData');
  const selectedPeriods=new Set(periods),referencePeriods=new Set(periods.map(base));
  const currentRows=records.filter(r=>selectedPeriods.has(r.month)),referenceRows=records.filter(r=>referencePeriods.has(r.month));
  const c=sums(currentRows,r=>r.service),b=sums(referenceRows,r=>r.service),ids=[...new Set([...c.keys(),...b.keys()])];
  const order=ids.map(id=>({id,label:types.get(id)||id,current:c.get(id)||0,reference:b.get(id)||0})).sort((x,y)=>y.current-x.current||x.label.localeCompare(y.label));
  const growth=$('a17ServiceGrowth'),growthBody=$('a17ServiceGrowthBody');const growthOrder=[...order].sort((x,y)=>{const score=z=>!partial&&z.reference>0?(z.current-z.reference)/z.reference:-Infinity;return score(y)-score(x)||x.label.localeCompare(y.label);});
  const maxQty=Math.max(1,...growthOrder.map(x=>x.current));for(const r of growthOrder){const pct=partial||r.reference===0?t('serviceUnavailable'):((r.current-r.reference)/r.reference*100).toFixed(1)+'%';bar(growth,r.label,r.current,maxQty,pct);row(growthBody,[r.label,number(r.current),number(r.reference),pct]);}if(!growthOrder.length)growth.textContent=t('noData');
  const share=$('a17ServiceShare'),shareBody=$('a17ServiceShareBody');const totalQty=[...c.values()].reduce((a,v)=>a+v,0),shareMax=Math.max(1,...order.map(x=>x.current));for(const r of order.filter(x=>x.current>0)){const pct=totalQty?((r.current/totalQty)*100).toFixed(2)+'%':t('serviceUnavailable');bar(share,r.label,r.current,shareMax,pct);row(shareBody,[r.label,number(r.current),pct]);}if(!totalQty)share.textContent=t('noData');else row($('a17ServiceShareFoot'),[t('totalRow'),number(totalQty),'100.00%']);
  if(partial)status('servicePartial');else status('serviceLoaded');
 }
 function toggle(name){const details=$('a17Service'+name+'Details'),button=$('a17Service'+name+'Toggle');if(!details||!button)return;details.hidden=!details.hidden;button.setAttribute('aria-expanded',String(!details.hidden));button.textContent=t(details.hidden?'showDetails':'hideDetails');}
 document.addEventListener('DOMContentLoaded',()=>{status('serviceNotLoaded');$('a17ServiceLoad')?.addEventListener('click',load);$('a17ServiceSelect')?.addEventListener('change',render);$('a17Apply')?.addEventListener('click',render);$('a17Compare')?.addEventListener('change',render);for(const x of ['Trend','Growth','Share'])$('a17Service'+x+'Toggle')?.addEventListener('click',()=>toggle(x));});
 document.addEventListener('petatoe:language-changed',()=>{if(ready){populate();render();}else status(allowed()?'serviceNotLoaded':'serviceBlocked');});
 window.AdvancedAnalyticsServicesUI=Object.freeze({load,render});
})();

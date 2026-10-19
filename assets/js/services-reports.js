(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const t = (key, vars={}) => window.PetatoeLocalization?.t?.(`servicesReports.${key}`,vars) || key;
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => `${(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} SAR`;
  const number = n => Number(n).toLocaleString('en-US',{maximumFractionDigits:3});
  const cents = n => {const v=Number(n);if(!Number.isFinite(v)||!Number.isSafeInteger(Math.round(v*100)))throw Error('INVALID_MONEY');return Math.round(v*100);};
  const allowed = () => window.PermissionEngine?.canView?.('servicesReports')===true && window.PermissionEngine?.canView?.('salesReports')===true;
  const PAGE=500, MAX=200;
  let rows=[], catalogue=new Map(), ready=false, busy=false, shown=10;
  const status = msg => {if($('a16Status'))$('a16Status').textContent=msg;};
  const empty = () => {for(const id of ['a16Kpis','a16ClassificationBody','a16ClassificationTotal','a16ServicesBody','a16ServicesTotal','a16MonthsBody','a16MonthsTotal'])$(id)?.replaceChildren();if($('a16ServicesMore'))$('a16ServicesMore').hidden=true;};
  async function all(query,name){let result=[],seen=new Set(),completed=false;for(let i=0;i<MAX;i++){const {data,error}=await query.range(i*PAGE,(i+1)*PAGE-1);if(error)throw error;if(!Array.isArray(data))throw Error(`${name}: INVALID_DATA`);for(const r of data){if(!r.id||seen.has(r.id))throw Error(`${name}: DUPLICATE_ID`);seen.add(r.id);result.push(r);}if(data.length<PAGE){completed=true;break;}}if(!completed)throw Error(`${name}: INCOMPLETE_PAGINATION`);return result;}
  async function load(){if(busy)return;if(!allowed()){ready=false;empty();status(t('noAccess'));return;}busy=true;ready=false;empty();status(t('loading'));$('a16Refresh').disabled=true;
    try{
      if(!window.customerSupabase?.rpc || navigator.onLine===false)throw Error('OFFLINE');
      const rpc=[],seen=new Set();let complete=false;
      for(let i=0;i<MAX;i++){
        const {data,error}=await window.customerSupabase.rpc('sales_reports_rows_r44r38r20r35').range(i*PAGE,(i+1)*PAGE-1);
        if(error)throw error;if(!Array.isArray(data))throw Error('INVALID_RPC');
        for(const r of data){const key=`${r.is_historical?'h':'c'}:${r.row_id}`;if(!r.row_id||seen.has(key))throw Error('DUPLICATE_RPC');seen.add(key);rpc.push(r);}
        if(data.length<PAGE){complete=true;break;}
      }
      if(!complete||!rpc.length)throw Error('INCOMPLETE_RPC');
      // Direct reads may be RLS-restricted; never silently display partial classification.
      const historical=await all(window.customerSupabase.from('appointment_historical_sales_reporting').select('id,service_type_id,quantity,sales_inclusive,record_type,item_is_unspecified'), 'HISTORICAL');
      const byId=new Map(historical.map(r=>[r.id,r]));
      const historicalRPC=rpc.filter(r=>r.is_historical);
      if(historical.length!==historicalRPC.length||historicalRPC.some(r=>!byId.has(r.row_id)))throw Error('HISTORICAL_SCOPE_MISMATCH');
      const types=await all(window.customerSupabase.from('installation_service_types').select('id,name,service_code'), 'CATALOG');
      const map=new Map(types.map(x=>[x.id,x.name||x.service_code||x.id]));
      const built=[];
      for(const r of rpc){const id=r.row_id, historicalRecord=!!r.is_historical, source=historicalRecord?byId.get(id):null;const a=cents(r.amount_incl_tax);
        if(historicalRecord&&cents(source.sales_inclusive)!==a)throw Error('HISTORICAL_AMOUNT_MISMATCH');
        const classified=historicalRecord&&r.record_type!=='cash_aggregate'&&!!source.service_type_id;
        if(classified&&!map.has(source.service_type_id))throw Error('UNKNOWN_SERVICE_REFERENCE');
        const category=classified?'historicalClassified':!historicalRecord?'current':r.record_type==='cash_aggregate'?'cash':'historicalUnspecified';
        const date=String(r.invoice_date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`)))throw Error('INVALID_DATE');
        built.push({id,category,serviceId:classified?source.service_type_id:'',date,amount:a,qty:classified?Number(source.quantity||0):0});
      }
      rows=built;catalogue=map;ready=true;populate();render();status(t('loaded',{count:number(rows.length)}));
    }catch(e){console.error('A16 reporting',e);ready=false;rows=[];empty();status(t('failed',{reason:e.message}));}
    finally{busy=false;$('a16Refresh').disabled=false;}
  }
  function select(id,values,allLabel){const el=$(id),old=el.value;el.replaceChildren();for(const [value,name] of [['',allLabel],...values]){const opt=document.createElement('option');opt.value=value;opt.textContent=name;el.appendChild(opt);}if([...el.options].some(o=>o.value===old))el.value=old;}
  function populate(){select('a16Year',[...new Set(rows.map(x=>x.date.slice(0,4)))].sort().reverse().map(v=>[v,v]),t('allYears'));
    select('a16Month',Array.from({length:12},(_,i)=>[String(i+1).padStart(2,'0'),new Intl.DateTimeFormat(window.PetatoeLocalization?.effectiveLanguage?.()==='en'?'en-US':'ar-EG',{month:'long'}).format(new Date(2026,i,1))]),t('allMonths'));
    select('a16Service',[...new Set(rows.filter(x=>x.serviceId).map(x=>x.serviceId))].sort((a,b)=>String(catalogue.get(a)).localeCompare(String(catalogue.get(b)))).map(id=>[id,catalogue.get(id)]),t('allServices'));
  }
  function subset(){const y=$('a16Year').value,m=$('a16Month').value,s=$('a16Service').value;return rows.filter(r=>(!y||r.date.startsWith(y))&&(!m||r.date.slice(5,7)===m)&&(!s||r.serviceId===s));}
  const sum=arr=>arr.reduce((n,r)=>n+r.amount,0);
  function draw(id,data,cols){$(id).innerHTML=data.length?data.map(x=>`<tr>${x.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${cols}">${esc(t('none'))}</td></tr>`;}
  function render(){if(!ready||!allowed()){empty();return;}const data=subset(),total=sum(data),classified=data.filter(r=>r.category==='historicalClassified'),known=sum(classified),unknown=total-known;
    const groups=['historicalClassified','historicalUnspecified','cash','current'].map(key=>({key,rs:data.filter(x=>x.category===key)}));
    if(groups.reduce((n,g)=>n+sum(g.rs),0)!==total||known+unknown!==total){empty();status(t('incomplete'));return;}
    $('a16Kpis').innerHTML=[['totalKpi',money(total)],['classifiedKpi',money(known)],['unknownKpi',money(unknown)],['coverageKpi',total?`${(known/total*100).toFixed(2)}%`:'—']].map(([k,v])=>`<div class="a16-kpi"><span>${esc(t(k))}</span><strong>${esc(v)}</strong></div>`).join('');
    draw('a16ClassificationBody',groups.map(g=>[t(g.key),number(g.rs.length),money(sum(g.rs))]),3);draw('a16ClassificationTotal',[[t('total'),number(data.length),money(total)]],3);
    const byService=new Map();for(const r of classified){if(!byService.has(r.serviceId))byService.set(r.serviceId,{count:0,qty:0,cents:0});const g=byService.get(r.serviceId);g.count++;g.qty+=r.qty;g.cents+=r.amount;}
    const list=[...byService].map(([id,g])=>[catalogue.get(id),number(g.count),number(g.qty),money(g.cents),g.cents]).sort((a,b)=>b[4]-a[4]);
    draw('a16ServicesBody',list.slice(0,shown).map(g=>g.slice(0,4)),4);draw('a16ServicesTotal',[[t('total'),number(classified.length),number(classified.reduce((n,r)=>n+r.qty,0)),money(known)]],4);$('a16ServicesMore').hidden=list.length<=shown;
    const byMonth=new Map();for(const r of data){const key=r.date.slice(0,7);if(!byMonth.has(key))byMonth.set(key,{total:0,known:0});const m=byMonth.get(key);m.total+=r.amount;if(r.category==='historicalClassified')m.known+=r.amount;}
    draw('a16MonthsBody',[...byMonth].sort(([a],[b])=>a.localeCompare(b)).map(([month,g])=>[month,money(g.known),money(g.total-g.known),money(g.total)]),4);
    draw('a16MonthsTotal',[[t('total'),money(known),money(unknown),money(total)]],4);
  }
  function activate(){if(!allowed()){empty();status(t('noAccess'));return;}if(!ready&&!busy)load();else render();}
  document.addEventListener('DOMContentLoaded',()=>{$('a16Refresh')?.addEventListener('click',load);$('a16Apply')?.addEventListener('click',()=>{shown=10;render();});$('a16Reset')?.addEventListener('click',()=>{for(const id of ['a16Year','a16Month','a16Service'])$(id).value='';shown=10;render();});$('a16ServicesMore')?.addEventListener('click',()=>{shown+=10;render();});});
  window.addEventListener('petatoe-language-changed',()=>{if(ready){populate();render();}});
  window.ServicesReportsUI=Object.freeze({activate,render});
})();

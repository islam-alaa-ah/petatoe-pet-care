/* A17.2.3 — operational analytics read-only consumer of the approved A15 service. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const t=k=>window.PetatoeLocalization?.t?.('advancedAnalytics.'+k)||k;
 const permitted=()=>window.PermissionEngine?.canView?.('advancedAnalytics')===true&&window.PermissionEngine?.canView?.('salesReports')===true&&window.PermissionEngine?.canView?.('installationReports')===true;
 const asText=v=>String(v??'');
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=asText(text);return n;};
 const fmt=n=>Number(n).toLocaleString('en-US');
 const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const iso=d=>[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0')].join('-');
 const advance=(s,offset)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return iso(d);};
 const endOfMonth=(year,month)=>iso(new Date(Date.UTC(year,month,0)));
 let data=null,busy=false,limit=10,undatedCount=0;
 function status(key){if($('a17OpsStatus'))$('a17OpsStatus').textContent=t(key);}
 function clear(){for(const id of ['a17OpsPeriods','a17OpsKpis','a17OpsCurrentChart','a17OpsReferenceChart','a17OpsBody','a17OpsFoot','a17IntelCompareChart','a17IntelCompareBody','a17IntelCompareFoot','a17IntelShareChart','a17IntelShareBody','a17IntelShareFoot','a17IntelMonthlyChart','a17IntelMonthlyBody','a17IntelMonthlyFoot'])$(id)?.replaceChildren();if($('a17OpsMore'))$('a17OpsMore').hidden=true;}
 function dates(){const year=Number($('a17Year')?.value),monthStr=$('a17Month')?.value||'',mode=$('a17Compare')?.value||'previous';if(!Number.isInteger(year)||year<2000||year>2100)return null;const month=monthStr?Number(monthStr):0;if(month&&(month<1||month>12))return null;
  const start=month?`${year}-${String(month).padStart(2,'0')}-01`:`${year}-01-01`,scheduledEnd=month?endOfMonth(year,month):`${year}-12-31`;
  // Local calendar date (same semantics as A17 filters). Never include future dates.
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  if(start>today)return null;const currentMonthEnd=endOfMonth(Number(today.slice(0,4)),Number(today.slice(5,7)));
  const end=scheduledEnd>currentMonthEnd?currentMonthEnd:scheduledEnd;
  const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
  let baseStart,baseEnd;
  if(mode==='yoy'){
    const refYear=year-1;
    baseStart=month?`${refYear}-${String(month).padStart(2,'0')}-01`:`${refYear}-01-01`;
    baseEnd=advance(baseStart,days-1);
  }else{baseEnd=advance(start,-1);baseStart=advance(baseEnd,-days+1);}
  return {start,end,baseStart,baseEnd,partial:today<scheduledEnd};
 }
 const validIdentity=r=>r&&typeof r==='object'&&asText(r.id).trim().length>0;
 const scheduledDate=r=>asText(r?.scheduledDate).slice(0,10);
 const hasScheduledDate=r=>dateOk(scheduledDate(r));
 async function load(){if(busy)return;if(!permitted()){data=null;clear();status('opsDenied');return;}if(navigator.onLine===false||typeof window.InstallationsServiceSafe?.operationalReport!=='function'){data=null;clear();status('opsFailed');return;}
  busy=true;data=null;undatedCount=0;clear();status('opsLoading');$('a17OpsLoad').disabled=true;
  try{const answer=await window.InstallationsServiceSafe.operationalReport({});if(!answer||!Array.isArray(answer.rows))throw Error('INVALID_RESULT');const ids=new Set();let withoutDate=0;for(const r of answer.rows){if(!validIdentity(r)||ids.has(asText(r.id)))throw Error('INVALID_OR_DUPLICATE_REQUEST');ids.add(asText(r.id));const date=scheduledDate(r);if(date&&!hasScheduledDate(r))throw Error('INVALID_SCHEDULED_DATE');if(!date)withoutDate++;}
   if(!permitted())throw Error('PERMISSION_CHANGED');undatedCount=withoutDate;data=answer.rows;limit=10;render();
  }catch(e){console.warn('A17.2.3 operational analytics:',e);data=null;undatedCount=0;clear();status('opsFailed');}
  finally{busy=false;$('a17OpsLoad').disabled=false;}
 }
 function rowsFor(a,b){return data.filter(r=>{const d=scheduledDate(r);return hasScheduledDate(r)&&d>=a&&d<=b;});}
 function aggregate(rows,dimension){const map=new Map();for(const r of rows){const id=asText(r[dimension==='car'?'teamCarId':'teamId'])||'__unassigned';const label=asText(r[dimension==='car'?'teamCarName':'teamName']).trim()||t('opsOther');let v=map.get(id);if(!v){v={id,label,total:0,completed:0,assigned:0,cancelled:0};map.set(id,v);}v.total++;const canceled=['ملغي','ملغاة'].includes(asText(r.status).trim());if(canceled)v.cancelled++;else if(r.status==='مكتمل'||r.isInvoiced===true)v.completed++;else if(asText(r.status).trim()==='مسند')v.assigned++;}return map;}
 function sum(rows){let completed=0,assigned=0,cancelled=0;for(const r of rows){if(['ملغي','ملغاة'].includes(asText(r.status).trim()))cancelled++;else if(r.status==='مكتمل'||r.isInvoiced===true)completed++;else if(asText(r.status).trim()==='مسند')assigned++;}return {total:rows.length,completed,assigned,cancelled};}
 function bar(target,values){const parent=$(target);parent.replaceChildren();if(!values.length){parent.append(el('p',t('opsNoData')));return;}const max=Math.max(1,...values.map(v=>v.total));for(const item of values.slice(0,20)){const line=el('div',undefined,'a17-bar-row'),label=el('span',item.label),track=el('div',undefined,'a17-bar-track'),fill=el('div',undefined,'a17-bar-fill'),number=el('strong',fmt(item.total),'a17-bar-number');fill.style.width=(item.total/max*100).toFixed(2)+'%';track.append(fill);line.append(label,track,number);parent.append(line);}}
 function periodBox(parent,key,start,end){const box=el('div',undefined,'a17-period-card');box.append(el('span',t(key)),el('strong',`${start} → ${end}`,'a17-period-dates'));parent.append(box);}

 // A17.3.4: Operational intelligence built only from the already-permitted A15 request rows.
 // These are request-level indicators, never visit-level throughput or revenue.
 function intelPanel(id,title,description,columns){
  const article=el('article',undefined,'a17-panel a17-report-panel a17-intel-panel');article.id=id;
  const header=el('div',undefined,'a17-panel-title');header.append(el('h4',title),el('span',description));article.append(header);
  const chart=el('div',undefined,'a17-bar-chart a17-intel-chart');chart.id=id+'Chart';article.append(chart);
  const toggle=el('button',t('showDetails'));toggle.type='button';toggle.setAttribute('aria-expanded','false');
  const detail=el('div');detail.id=id+'Details';detail.hidden=true;
  const scroll=el('div',undefined,'a17-table-scroll');const table=el('table');const thead=el('thead'),tr=el('tr');
  for(const heading of columns)tr.append(el('th',heading));thead.append(tr);
  const body=el('tbody');body.id=id+'Body';const foot=el('tfoot');foot.id=id+'Foot';table.append(thead,body,foot);scroll.append(table);detail.append(scroll);article.append(toggle,detail);
  toggle.addEventListener('click',()=>{detail.hidden=!detail.hidden;toggle.setAttribute('aria-expanded',String(!detail.hidden));toggle.textContent=t(detail.hidden?'showDetails':'hideDetails');});
  return article;
 }
 function installIntel(){const anchor=$('a17OperationsPanel');if(!anchor||$('a17IntelCompare'))return;
  const panels=[
   intelPanel('a17IntelCompare',t('intelCompareTitle'),t('intelCompareHelp'),[t('opsName'),t('opsTotal'),t('opsCompleted'),t('opsAssigned'),t('opsCancelled'),t('opsRate')]),
   intelPanel('a17IntelShare',t('intelShareTitle'),t('intelShareHelp'),[t('opsName'),t('opsTotal'),t('intelSharePercent')]),
   intelPanel('a17IntelMonthly',t('intelMonthlyTitle'),t('intelMonthlyHelp'),[t('period'),t('opsTotal'),t('opsCompleted'),t('opsAssigned'),t('opsCancelled'),t('opsRate')])
  ];let previous=anchor;for(const panel of panels){previous.after(panel);previous=panel;}
 }
 function tableRow(target,columns,footer=false){const tr=el('tr');if(footer)tr.className='a17-intel-total';for(const content of columns)tr.append(el('td',content));$(target)?.append(tr);}
 function intelBars(target,items,max,renderValue){const root=$(target);if(!root)return;
  if(!items.length){root.append(el('p',t('opsNoData')));return;}
  for(const item of items){const line=el('div',undefined,'a17-bar-row'),name=el('span',item.label),track=el('div',undefined,'a17-bar-track'),fill=el('div',undefined,'a17-bar-fill'),count=el('strong',renderValue(item),'a17-bar-number');
   fill.style.width=(max>0?Math.max(0,item.total/max*100):0).toFixed(2)+'%';track.append(fill);line.append(name,track,count);root.append(line);}
 }
 function renderIntel(currentRows,dimension,p){installIntel();const current=aggregate(currentRows,dimension);
  const groups=[...current.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label));const totals=sum(currentRows);
  // Completion comparison: each request counted once in its own car/team bucket.
  intelBars('a17IntelCompareChart',groups.slice(0,15),Math.max(1,...groups.map(g=>g.total)),g=>fmt(g.completed)+' / '+fmt(g.total));
  for(const g of groups)tableRow('a17IntelCompareBody',[g.label,fmt(g.total),fmt(g.completed),fmt(g.assigned),fmt(g.cancelled),g.total?(100*g.completed/g.total).toFixed(1)+'%':'—']);
  tableRow('a17IntelCompareFoot',[t('totalRow'),fmt(totals.total),fmt(totals.completed),fmt(totals.assigned),fmt(totals.cancelled),totals.total?(100*totals.completed/totals.total).toFixed(1)+'%':'—'],true);
  // Workload share: 100% means share of all eligible request rows; no capacity assumptions.
  intelBars('a17IntelShareChart',groups.slice(0,15),Math.max(1,...groups.map(g=>g.total)),g=>totals.total?(100*g.total/totals.total).toFixed(1)+'%':'—');
  for(const g of groups)tableRow('a17IntelShareBody',[g.label,fmt(g.total),totals.total?(100*g.total/totals.total).toFixed(2)+'%':'—']);
  tableRow('a17IntelShareFoot',[t('totalRow'),fmt(totals.total),totals.total?'100%':'—'],true);
  // Monthly trend is scoped to current selected period; never infer missing months as missing data.
  const monthMap=new Map();for(const r of currentRows){const key=scheduledDate(r).slice(0,7);let a=monthMap.get(key);if(!a){a={label:key,total:0,completed:0,assigned:0,cancelled:0};monthMap.set(key,a);}a.total++;const canceled=['ملغي','ملغاة'].includes(asText(r.status).trim());if(canceled)a.cancelled++;else if(r.status==='مكتمل'||r.isInvoiced===true)a.completed++;else if(asText(r.status).trim()==='مسند')a.assigned++;}
  const months=[...monthMap.values()].sort((a,b)=>a.label.localeCompare(b.label));
  intelBars('a17IntelMonthlyChart',months,Math.max(1,...months.map(m=>m.total)),g=>fmt(g.total));
  for(const m of months)tableRow('a17IntelMonthlyBody',[m.label,fmt(m.total),fmt(m.completed),fmt(m.assigned),fmt(m.cancelled),m.total?(100*m.completed/m.total).toFixed(1)+'%':'—']);
  tableRow('a17IntelMonthlyFoot',[t('totalRow'),fmt(totals.total),fmt(totals.completed),fmt(totals.assigned),fmt(totals.cancelled),totals.total?(100*totals.completed/totals.total).toFixed(1)+'%':'—'],true);
 }

 function ensureAssignedHeader(){const header=$('a17OpsBody')?.closest('table')?.querySelector('thead tr');if(!header||header.querySelector('[data-a17-assigned]'))return;const th=el('th',t('opsAssigned'));th.dataset.a17Assigned='true';header.insertBefore(th,header.children[3]||null);}
 function render(){if(!data||!permitted()){clear();if(data)status('opsDenied');return;}const p=dates();clear();ensureAssignedHeader();if(!p){status('opsNoData');return;}
  const currentRows=rowsFor(p.start,p.end),referenceRows=rowsFor(p.baseStart,p.baseEnd),dimension=$('a17OpsGroup')?.value==='team'?'team':'car';
  const c=sum(currentRows),r=sum(referenceRows),cg=aggregate(currentRows,dimension),rg=aggregate(referenceRows,dimension);
  periodBox($('a17OpsPeriods'),'opsCurrentPeriod',p.start,p.end);periodBox($('a17OpsPeriods'),'opsBasePeriod',p.baseStart,p.baseEnd);
  for(const [key,value] of [['opsCurrent',fmt(c.total)],['opsReference',fmt(r.total)],['opsNet',p.partial?t('opsUnavailable'):fmt(c.total-r.total)],['opsCompleted',fmt(c.completed)],['opsAssigned',fmt(c.assigned)],['opsCancelled',fmt(c.cancelled)],['opsRate',c.total?(c.completed/c.total*100).toFixed(1)+'%':t('opsUnavailable')],['opsUndated',fmt(undatedCount)]]){const box=el('div',undefined,'a17-kpi');box.append(el('span',t(key)),el('strong',value));$('a17OpsKpis').append(box);}
  const sorted=[...cg.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label));const refSorted=[...rg.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label));bar('a17OpsCurrentChart',sorted);bar('a17OpsReferenceChart',refSorted);
  const combined=new Map();for(const v of [...cg.values(),...rg.values()])if(!combined.has(v.id))combined.set(v.id,{id:v.id,label:v.label});
  const all=[...combined.values()].map(x=>({...x,cur:cg.get(x.id)||{total:0,completed:0,assigned:0,cancelled:0},ref:rg.get(x.id)||{total:0}})).sort((a,b)=>b.cur.total-a.cur.total||b.ref.total-a.ref.total||a.label.localeCompare(b.label));
  for(const v of all.slice(0,limit)){const row=el('tr');for(const cell of [v.label,fmt(v.cur.total),fmt(v.cur.completed),fmt(v.cur.assigned),fmt(v.cur.cancelled),v.cur.total?(100*v.cur.completed/v.cur.total).toFixed(1)+'%':'—',fmt(v.ref.total)])row.append(el('td',cell));$('a17OpsBody').append(row);}
  const total=el('tr');for(const cell of [t('totalRow'),fmt(c.total),fmt(c.completed),fmt(c.assigned),fmt(c.cancelled),c.total?(c.completed/c.total*100).toFixed(1)+'%':'—',fmt(r.total)])total.append(el('td',cell));$('a17OpsFoot').append(total);$('a17OpsMore').hidden=limit>=all.length;
  renderIntel(currentRows,dimension,p);
  status(p.partial?'opsPartial':'opsLoaded');
 }
 document.addEventListener('DOMContentLoaded',()=>{installIntel();
  $('a17OpsLoad')?.addEventListener('click',load);$('a17OpsGroup')?.addEventListener('change',()=>{limit=10;render();});$('a17Apply')?.addEventListener('click',()=>{limit=10;render();});$('a17Compare')?.addEventListener('change',()=>{limit=10;render();});$('a17OpsMore')?.addEventListener('click',()=>{limit+=10;render();});$('a17OpsToggle')?.addEventListener('click',()=>{const panel=$('a17OpsDetails'),button=$('a17OpsToggle');panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));button.textContent=t(panel.hidden?'showDetails':'hideDetails');});
 });
 // Re-label the already-created intelligence panels on every language switch.
 // Their headings and table headers are created with textContent at first mount,
 // so the central DOM dictionary scan cannot translate them automatically.
 function relabelIntelligencePanels(){
  const definitions=[
   ['a17IntelCompare','intelCompareTitle','intelCompareHelp',['opsName','opsTotal','opsCompleted','opsAssigned','opsCancelled','opsRate']],
   ['a17IntelShare','intelShareTitle','intelShareHelp',['opsName','opsTotal','intelSharePercent']],
   ['a17IntelMonthly','intelMonthlyTitle','intelMonthlyHelp',['period','opsTotal','opsCompleted','opsAssigned','opsCancelled','opsRate']]
  ];
  for(const [id,title,help,headings] of definitions){
   const panel=$(id);if(!panel)continue;
   const h=panel.querySelector('.a17-panel-title h4'),description=panel.querySelector('.a17-panel-title span');
   if(h)h.textContent=t(title);
   if(description)description.textContent=t(help);
   panel.querySelectorAll('thead th').forEach((th,index)=>{if(headings[index])th.textContent=t(headings[index]);});
   const details=panel.querySelector('#'+id+'Details'),toggle=panel.querySelector('button');
   if(toggle&&details)toggle.textContent=t(details.hidden?'showDetails':'hideDetails');
  }
 }
 window.addEventListener('petatoe-language-changed',()=>{render();relabelIntelligencePanels();const assigned=$('a17OpsBody')?.closest('table')?.querySelector('[data-a17-assigned]');if(assigned)assigned.textContent=t('opsAssigned');const pane=$('a17OpsDetails'),button=$('a17OpsToggle');if(button&&pane)button.textContent=t(pane.hidden?'showDetails':'hideDetails');});
 window.AdvancedAnalyticsOperationsUI={render,load};
})();

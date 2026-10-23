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
 function clear(){for(const id of ['a17OpsPeriods','a17OpsKpis','a17OpsCurrentChart','a17OpsReferenceChart','a17OpsBody','a17OpsFoot'])$(id)?.replaceChildren();if($('a17OpsMore'))$('a17OpsMore').hidden=true;}
 function dates(){const year=Number($('a17Year')?.value),monthStr=$('a17Month')?.value||'',mode=$('a17Compare')?.value||'previous';if(!Number.isInteger(year)||year<2000||year>2100)return null;const month=monthStr?Number(monthStr):0;if(month&&(month<1||month>12))return null;
  const start=month?`${year}-${String(month).padStart(2,'0')}-01`:`${year}-01-01`,scheduledEnd=month?endOfMonth(year,month):`${year}-12-31`;
  // Local calendar date (same semantics as A17 filters). Never include future dates.
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  if(start>today)return null;const end=scheduledEnd>today?today:scheduledEnd;
  const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
  let baseStart,baseEnd;
  if(mode==='yoy'){
    const refYear=year-1;
    baseStart=month?`${refYear}-${String(month).padStart(2,'0')}-01`:`${refYear}-01-01`;
    baseEnd=advance(baseStart,days-1);
  }else{baseEnd=advance(start,-1);baseStart=advance(baseEnd,-days+1);}
  return {start,end,baseStart,baseEnd,partial:end!==scheduledEnd};
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
 function aggregate(rows,dimension){const map=new Map();for(const r of rows){const id=asText(r[dimension==='car'?'teamCarId':'teamId'])||'__unassigned';const label=asText(r[dimension==='car'?'teamCarName':'teamName']).trim()||t('opsOther');let v=map.get(id);if(!v){v={id,label,total:0,completed:0,cancelled:0};map.set(id,v);}v.total++;const canceled=['ملغي','ملغاة'].includes(asText(r.status).trim());if(canceled)v.cancelled++;else if(r.status==='مكتمل'||r.isInvoiced===true)v.completed++;}return map;}
 function sum(rows){let completed=0,cancelled=0;for(const r of rows){if(['ملغي','ملغاة'].includes(asText(r.status).trim()))cancelled++;else if(r.status==='مكتمل'||r.isInvoiced===true)completed++;}return {total:rows.length,completed,cancelled};}
 function bar(target,values){const parent=$(target);parent.replaceChildren();if(!values.length){parent.append(el('p',t('opsNoData')));return;}const max=Math.max(1,...values.map(v=>v.total));for(const item of values.slice(0,20)){const line=el('div',undefined,'a17-bar-row'),label=el('span',item.label),track=el('div',undefined,'a17-bar-track'),fill=el('div',undefined,'a17-bar-fill'),number=el('strong',fmt(item.total),'a17-bar-number');fill.style.width=(item.total/max*100).toFixed(2)+'%';track.append(fill);line.append(label,track,number);parent.append(line);}}
 function periodBox(parent,key,start,end){const box=el('div',undefined,'a17-period-card');box.append(el('span',t(key)),el('strong',`${start} → ${end}`,'a17-period-dates'));parent.append(box);}
 function render(){if(!data||!permitted()){clear();if(data)status('opsDenied');return;}const p=dates();clear();if(!p){status('opsNoData');return;}
  const currentRows=rowsFor(p.start,p.end),referenceRows=rowsFor(p.baseStart,p.baseEnd),dimension=$('a17OpsGroup')?.value==='team'?'team':'car';
  const c=sum(currentRows),r=sum(referenceRows),cg=aggregate(currentRows,dimension),rg=aggregate(referenceRows,dimension);
  periodBox($('a17OpsPeriods'),'opsCurrentPeriod',p.start,p.end);periodBox($('a17OpsPeriods'),'opsBasePeriod',p.baseStart,p.baseEnd);
  for(const [key,value] of [['opsCurrent',fmt(c.total)],['opsReference',fmt(r.total)],['opsNet',p.partial?t('opsUnavailable'):fmt(c.total-r.total)],['opsCompleted',fmt(c.completed)],['opsCancelled',fmt(c.cancelled)],['opsRate',c.total?(c.completed/c.total*100).toFixed(1)+'%':t('opsUnavailable')],['opsUndated',fmt(undatedCount)]]){const box=el('div',undefined,'a17-kpi');box.append(el('span',t(key)),el('strong',value));$('a17OpsKpis').append(box);}
  const sorted=[...cg.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label));const refSorted=[...rg.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label));bar('a17OpsCurrentChart',sorted);bar('a17OpsReferenceChart',refSorted);
  const combined=new Map();for(const v of [...cg.values(),...rg.values()])if(!combined.has(v.id))combined.set(v.id,{id:v.id,label:v.label});
  const all=[...combined.values()].map(x=>({...x,cur:cg.get(x.id)||{total:0,completed:0,cancelled:0},ref:rg.get(x.id)||{total:0}})).sort((a,b)=>b.cur.total-a.cur.total||b.ref.total-a.ref.total||a.label.localeCompare(b.label));
  for(const v of all.slice(0,limit)){const row=el('tr');for(const cell of [v.label,fmt(v.cur.total),fmt(v.cur.completed),fmt(v.cur.cancelled),v.cur.total?(100*v.cur.completed/v.cur.total).toFixed(1)+'%':'—',fmt(v.ref.total)])row.append(el('td',cell));$('a17OpsBody').append(row);}
  const total=el('tr');for(const cell of [t('totalRow'),fmt(c.total),fmt(c.completed),fmt(c.cancelled),c.total?(c.completed/c.total*100).toFixed(1)+'%':'—',fmt(r.total)])total.append(el('td',cell));$('a17OpsFoot').append(total);$('a17OpsMore').hidden=limit>=all.length;
  status(p.partial?'opsPartial':'opsLoaded');
 }
 document.addEventListener('DOMContentLoaded',()=>{
  $('a17OpsLoad')?.addEventListener('click',load);$('a17OpsGroup')?.addEventListener('change',()=>{limit=10;render();});$('a17Apply')?.addEventListener('click',()=>{limit=10;render();});$('a17Compare')?.addEventListener('change',()=>{limit=10;render();});$('a17OpsMore')?.addEventListener('click',()=>{limit+=10;render();});$('a17OpsToggle')?.addEventListener('click',()=>{const panel=$('a17OpsDetails'),button=$('a17OpsToggle');panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));button.textContent=t(panel.hidden?'showDetails':'hideDetails');});
 });
 document.addEventListener('petatoe:language-changed',()=>{render();const pane=$('a17OpsDetails'),button=$('a17OpsToggle');if(button&&pane)button.textContent=t(pane.hidden?'showDetails':'hideDetails');});
 window.AdvancedAnalyticsOperationsUI={render,load};
})();

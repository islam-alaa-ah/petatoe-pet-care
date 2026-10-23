/* A17.3.5 Peak periods: read-only scheduled start times for authorized A15 requests. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const t=k=>window.PetatoeLocalization?.t?.('advancedAnalytics.'+k)||k;
const permitted=()=>window.PermissionEngine?.canView?.('advancedAnalytics')===true&&window.PermissionEngine?.canView?.('salesReports')===true&&window.PermissionEngine?.canView?.('installationReports')===true;
const text=(tag,v,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(v!==undefined)e.textContent=String(v);return e;};
const fmt=n=>Number(n).toLocaleString('en-US');
const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const pad=n=>String(n).padStart(2,'0');
// Approved booking slots, matching installation-scheduling.js / installations-service.js.
const BOOKING_HOURS=Object.freeze([12,14,16,18,20,22]);
const BOOKING_HOURS_SET=new Set(BOOKING_HOURS);
const days=['sun','mon','tue','wed','thu','fri','sat'];
const weekdays={ar:['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']};
const lang=()=>document.documentElement.lang?.toLowerCase().startsWith('en')?'en':'ar';
const startHour=s=>{const m=/^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(String(s??''));if(!m)return null;const h=Number(m[1]),min=Number(m[2]);return h>=0&&h<=23&&min>=0&&min<=59?h:null;};
const onTime=r=>startHour(r.scheduled_time??r.scheduledTime??'');
function range(){let y=Number($('a17Year')?.value),m=Number($('a17Month')?.value||0);if(!Number.isInteger(y)||y<2000||y>2100||!Number.isInteger(m)||m<0||m>12)return null;
 const from=`${y}-${pad(m||1)}-01`,through=m?`${y}-${pad(m)}-${pad(new Date(Date.UTC(y,m,0)).getUTCDate())}`:`${y}-12-31`;
 const now=new Date();const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));const today=`${parts.year}-${parts.month}-${parts.day}`;
 // Current-month scheduled appointments may be assigned for dates after today.
 // Match A17 operations' selected-period scope (through the current month end),
 // rather than silently dropping upcoming bookings from the peak-time denominator.
 if(from>today)return null;
 const currentMonthEnd=`${parts.year}-${parts.month}-${pad(new Date(Date.UTC(Number(parts.year),Number(parts.month),0)).getUTCDate())}`;
 return {from,to:through<currentMonthEnd?through:currentMonthEnd};}
let source=null,entries=null,loading=false;
function reset(){for(const id of ['a17PeakHeatmap','a17PeakKpis','a17PeakPeriod','a17PeakBody','a17PeakFoot'])$(id)?.replaceChildren();}
function status(k){if($('a17PeakStatus'))$('a17PeakStatus').textContent=t(k);}
async function load(){if(loading)return;reset();if(!permitted()){entries=null;status('peakDenied');return;}if(navigator.onLine===false||!window.customerSupabase?.from||typeof window.InstallationsServiceSafe?.operationalReport!=='function'){entries=null;status('peakFailed');return;}
 loading=true;entries=null;status('peakLoading');$('a17PeakLoad').disabled=true;
 try{
  const report=await window.InstallationsServiceSafe.operationalReport({});if(!Array.isArray(report?.rows)||report.rows.length>=1000)throw Error('UNVERIFIED_OPERATIONAL_ROWS_OR_PAGINATION_LIMIT');
  const ids=new Set(),rows=[];for(const row of report.rows){const id=String(row?.id||'');if(!id||ids.has(id))throw Error('INVALID_OR_DUPLICATE_ID');ids.add(id);rows.push({id,scheduledDate:String(row.scheduledDate||'').slice(0,10)});}
  const timeMap=new Map();for(let i=0;i<rows.length;i+=100){const chunk=rows.slice(i,i+100).map(r=>r.id);const {data,error}=await window.customerSupabase.from('installation_requests').select('id,scheduled_time').in('id',chunk);
   if(error||!Array.isArray(data))throw Error('TIME_QUERY_FAILED: '+(error?.message||'invalid response'));
   for(const v of data){const id=String(v.id||'');if(!ids.has(id)||timeMap.has(id))throw Error('INVALID_TIME_ROW');timeMap.set(id,v.scheduled_time);}
   if(chunk.some(id=>!timeMap.has(id)))throw Error('INCOMPLETE_TIME_PAGE');
  }
  if(!permitted())throw Error('PERMISSION_CHANGED');source=rows;entries=rows.map(r=>({...r,hour:onTime({scheduled_time:timeMap.get(r.id)})}));render();
 }catch(e){console.warn('A17.3.5 peak-time analytics:',e);entries=null;reset();status('peakFailed');}
 finally{loading=false;$('a17PeakLoad').disabled=false;}
}
function render(){reset();if(!permitted()){if(entries)status('peakDenied');return;}if(!entries)return;const period=range();if(!period){status('peakNoData');return;}
 $('a17PeakPeriod').textContent=`${t('peakSummary')}: ${period.from} → ${period.to} (Asia/Riyadh)`;
 const matched=entries.filter(r=>dateValid(r.scheduledDate)&&r.scheduledDate>=period.from&&r.scheduledDate<=period.to);
 const counts=Array.from({length:7},()=>Array(24).fill(0));let unknown=0,outside=0,plotted=0;
 for(const r of matched){if(r.hour===null){unknown++;continue;}if(!BOOKING_HOURS_SET.has(r.hour)){outside++;continue;}const day=new Date(r.scheduledDate+'T12:00:00Z').getUTCDay();counts[day][r.hour]++;plotted++;}
 let top=null,max=0;for(let d=0;d<7;d++)for(const h of BOOKING_HOURS)if(counts[d][h]>max){max=counts[d][h];top={d,h,count:max};}
 const topText=top?`${weekdays[lang()][top.d]} ${pad(top.h)}:00 (${fmt(top.count)})`:'—';
 for(const [k,v] of [['peakTotal',plotted],['peakUnknown',unknown],['peakOutsideSlots',outside],['peakTop',topText]]){const box=text('div',undefined,'a17-kpi');box.append(text('span',t(k)),text('strong',typeof v==='number'?fmt(v):v));$('a17PeakKpis').append(box);}
 const grid=$('a17PeakHeatmap');grid.append(text('span','', 'a17-peak-head'));for(const h of BOOKING_HOURS)grid.append(text('span',`${pad(h)}:00`,'a17-peak-head'));
 for(let d=0;d<7;d++){grid.append(text('span',weekdays[lang()][d],'a17-peak-day'));for(const h of BOOKING_HOURS){const n=counts[d][h],level=n===0?0:Math.max(1,Math.ceil(n/Math.max(1,max)*5));const cell=text('div',n||'','a17-peak-cell');cell.dataset.level=String(level);cell.title=`${weekdays[lang()][d]} ${pad(h)}:00–${pad((h+1)%24)}:00 · ${fmt(n)}`;grid.append(cell);}}
 const body=$('a17PeakBody');for(let d=0;d<7;d++)for(const h of BOOKING_HOURS)if(counts[d][h]){const tr=text('tr');for(const val of [weekdays[lang()][d],`${pad(h)}:00 – ${pad((h+1)%24)}:00`,fmt(counts[d][h])])tr.append(text('td',val));body.append(tr);}
 const foot=text('tr');for(const val of [t('peakCountTotal'),'—',fmt(plotted)])foot.append(text('td',val));$('a17PeakFoot').append(foot);status(matched.length?'peakLoaded':'peakNoData');
}
document.addEventListener('DOMContentLoaded',()=>{$('a17PeakLoad')?.addEventListener('click',load);$('a17Apply')?.addEventListener('click',render);$('a17Year')?.addEventListener('change',render);$('a17Month')?.addEventListener('change',render);
 $('a17PeakToggle')?.addEventListener('click',()=>{const details=$('a17PeakDetails'),button=$('a17PeakToggle');details.hidden=!details.hidden;button.setAttribute('aria-expanded',String(!details.hidden));button.textContent=t(details.hidden?'showDetails':'hideDetails');});});
window.addEventListener('petatoe-language-changed',()=>{render();const b=$('a17PeakToggle'),p=$('a17PeakDetails');if(b&&p)b.textContent=t(p.hidden?'showDetails':'hideDetails');});
window.AdvancedAnalyticsPeaksUI={load,render};
})();

/* A17.2.2 — isolated customer analytics: authorized customer scope + full paginated sales snapshot. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const tr=k=>window.PetatoeLocalization?.t?.('advancedAnalytics.'+k)||k;
 const allowed=()=>['salesReports','customerReports'].every(k=>window.PermissionEngine?.canView?.(k)===true);
 const n=x=>Number(x).toLocaleString('en-US');
 const node=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e;};
 let snapshot=null,busy=false,seq=0,selectedBand=null,visible=10,detailRows=[],followupsMap=null,selectedTitleKey=null,selectedToken=null;
 function reset(){snapshot=null;selectedBand=null;detailRows=[],followupsMap=null,selectedTitleKey=null,selectedToken=null;$('a17SegmentPage')?.classList.add('hidden');$('a17CustomerPanel')?.classList.remove('hidden');for(const id of ['a17CustomerMetrics','a17CustomerActivityChart','a17CustomerActivityBody','a17CustomerActivityFoot','a17RetentionChart','a17RetentionBody','a17RetentionPeriods'])$(id)?.replaceChildren();if($('a17RetentionPeriodNote'))$('a17RetentionPeriodNote').textContent='';}
 function status(key){if($('a17CustomerStatus'))$('a17CustomerStatus').textContent=tr(key);}
 const shift=(key,months)=>{const [y,m]=key.split('-').map(Number),d=new Date(Date.UTC(y,m-1+months,1));return d.toISOString().slice(0,7);};
 const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 // Closed date ranges (local business date); never compare whole months with partial months.
 const iso=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
 const utc=(y,m,d)=>new Date(Date.UTC(y,m-1,d));
 const addDays=(d,n)=>new Date(d.getTime()+n*86400000);
 const daysBetween=(a,b)=>Math.round((b-a)/86400000)+1;
 const yearAgo=d=>utc(d.getUTCFullYear()-1,d.getUTCMonth()+1,Math.min(d.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear()-1,d.getUTCMonth()+1,0)).getUTCDate()));
 function ranges(year,month,mode){
   const y=Number(year),m=month?Number(month):1,now=new Date(),today=utc(now.getFullYear(),now.getMonth()+1,now.getDate());
   const start=utc(y,m,1),finish=month?utc(y,m+1,0):utc(y+1,1,0);
   if(start>today)return null;
   const end=finish>today?today:finish,open=end<finish;
   let baseStart,baseEnd;
   if(mode==='yoy'){
     baseStart=yearAgo(start);baseEnd=yearAgo(end);
   }else{
     baseEnd=addDays(start,-1);baseStart=addDays(baseEnd,-daysBetween(start,end)+1);
   }
   return {start:iso(start),end:iso(end),baseStart:iso(baseStart),baseEnd:iso(baseEnd),open};
 }
 function showDates(period){const root=$('a17RetentionPeriods');if(!root)return;root.replaceChildren();if(!period){if($('a17RetentionPeriodNote'))$('a17RetentionPeriodNote').textContent='';return;}
   for(const [key,a,b] of [['retentionCurrentDates',period.start,period.end],['retentionReferenceDates',period.baseStart,period.baseEnd]]){
     const card=node('div','a17-period-card');card.append(node('span','',tr(key)),node('strong','a17-period-dates',a+' — '+b));root.append(card);
   }
   const note=$('a17RetentionPeriodNote');if(note)note.textContent=period.open?tr('retentionProvisional'):tr('retentionComplete');
 }
 async function sales(){const all=[],seen=new Set(),client=window.customerSupabase;if(!client?.rpc)throw Error('RPC_MISSING');for(let i=0;i<200;i++){const {data,error}=await client.rpc('sales_reports_rows_r44r38r20r35').range(i*500,i*500+499);if(error)throw error;if(!Array.isArray(data))throw Error('BAD_ROWS');for(const r of data){const id=(r.is_historical?'h:':'c:')+r.row_id;if(!r.row_id||seen.has(id))throw Error('DUPLICATE_ROW');seen.add(id);const d=String(r.invoice_date||'').slice(0,10);if(!dateOk(d))throw Error('BAD_DATE');all.push({id:String(r.customer_id||''),date:d});}if(data.length<500)return all;}throw Error('PAGINATION_LIMIT');}
 async function load(){if(busy)return;if(!allowed()){reset();status('customerDenied');return;}if(navigator.onLine===false||!window.CustomersService?.listCustomers){reset();status('customerFailed');return;}busy=true;const version=++seq;reset();status('customerLoading');$('a17CustomerLoad').disabled=true;
 try{const [customers,rows]=await Promise.all([window.CustomersService.listCustomers({force:true}),sales()]);if(!Array.isArray(customers)||!rows.length)throw Error('MISSING_DATA');const ids=new Set(),names=new Map();for(const c of customers){const id=String(c?.id||'');if(!id||ids.has(id))throw Error('BAD_CUSTOMER_ID');ids.add(id);names.set(id,String(c.name||c.customer_name||id));}
 configurePeriods(rows); const customerMap=new Map(customers.map(c=>[String(c.id),c]));const purchases=new Map();for(const row of rows){if(!ids.has(row.id))continue;let list=purchases.get(row.id);if(!list){list=[];purchases.set(row.id,list);}list.push(row.date);}for(const list of purchases.values())list.sort();if(version!==seq)return;snapshot={ids,purchases,customerMap};render();}catch(e){console.error('A17.2.2 customer analysis:',e);reset();status('customerFailed');}finally{busy=false;$('a17CustomerLoad').disabled=false;}}
 function configurePeriods(rows){
  const year=$('a14AnalyticsYear'),month=$('a14AnalyticsMonth');if(!year||!month)return;
  const old=year.value,years=new Set(rows.map(r=>Number(String(r.date).slice(0,4))));years.add(new Date().getFullYear());
  const sorted=[...years].filter(y=>Number.isInteger(y)&&y>=2000&&y<=2100).sort((a,b)=>b-a);
  year.replaceChildren();for(const y of sorted){const option=new Option(String(y),String(y));year.add(option);}
  year.value=sorted.includes(Number(old))?old:String(new Date().getFullYear());
  const chosenMonth=month.value;month.replaceChildren();month.add(new Option(tr('allMonths'),''));for(let m=1;m<=12;m++)month.add(new Option(new Intl.DateTimeFormat((window.PetatoeLocalization?.getLanguage?.() === 'en')?'en-US':'ar-SA',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2024,m-1,1))),String(m)));month.value=chosenMonth;
 }
 function barChart(target,data){const root=$(target);if(!root)return;root.replaceChildren();const max=Math.max(1,...data.map(x=>x[1]));for(const [name,value] of data){const row=node('div','a17-bar-row'),label=node('span','',name),track=node('div','a17-bar-track'),fill=node('div','a17-bar-fill'),number=node('strong','a17-bar-number',n(value));fill.style.width=(100*value/max).toFixed(2)+'%';track.append(fill);row.append(label,track,number);root.append(row);}}
 function tableBody(target,data){const root=$(target);if(!root)return;root.replaceChildren();for(const [label,val] of data){const r=node('tr');r.append(node('td','',label),node('td','',n(val)));root.append(r);}}
 function render(){if(!snapshot)return;if(!allowed()){reset();status('customerDenied');return;}const year=$('a14AnalyticsYear')?.value,month=$('a14AnalyticsMonth')?.value||'',mode=$('a14AnalyticsCompare')?.value||'previous';if(!/^\d{4}$/.test(year||''))return;
 const period=ranges(year,month,mode);showDates(period);
 if(!period){for(const id of ['a17CustomerMetrics','a17CustomerActivityChart','a17RetentionChart','a17CustomerActivityBody','a17RetentionBody'])$(id)?.replaceChildren();status('customerOutside');return;}
 const currentIds=new Set(),referenceIds=new Set(),bands=new Array(5).fill(0),segmentRows=[[],[],[],[],[]];
 const cutoff=period.end,endUTC=Date.parse(period.end+'T00:00:00Z');
 for(const id of snapshot.ids){let band=4,lastSale='',gapDays=null;const dates=snapshot.purchases.get(id)||[];
 const activeDates=dates.filter(d=>d<=cutoff);if(!activeDates.length)bands[4]++;
 else{const last=activeDates.at(-1);lastSale=last;const days=Math.round((endUTC-Date.parse(last+'T00:00:00Z'))/86400000);band=days<=30?0:days<=60?1:days<=90?2:3;gapDays=days;bands[band]++;}
 segmentRows[band].push({id,lastSale,gapDays,transactions:activeDates.length});
 if(dates.some(d=>d>=period.start&&d<=period.end))currentIds.add(id);
 if(dates.some(d=>d>=period.baseStart&&d<=period.baseEnd))referenceIds.add(id);
 }
 const shared=[...currentIds].filter(id=>referenceIds.has(id)).length;
 const gained=currentIds.size-shared,lost=referenceIds.size-shared;
 const partial=period.open,retention=!partial&&referenceIds.size?shared/referenceIds.size*100:null;
 const act=[['customerActive',bands[0]],['customerCooling',bands[1]],['customerAtRisk',bands[2]],['customerDormant',bands[3]],['customerNever',bands[4]]].map(([k,v])=>[tr(k),v]);barChart('a17CustomerActivityChart',act);tableBody('a17CustomerActivityBody',act);const body=$('a17CustomerActivityBody');[...body?.rows||[]].forEach((r,i)=>{const td=node('td');const btn=node('button','a17-action-btn',tr('viewCustomers'));btn.type='button';btn.addEventListener('click',()=>openSegment(i,segmentRows,cutoff));td.append(btn);r.append(td);});tableBody('a17CustomerActivityFoot',[[tr('totalRow'),snapshot.ids.size]]);for(const r of $('a17CustomerActivityFoot')?.rows||[])r.append(node('td')); 
 const ret=[[tr('customerCurrent'),currentIds.size],[tr('customerReference'),referenceIds.size],[tr('customerRepeat'),shared]];barChart('a17RetentionChart',ret);
 const retentionKeys=['customerCurrent','customerReference','customerRepeat','retentionNotInReference','retentionNotReturned'];
 const retentionGroups=[currentIds,referenceIds,new Set([...currentIds].filter(id=>referenceIds.has(id))),new Set([...currentIds].filter(id=>!referenceIds.has(id))),new Set([...referenceIds].filter(id=>!currentIds.has(id)))];
 tableBody('a17RetentionBody',[...ret,[tr('retentionNotInReference'),gained],[tr('retentionNotReturned'),lost]]);
 const retentionBody=$('a17RetentionBody');[...retentionBody?.rows||[]].forEach((row,i)=>{
   const td=node('td');const btn=node('button','a17-action-btn',tr('viewCustomers'));btn.type='button';
   btn.addEventListener('click',()=>{
     const ids=retentionGroups[i],referenceOnly=i===1||i===4;
     const end=referenceOnly?period.baseEnd:period.end;
     const rows=[...ids].map(id=>{
       const history=(snapshot.purchases.get(id)||[]).filter(d=>d<=end);
       const lastSale=history.length?history[history.length-1]:'';
       const gapDays=lastSale?Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(lastSale+'T00:00:00Z'))/86400000):null;
       return {id,lastSale,gapDays,transactions:history.length};
     });
     openCustomerRows(retentionKeys[i],rows,end,'retention:'+i);
   });td.append(btn);row.append(td);
 });
 const metrics=[['customerEligible',n(snapshot.ids.size)],['customerCurrent',n(currentIds.size)],['customerReference',n(referenceIds.size)],['customerRetention',retention===null?tr('customerUnavailable'):retention.toFixed(1)+'%']];$('a17CustomerMetrics').replaceChildren();for(const [key,val] of metrics){const e=node('div','a17-kpi');e.append(node('span','',tr(key)),node('strong','',val));$('a17CustomerMetrics').append(e);}status(partial?'customerPartial':!referenceIds.size?'customerNoBase':'customerLoaded');}
 function closeSegment(){$('a17SegmentPage')?.classList.add('hidden');$('a17CustomerPanel')?.classList.remove('hidden');selectedBand=null;selectedTitleKey=null;selectedToken=null;}
 function openSegment(i,rows,cutoff){return openCustomerRows(['customerActive','customerCooling','customerAtRisk','customerDormant','customerNever'][i],rows[i]||[],cutoff,'activity:'+i);}
 async function openCustomerRows(titleKey,rows,cutoff,token){
  if(!snapshot||!allowed())return;
  selectedBand=token;selectedTitleKey=titleKey;selectedToken=token;
  // Sort the entire cohort before paging or searching: longest inactivity first.
  // Unknown last-sale dates stay last; never manufacture a gap in days.
  detailRows=[...rows].sort((a,b)=>{
    const ad=Number.isFinite(a.gapDays)?a.gapDays:null;
    const bd=Number.isFinite(b.gapDays)?b.gapDays:null;
    if(ad===null&&bd!==null)return 1;
    if(bd===null&&ad!==null)return -1;
    if(ad!==null&&bd!==null&&ad!==bd)return bd-ad;
    return String(a.id).localeCompare(String(b.id));
  });
  visible=10;followupsMap=null;
  $('a17SegmentName').textContent=tr(titleKey);$('a17SegmentCount').textContent=n(detailRows.length);
  $('a17SegmentCutoff').textContent=cutoff;
  $('a17CustomerPanel').classList.add('hidden');$('a17SegmentPage').classList.remove('hidden');
  $('a17SegmentSearch').value='';paintSegment();
  if(window.PermissionEngine?.canView?.('followups')===true&&window.FollowupsService?.listFollowups){
   const guard=seq;try{const rows=await window.FollowupsService.listFollowups({force:true});if(guard!==seq||selectedToken!==token||!allowed())return;
   if(Array.isArray(rows)){const contacts=new Map();for(const r of rows){const id=String(r.customerId||''),date=String(r.contactDate||'').slice(0,10);if(!snapshot.ids.has(id)||!dateOk(date))continue;const prior=contacts.get(id);if(!prior||date>prior.date)contacts.set(id,{date,result:String(r.result||'')});}followupsMap=contacts;paintSegment();}
   }catch(err){console.warn('A17 customer follow-up view unavailable:',err);}
  }
  $('a17SegmentPage').scrollIntoView({block:'start',behavior:'smooth'});
 }
 function phoneValue(c){return String(c?.phone||c?.mobile||c?.phone_number||'').trim();}
 function paintSegment(){if(selectedBand===null||!snapshot||!allowed())return;const q=String($('a17SegmentSearch').value||'').trim().toLocaleLowerCase();
   const rows=detailRows.filter(r=>{const c=snapshot.customerMap.get(r.id)||{};return !q||[c.name,c.customer_name,c.customer_number,phoneValue(c)].some(v=>String(v||'').toLocaleLowerCase().includes(q));});
   const body=$('a17SegmentBody');body.replaceChildren();for(const r of rows.slice(0,visible)){
     const c=snapshot.customerMap.get(r.id)||{};const line=node('tr');const details=[String(c.name||c.customer_name||r.id),phoneValue(c)||'—',r.lastSale||tr('noRecordedSale'),r.gapDays===null?'—':n(r.gapDays),n(r.transactions),followupsMap?.get(r.id)?.date||tr('customerUnavailable')];
     for(const value of details)line.append(node('td','',value));const td=node('td','a17-segment-actions');
     const actions=[['whatsapp','whatsapp'],['call','call'],['addFollowup','followup'],['contacted','contacted']];
     for(const [key,action] of actions){const btn=node('button','a17-action-btn',tr(key));btn.type='button';btn.dataset.a17Customer=r.id;btn.dataset.a17Action=action; if((action==='whatsapp'||action==='call')&&!phoneValue(c))btn.disabled=true;td.append(btn);}
     line.append(td);body.append(line);
   }
   $('a17SegmentVisible').textContent=`${n(Math.min(visible,rows.length))} / ${n(rows.length)}`;
   $('a17SegmentMore').hidden=visible>=rows.length;
 }
 function toggle(buttonId,detailsId){const btn=$(buttonId),details=$(detailsId);if(!btn||!details)return;details.hidden=!details.hidden;btn.setAttribute('aria-expanded',String(!details.hidden));btn.textContent=tr(details.hidden?'showDetails':'hideDetails');}
 document.addEventListener('DOMContentLoaded',()=>{$('a17CustomerLoad')?.addEventListener('click',load);configurePeriods([]);
 $('a17SegmentBack')?.addEventListener('click',()=>{closeSegment();});
 $('a17SegmentMore')?.addEventListener('click',()=>{visible+=10;paintSegment();});
 $('a17SegmentSearch')?.addEventListener('input',()=>{visible=10;paintSegment();});
 $('a17SegmentBody')?.addEventListener('click',e=>{const btn=e.target.closest('[data-a17-action]');if(!btn||!snapshot||!allowed())return;const id=btn.dataset.a17Customer,c=snapshot.customerMap.get(id);if(!c)return;const action=btn.dataset.a17Action;
 if(action==='followup'||action==='contacted'){window.PetatoeA17FollowupBridge?.open?.(id,action==='contacted');return;}
 const raw=phoneValue(c);if(!raw)return;const digits=raw.replace(/\D/g,'');if(!digits)return;
 if(action==='call'){window.location.href='tel:'+digits;return;}
 const number=digits.startsWith('0')?'966'+digits.slice(1):digits;
 const url=window.WhatsAppTemplateService?.directUrl?.(number)||'https://wa.me/'+number;
 if(/^https:\/\//.test(url))window.open(url,'_blank','noopener,noreferrer');
 });$('a17CustomerActivityToggle')?.addEventListener('click',()=>toggle('a17CustomerActivityToggle','a17CustomerActivityDetails'));$('a17RetentionToggle')?.addEventListener('click',()=>toggle('a17RetentionToggle','a17RetentionDetails'));$('a14AnalyticsApply')?.addEventListener('click',()=>{closeSegment();render();});$('a14AnalyticsCompare')?.addEventListener('change',()=>{closeSegment();render();});});
 window.addEventListener('petatoe-language-changed',()=>{const monthEl=$('a14AnalyticsMonth');if(monthEl){const oldValue=monthEl.value;monthEl.replaceChildren();monthEl.add(new Option(tr('allMonths'),''));for(let m=1;m<=12;m++)monthEl.add(new Option(new Intl.DateTimeFormat(window.PetatoeLocalization?.getLanguage?.()==='en'?'en-US':'ar-SA',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2024,m-1,1))),String(m)));monthEl.value=oldValue;}if(selectedBand!==null){$('a17SegmentName').textContent=tr(selectedTitleKey);paintSegment();}else render();for(const [button,details] of [['a17CustomerActivityToggle','a17CustomerActivityDetails'],['a17RetentionToggle','a17RetentionDetails']]){const el=$(button),panel=$(details);if(el&&panel)el.textContent=tr(panel.hidden?'showDetails':'hideDetails');}});
 // Share the exact authorized customer/sales source and 30/60/90 day segmentation with daily tasks.
 async function dailyActivitySnapshot(){
   if(!allowed())throw Error('PERMISSION_DENIED');
   const [customers,rows]=await Promise.all([window.CustomersService.listCustomers({force:true}),sales()]);
   if(!Array.isArray(customers)||!Array.isArray(rows))throw Error('BAD_ROWS');
   const customerMap=new Map(customers.map(c=>[String(c.id),c]));
   const purchases=new Map();for(const item of rows){if(!customerMap.has(item.id))continue;const list=purchases.get(item.id)||[];list.push(item.date);purchases.set(item.id,list);}
   const today=new Date(),cutoff=iso(utc(today.getFullYear(),today.getMonth()+1,today.getDate()));
   const end=Date.parse(cutoff+'T00:00:00Z'),bands=[[],[],[],[],[]];
   for(const [id] of customerMap){const dates=(purchases.get(id)||[]).filter(d=>d<=cutoff).sort();const lastSale=dates.at(-1)||'';
     const gapDays=lastSale?Math.round((end-Date.parse(lastSale+'T00:00:00Z'))/86400000):null;
     const band=gapDays===null?4:gapDays<=30?0:gapDays<=60?1:gapDays<=90?2:3;
     bands[band].push({id,lastSale,gapDays,transactions:dates.length});
   }
   return {customerMap,bands,cutoff};
 }
 window.AdvancedAnalyticsCustomersUI={render,dailyActivitySnapshot};
})();

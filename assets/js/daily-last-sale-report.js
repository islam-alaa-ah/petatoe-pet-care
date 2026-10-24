/* Daily extension of A17 customer last-sale classification; read-only data, shared WhatsApp template. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const t=k=>window.PetatoeLocalization?.t?.(k)||k;
 const at=k=>t('advancedAnalytics.'+k);
 const lt=k=>t('dailyOperations.lastSale.'+k);
 const names=['customerActive','customerCooling','customerAtRisk','customerDormant','customerNever'];
 let data=null,band=-1,limit=10,busy=false,contacts=new Map(),completedContacts=new Map();
 const make=(tag,txt)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;return n;};
 const number=x=>Number(x).toLocaleString('en-US');
 const phone=c=>String(c?.phone||c?.mobile||c?.phone_number||'').trim();
 function waNumber(raw){const digits=raw.replace(/\D/g,'');if(!digits)return '';return digits.startsWith('0')?'966'+digits.slice(1):digits;}
 function paint(){if(!data)return;const table=$('dailyLastSaleBands'),chart=$('dailyLastSaleChart');table.replaceChildren();chart.replaceChildren();const max=Math.max(1,...data.bands.map(x=>x.length));
  names.forEach((key,i)=>{const count=data.bands[i].length,row=make('tr'),label=make('td',at(key)),value=make('td',number(count)),action=make('td'),button=make('button',lt('view'));button.type='button';button.className='secondary-btn compact-btn';button.dataset.dailyLastSaleBand=String(i);action.append(button);row.append(label,value,action);table.append(row);
   const line=make('div'),title=make('span',at(key)),track=make('div'),fill=make('div'),v=make('strong',number(count));line.className='a17-bar-row';track.className='a17-bar-track';fill.className='a17-bar-fill';v.className='a17-bar-number';fill.style.width=(count/max*100).toFixed(2)+'%';track.append(fill);line.append(title,track,v);chart.append(line);
  });const total=$('dailyLastSaleTotal');total.replaceChildren();const tr=make('tr');tr.append(make('th',lt('total')),make('th',number(data.customerMap.size)),make('th',''));total.append(tr);paintDetails();
 }
 function paintDetails(){const wrap=$('dailyLastSaleDetails');wrap.hidden=band<0||!data;if(wrap.hidden)return;const q=$('dailyLastSaleSearch').value.trim().toLocaleLowerCase();$('dailyLastSaleBandName').textContent=at(names[band])+' · '+data.cutoff;
  const rows=[...data.bands[band]].sort((a,b)=>{
   // Outstanding customers first (longest time since last sale); contacted customers
   // remain at the bottom, ordered by oldest completed contact first.
   const aDate=completedContacts.get(String(a.id))||'',bDate=completedContacts.get(String(b.id))||'';
   if(Boolean(aDate)!==Boolean(bDate))return aDate?1:-1;
   if(aDate&&bDate&&aDate!==bDate)return aDate.localeCompare(bDate);
   const gapDiff=(b.gapDays??-1)-(a.gapDays??-1);
   return gapDiff||String(a.id).localeCompare(String(b.id));
  }).filter(r=>{const c=data.customerMap.get(r.id)||{};return !q||[c.name,c.customer_name,c.customer_number,phone(c)].some(v=>String(v||'').toLocaleLowerCase().includes(q));});
  const body=$('dailyLastSaleRows');body.replaceChildren();for(const r of rows.slice(0,limit)){const c=data.customerMap.get(r.id)||{},tr=make('tr');for(const v of [c.name||c.customer_name||r.id,phone(c)||'—',r.lastSale||at('noRecordedSale'),r.gapDays===null?'—':number(r.gapDays),number(r.transactions),contacts.get(r.id)||'—'])tr.append(make('td',v));
   const td=make('td'),actions=make('div');actions.className='daily-last-sale-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label',at('actions')+' - '+String(c.name||c.customer_name||r.id));
   const raw=phone(c),num=waNumber(raw);
   if(num){
     const a=make('a',t('dailyOperations.suggested.whatsapp'));a.className='daily-whatsapp-btn';a.target='_blank';a.rel='noopener noreferrer';a.href=window.WhatsAppTemplateService?.directUrl?.(num,window.getDailyWhatsAppTemplateMessage?.()||'')||'https://wa.me/'+num;actions.append(a);
     const share=make('button',t('dailyOperations.suggested.imageMessage'));share.type='button';share.className='daily-whatsapp-share-btn';share.dataset.dailyWhatsappShare=num;actions.append(share);
     const call=make('a',at('call'));call.className='daily-last-sale-call';call.href='tel:'+raw.replace(/[^+\d]/g,'');actions.append(call);
   }
   if(window.PermissionEngine?.canView?.('followups')===true){for(const [action,label] of [['followup','addFollowup'],['contacted','contacted']]){const btn=make('button',at(label));btn.type='button';btn.className='secondary-btn compact-btn daily-last-sale-followup';btn.addEventListener('click',()=>window.PetatoeA17FollowupBridge?.open?.(r.id,action==='contacted'));actions.append(btn);}}
   if(!actions.childElementCount)actions.append(make('span','—'));
   td.append(actions);tr.append(td);body.append(tr);
  }$('dailyLastSaleVisible').textContent=number(Math.min(rows.length,limit))+' / '+number(rows.length);$('dailyLastSaleMore').hidden=limit>=rows.length;
 }
 async function load(){if(busy||!$('dailyLastSalePanel'))return;busy=true;$('dailyLastSaleStatus').textContent=lt('loading');try{
  data=await window.AdvancedAnalyticsCustomersUI.dailyActivitySnapshot();contacts=new Map();completedContacts=new Map();
  if(window.PermissionEngine?.canView?.('followups')===true&&window.FollowupsService?.listFollowups){try{const rows=await window.FollowupsService.listFollowups({force:true});for(const r of rows||[]){const id=String(r.customerId||''),date=String(r.contactDate||'').slice(0,10);if(!id||!date)continue;if(date>(contacts.get(id)||''))contacts.set(id,date);
    const result=String(r.result||'').trim().toLocaleLowerCase();
    const isContacted=result==='تم التواصل'||result==='contacted'||result==='contact completed';
    if(isContacted&&date>(completedContacts.get(id)||''))completedContacts.set(id,date);}}catch(e){console.warn('Daily last sale followups unavailable',e);}}
  $('dailyLastSaleStatus').textContent='';paint();
 }catch(e){console.warn('Daily last sale report unavailable',e);data=null;$('dailyLastSaleBands').replaceChildren();$('dailyLastSaleChart').replaceChildren();$('dailyLastSaleDetails').hidden=true;$('dailyLastSaleStatus').textContent=e.message==='PERMISSION_DENIED'?lt('denied'):lt('failed');}finally{busy=false;}}
 document.addEventListener('DOMContentLoaded',()=>{$('dailyLastSaleRefresh')?.addEventListener('click',load);$('dailyLastSaleBands')?.addEventListener('click',e=>{const n=e.target.closest('[data-daily-last-sale-band]');if(!n)return;const value=Number(n.dataset.dailyLastSaleBand);band=band===value?-1:value;limit=10;$('dailyLastSaleSearch').value='';paintDetails();});$('dailyLastSaleSearch')?.addEventListener('input',()=>{limit=10;paintDetails();});$('dailyLastSaleMore')?.addEventListener('click',()=>{limit+=10;paintDetails();});});
 window.addEventListener('petatoe-language-changed',()=>{if(data)paint();});
 window.DailyLastSaleReport={load};
})();

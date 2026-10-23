/* A17.3.6 - read-only balanced sales insights on the verified A17 financial snapshot. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const t=k=>window.PetatoeLocalization?.t?.('advancedAnalytics.'+k)||k;
const authorized=()=>window.PermissionEngine?.canView?.('advancedAnalytics')===true&&window.PermissionEngine?.canView?.('salesReports')===true;
const e=(tag,txt,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};
const money=c=>`${(c/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} SAR`;
const pct=(current,reference)=>`${((current-reference)/reference*100).toFixed(2)}%`;
const priorYear=s=>`${Number(s.slice(0,4))-1}${s.slice(4)}`;
const nowMonth=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}`;};
function render(){const list=$('a17InsightsList'),body=$('a17InsightsBody'),status=$('a17InsightsStatus');if(!list||!body||!status)return;list.replaceChildren();body.replaceChildren();
 if(!authorized()){status.textContent=t('blocked');return;}
 const monthly=window.AdvancedAnalyticsUI?.getVerifiedSalesMonths?.();if(!(monthly instanceof Map)){status.textContent=t('insightNoSnapshot');return;}
 const y=$('a17Year')?.value,m=$('a17Month')?.value||'';if(!/^\d{4}$/.test(y||'')){status.textContent=t('insightNeedsData');return;}
 const months=m?[`${y}-${m}`]:Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,'0')}`);
 let alerted=0,skipped=0,checked=0;
 for(const month of months){const reference=priorYear(month),currentC=monthly.get(month),referenceC=monthly.get(reference);
  let result,percent='—';const ongoing=month>=nowMonth();const valid=Number.isSafeInteger(currentC)&&Number.isSafeInteger(referenceC)&&referenceC>=100000&&currentC>=0&&!ongoing;
  if(ongoing){result=t('insightPartial');skipped++;}
  else if(!valid){result=t('insightSkipped');skipped++;}
  else {checked++;percent=pct(currentC,referenceC);if(currentC*100<=referenceC*85){result=t('insightAlert');alerted++;const card=e('div',undefined,'a17-insight-card'),intro=e('div');intro.append(e('strong',`${t('insightSalesDrop')} — ${month}`),e('p',`${t('insightSalesDropDescription')} ${money(currentC)} / ${money(referenceC)} (${reference})`));card.append(intro,e('span',percent,'a17-insight-value'));list.append(card);}else result=t('insightChecked');}
  const tr=e('tr');for(const val of [month,Number.isSafeInteger(currentC)?money(currentC):'—',Number.isSafeInteger(referenceC)?money(referenceC):'—',percent,result])tr.append(e('td',val));body.append(tr);
 }
 if(!alerted){list.append(e('p',skipped?t('insightNeedsData'):t('insightNoAlerts'),'a17-fineprint'));}
 status.textContent=`${t('insightDataNote')} · ${t('insightAlert')}: ${alerted} · ${t('insightChecked')}: ${checked} · ${t('insightSkipped')}: ${skipped}`;
}
document.addEventListener('DOMContentLoaded',()=>{$('a17Apply')?.addEventListener('click',render);$('a17Year')?.addEventListener('change',render);$('a17Month')?.addEventListener('change',render);$('a17InsightsToggle')?.addEventListener('click',()=>{const box=$('a17InsightsDetails'),button=$('a17InsightsToggle');if(!box||!button)return;box.hidden=!box.hidden;button.setAttribute('aria-expanded',String(!box.hidden));button.textContent=t(box.hidden?'showDetails':'hideDetails');});});
document.addEventListener('petatoe:a17-sales-verified',render);
window.addEventListener('petatoe-language-changed',()=>{render();const b=$('a17InsightsToggle'),p=$('a17InsightsDetails');if(b&&p)b.textContent=t(p.hidden?'showDetails':'hideDetails');});
window.AdvancedAnalyticsInsightsUI=Object.freeze({render});
})();

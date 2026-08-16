(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let rows=[];
  function setStatus(text,type=''){const el=$('translationCenterStatus');if(!el)return;el.textContent=text||'';el.className=`data-status${text?'':' hidden'}${type?` ${type}`:''}`}
  function filtered(){const q=String($('translationCenterSearch')?.value||'').trim().toLowerCase(),type=$('translationCenterTypeFilter')?.value||'';return rows.filter(r=>(!type||r.type===type)&&(!q||[r.key,r.ar,r.en,r.type].some(v=>String(v||'').toLowerCase().includes(q))))}
  function renderStats(){const total=rows.length,complete=rows.filter(r=>r.complete).length,custom=rows.filter(r=>r.customized).length;const totalEl=$('translationCenterTotal'),completeEl=$('translationCenterComplete'),customEl=$('translationCenterCustom');if(totalEl)totalEl.textContent=String(total);if(completeEl)completeEl.textContent=String(complete);if(customEl)customEl.textContent=String(custom)}
  function render(){const body=$('translationCenterRows');if(!body)return;const list=filtered();body.innerHTML=list.length?list.map(r=>`<tr data-translation-key="${esc(r.key)}"><td><strong>${esc(r.key)}</strong><small>${esc(r.type)}</small></td><td><textarea data-translation-ar rows="2" spellcheck="false">${esc(r.ar)}</textarea></td><td><textarea data-translation-en rows="2" spellcheck="false" dir="ltr">${esc(r.en)}</textarea></td><td><span class="translation-status ${r.complete?'is-complete':'is-missing'}">${r.complete?'مكتملة':'ناقصة'}</span>${r.customized?'<small class="translation-custom-badge">معدّلة</small>':''}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">لا توجد نتائج مطابقة.</td></tr>';renderStats()}
  function collect(){return[...document.querySelectorAll('#translationCenterRows tr[data-translation-key]')].map(tr=>({key:tr.dataset.translationKey,ar:tr.querySelector('[data-translation-ar]')?.value||'',en:tr.querySelector('[data-translation-en]')?.value||''}))}
  async function load(force=false){if(!window.PetatoeLocalization)return;setStatus('جاري تحميل مركز الترجمه...');try{const catalog=await window.LocalizationCenterService?.listEntityCatalog?.().catch(()=>({services:[],neighborhoods:[]}));window.PetatoeLocalization.registerEntityCatalog?.(catalog||{});rows=await window.PetatoeLocalization.loadRemote(true);render();syncLanguage();setStatus('')}catch(e){setStatus(e.message||'تعذر تحميل مركز الترجمه.','error')}}
  async function save(){setStatus('جاري حفظ الترجمات...');try{rows=await window.PetatoeLocalization.saveRows(rows);render();setStatus('تم حفظ الترجمات بنجاح.','success');setTimeout(()=>setStatus(''),2200)}catch(e){setStatus(e.message||'تعذر حفظ الترجمات.','error')}}
  function syncLanguage(){const lang=window.PetatoeLocalization?.getLanguage?.()||'ar';document.querySelectorAll('[data-translation-language]').forEach(btn=>{const active=btn.dataset.translationLanguage===lang;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active))})}
  function setLanguage(lang){window.PetatoeLocalization?.setLanguage?.(lang);syncLanguage();syncHeaderToggle();setStatus(lang==='en'?'تم تحويل شاشة تنفيذ المواعيد والقائمة الجانبية إلى الإنجليزية.':'تم تحويل شاشة تنفيذ المواعيد والقائمة الجانبية إلى العربية.','success');setTimeout(()=>setStatus(''),1800)}
  function syncHeaderToggle(){const btn=$('translationCenterHeaderBtn'),lang=window.PetatoeLocalization?.getLanguage?.()||'ar';if(!btn)return;const label=lang==='en'?'Switch to Arabic':'التبديل إلى الإنجليزية';btn.dataset.language=lang;btn.setAttribute('aria-label',label);btn.setAttribute('title',label)}
  function toggleLanguage(){const lang=window.PetatoeLocalization?.getLanguage?.()==='en'?'ar':'en';setLanguage(lang)}
  function open(){if(!window.PermissionEngine?.canView?.('translationCenter')&&!window.CustomerPermissions?.canScreen?.('translationCenter','view'))return;window.KYUMNavigation?.open?.('translationCenter',{trustedNavigation:true})}
  document.addEventListener('DOMContentLoaded',()=>{
    $('translationCenterHeaderBtn')?.addEventListener('click',toggleLanguage);
    $('translationCenterSearch')?.addEventListener('input',render);
    $('translationCenterTypeFilter')?.addEventListener('change',render);
    $('translationCenterRows')?.addEventListener('input',event=>{const tr=event.target.closest?.('tr[data-translation-key]');if(!tr)return;const row=rows.find(item=>item.key===tr.dataset.translationKey);if(!row)return;if(event.target.matches('[data-translation-ar]'))row.ar=event.target.value;if(event.target.matches('[data-translation-en]'))row.en=event.target.value;row.complete=Boolean(String(row.ar||'').trim()&&String(row.en||'').trim());row.customized=row.ar!==row.defaultAr||row.en!==row.defaultEn;renderStats()});
    $('saveTranslationCenterBtn')?.addEventListener('click',save);
    $('reloadTranslationCenterBtn')?.addEventListener('click',()=>load(true));
    document.querySelectorAll('[data-translation-language]').forEach(btn=>btn.addEventListener('click',()=>setLanguage(btn.dataset.translationLanguage)));
    window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='translationCenter')load(false)});
    syncLanguage();syncHeaderToggle();
  });
  window.TranslationCenterUI=Object.freeze({load,open,toggleLanguage});
})();

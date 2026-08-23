(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money = value => `${Number(value || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ر.س`;
  const t = (key, fallback) => window.PetatoeLocalization?.t?.(key, fallback) || fallback;
  const state = { data: null, editing: null, loading: false };

  function status(message='', type='info') {
    const el = $('vehicleTreasuryStatus'); if (!el) return;
    el.textContent = message; el.className = `data-status${message ? '' : ' hidden'} ${type}`;
  }
  function filters() { return { teamId:$('vehicleTreasuryTeam')?.value||'', from:$('vehicleTreasuryFrom')?.value||'', to:$('vehicleTreasuryTo')?.value||'', search:$('vehicleTreasurySearch')?.value||'' }; }
  function currentTeam() { const id = $('vehicleTreasuryTeam')?.value || ''; return state.data?.teams?.find(x => String(x.id) === String(id)) || null; }

  function fillTeams() {
    const el = $('vehicleTreasuryTeam'); if (!el || !state.data) return;
    const current = el.value;
    el.innerHTML = `<option value="">${esc(t('vehicleTreasury.filter.selectCar','اختر السيارة / الفرقة'))}</option>` + state.data.teams.map(x => `<option value="${esc(x.id)}">${esc(x.carName || x.teamName || '—')} — ${esc(x.teamName || '')}</option>`).join('');
    if (state.data.teams.some(x => String(x.id) === String(current))) el.value = current;
    else if (state.data.teams.length === 1) el.value = state.data.teams[0].id;
  }

  function renderSummary() {
    const s = state.data?.summary || { balance:0,revenue:0,expense:0,count:0 };
    if ($('vehicleTreasuryBalance')) $('vehicleTreasuryBalance').textContent = money(s.balance);
    if ($('vehicleTreasuryRevenue')) $('vehicleTreasuryRevenue').textContent = money(s.revenue);
    if ($('vehicleTreasuryExpenses')) $('vehicleTreasuryExpenses').textContent = money(s.expense);
    if ($('vehicleTreasuryCount')) $('vehicleTreasuryCount').textContent = Number(s.count || 0).toLocaleString('en-US');
  }

  function renderRows() {
    const body = $('vehicleTreasuryBody'); if (!body) return;
    const rows = state.data?.movements || [];
    if (!rows.length) { body.innerHTML = `<tr><td colspan="9" class="empty-state">${esc(t('vehicleTreasury.empty','لا توجد حركات ضمن الفلاتر الحالية.'))}</td></tr>`; return; }
    body.innerHTML = rows.map((x,i) => {
      const income = Number(x.amount || 0) >= 0;
      return `<tr>
        <td>${i+1}</td><td>${esc(x.movementDate||'—')}</td><td><span class="vehicle-treasury-type ${income?'income':'expense'}">${esc(income?t('vehicleTreasury.type.revenue','إيراد'):t('vehicleTreasury.type.expense','مصروف'))}</span></td>
        <td>${esc(x.reference||'—')}</td><td>${esc(x.description||'—')}</td><td class="${income?'vehicle-treasury-money-in':'vehicle-treasury-money-out'}">${income?'+':'-'} ${money(Math.abs(Number(x.amount||0)))}</td>
        <td>${esc(x.carName||x.teamName||'—')}</td><td>${esc(x.notes||'—')}</td>
        <td>${x.editable ? `<div class="vehicle-treasury-actions">${window.PermissionEngine?.canEdit?.('vehicleTreasury') ? `<button type="button" class="secondary-btn compact-btn" data-vt-edit="${esc(x.sourceId||x.id)}">${esc(t('vehicleTreasury.edit','تعديل'))}</button>` : ''}${window.PermissionEngine?.canDelete?.('vehicleTreasury') ? `<button type="button" class="secondary-btn compact-btn danger" data-vt-delete="${esc(x.sourceId||x.id)}">${esc(t('vehicleTreasury.delete','حذف'))}</button>` : ''}</div>` : '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('');
  }

  async function load(showLoader=true) {
    if (state.loading) return; state.loading=true; if(showLoader)status(t('vehicleTreasury.loading','جاري تحميل خزينة السيارة...'),'info');
    try { state.data = await window.VehicleTreasuryService.load(filters()); fillTeams(); if (!filters().teamId && $('vehicleTreasuryTeam')?.value) state.data = await window.VehicleTreasuryService.load(filters()); renderSummary(); renderRows(); status(window.VehicleTreasuryService.getReadStatus()==='offline-cache'?t('vehicleTreasury.offline','يتم عرض آخر بيانات محفوظة دون اتصال.'): '', 'info'); }
    catch(e){ status(e.message||String(e),'error'); }
    finally { state.loading=false; }
  }

  function openExpense(row=null) {
    state.editing = row;
    const dialog = $('vehicleTreasuryExpenseDialog'); if(!dialog)return;
    const team = row?.teamId || $('vehicleTreasuryTeam')?.value || '';
    $('vehicleTreasuryExpenseId').value = row?.sourceId || row?.id || '';
    $('vehicleTreasuryExpenseTeam').innerHTML = (state.data?.teams||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.carName||x.teamName)} — ${esc(x.teamName||'')}</option>`).join('');
    $('vehicleTreasuryExpenseTeam').value = team;
    $('vehicleTreasuryExpenseDate').value = row?.movementDate || new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
    $('vehicleTreasuryExpenseDescription').value = row?.description || '';
    $('vehicleTreasuryExpenseAmount').value = row ? Math.abs(Number(row.amount||0)) : '';
    $('vehicleTreasuryExpenseNotes').value = row?.notes || '';
    $('vehicleTreasuryExpenseTitle').textContent = row ? t('vehicleTreasury.expense.editTitle','تعديل حركة صرف') : t('vehicleTreasury.expense.addTitle','صرف من خزينة السيارة');
    dialog.showModal();
  }
  function closeExpense(){ $('vehicleTreasuryExpenseDialog')?.close(); state.editing=null; }

  async function submitExpense(e){ e.preventDefault(); status('', 'info'); try{
    const id=$('vehicleTreasuryExpenseId').value||'';
    await window.VehicleTreasuryService.saveExpense({id:id||null,teamId:$('vehicleTreasuryExpenseTeam').value,date:$('vehicleTreasuryExpenseDate').value,description:$('vehicleTreasuryExpenseDescription').value,amount:$('vehicleTreasuryExpenseAmount').value,notes:$('vehicleTreasuryExpenseNotes').value});
    closeExpense(); await load(false); status(t('vehicleTreasury.saved','تم حفظ حركة الصرف بنجاح.'),'success');
  }catch(err){ const el=$('vehicleTreasuryExpenseStatus'); if(el){el.textContent=err.message||String(err);el.className='data-status error';} }}

  function bind(){
    $('vehicleTreasuryRefresh')?.addEventListener('click',()=>load());
    $('vehicleTreasuryTeam')?.addEventListener('change',()=>load());
    $('vehicleTreasuryFrom')?.addEventListener('change',()=>load(false));
    $('vehicleTreasuryTo')?.addEventListener('change',()=>load(false));
    $('vehicleTreasurySearch')?.addEventListener('input',()=>{clearTimeout(bind.searchTimer);bind.searchTimer=setTimeout(()=>load(false),250)});
    $('vehicleTreasuryReset')?.addEventListener('click',()=>{['vehicleTreasuryFrom','vehicleTreasuryTo','vehicleTreasurySearch'].forEach(id=>{if($(id))$(id).value=''});load(false)});
    $('vehicleTreasuryAddExpense')?.addEventListener('click',()=>openExpense());
    $('vehicleTreasuryExpenseForm')?.addEventListener('submit',submitExpense);
    $('vehicleTreasuryExpenseCancel')?.addEventListener('click',closeExpense);
    $('vehicleTreasuryExpenseClose')?.addEventListener('click',closeExpense);
    $('vehicleTreasuryBody')?.addEventListener('click',async e=>{
      const edit=e.target.closest('[data-vt-edit]'), del=e.target.closest('[data-vt-delete]');
      if(edit){const row=(state.data?.movements||[]).find(x=>String(x.sourceId||x.id)===String(edit.dataset.vtEdit));if(row)openExpense(row);}
      if(del){const row=(state.data?.movements||[]).find(x=>String(x.sourceId||x.id)===String(del.dataset.vtDelete));if(!row)return;if(!confirm(t('vehicleTreasury.deleteConfirm','هل تريد حذف حركة الصرف؟')))return;try{await window.VehicleTreasuryService.deleteExpense(row.sourceId||row.id);await load(false);status(t('vehicleTreasury.deleted','تم حذف حركة الصرف.'),'success')}catch(err){status(err.message||String(err),'error')}}
    });
  }

  let initialized=false;
  function activate(){ if(!initialized){bind();initialized=true;} load(); }
  window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='vehicleTreasury')activate();});
  window.VehicleTreasuryUI=Object.freeze({activate,load});
})();

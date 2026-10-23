(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const tr=(key)=>window.PetatoeLocalization?.t?.('advancedAnalytics.'+key)||key;
  const mayView=()=>window.PermissionEngine?.canView?.('advancedAnalytics')===true&&window.PermissionEngine?.canView?.('salesReports')===true;
  const page=500,maxPages=200;
  let monthly=new Map(), loaded=false, loading=false, shown=false;
  const cents=n=>{const x=Number(n);if(!Number.isFinite(x)||!Number.isSafeInteger(Math.round(x*100)))throw Error('INVALID_AMOUNT');return Math.round(x*100);};
  const amount=n=>(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR';
  const status=k=>{if($('a17Status'))$('a17Status').textContent=tr(k);};
  function clear(){monthly=new Map();loaded=false;for(const id of ['a17Kpis','a17SalesChart','a17SalesBody','a17SalesFoot'])$(id)?.replaceChildren();}
  function makeOptions(id,pairs){const el=$(id);if(!el)return;const old=el.value;el.replaceChildren();for(const [v,label] of pairs){const opt=document.createElement('option');opt.value=v;opt.textContent=label;el.append(opt);}if(pairs.some(([v])=>v===old))el.value=old;}
  function selectFilters(){const ys=[...new Set([...monthly.keys()].map(x=>x.slice(0,4)))].sort().reverse();makeOptions('a17Year',ys.map(y=>[y,y]));makeOptions('a17Month',[['',tr('allMonths')],...Array.from({length:12},(_,i)=>[String(i+1).padStart(2,'0'),new Intl.DateTimeFormat(window.PetatoeLocalization?.effectiveLanguage?.()==='en'?'en-US':'ar-EG',{month:'long'}).format(new Date(2026,i,1))])]);}
  async function load(){if(loading)return;if(!mayView()){clear();status('blocked');return;}loading=true;clear();status('loading');if($('a17Refresh'))$('a17Refresh').disabled=true;
    try{
      if(navigator.onLine===false||!window.customerSupabase?.rpc)throw Error('OFFLINE');
      let seen=new Set(),raw=new Map(),complete=false,total=0;
      for(let i=0;i<maxPages;i++){
        const {data,error}=await window.customerSupabase.rpc('sales_reports_rows_r44r38r20r35').range(i*page,(i+1)*page-1);
        if(error)throw error;if(!Array.isArray(data))throw Error('INVALID_RPC');
        for(const r of data){const id=(r.is_historical?'h:':'c:')+r.row_id;if(!r.row_id||seen.has(id))throw Error('DUPLICATE_ID');seen.add(id);
          const d=String(r.invoice_date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d+'T00:00:00Z')))throw Error('INVALID_DATE');
          const key=d.slice(0,7);const value=cents(r.amount_incl_tax);total+=value;if(!Number.isSafeInteger(total))throw Error('OVERFLOW');raw.set(key,(raw.get(key)||0)+value);
        }
        if(data.length<page){complete=true;break;}
      }
      if(!complete||!seen.size)throw Error('INCOMPLETE_PAGINATION');
      monthly=raw;loaded=true;selectFilters();render();status('loaded');
    }catch(e){console.error('A17.2 sales snapshot',e);clear();status('failed');}
    finally{loading=false;if($('a17Refresh'))$('a17Refresh').disabled=false;}
  }
  const shift=(key,months)=>{const [y,m]=key.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+months,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');};
  const make=(tag,attrs={},txt)=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(txt!==undefined)el.textContent=txt;return el;};
  function render(){if(!loaded||!mayView()){clear();status('blocked');return;}const year=$('a17Year')?.value;if(!year)return;const month=$('a17Month')?.value||'',mode=$('a17Compare')?.value||'previous';
    const periods=month?[year+'-'+month]:Array.from({length:12},(_,i)=>year+'-'+String(i+1).padStart(2,'0'));
    const today=new Date();const localYear=today.getFullYear(),localMonth=today.getMonth()+1;
    // Exclude future periods; partial current calendar month/year is explicitly not a reliable growth comparison.
    const used=periods.filter(p=>p<=`${localYear}-${String(localMonth).padStart(2,'0')}`),step=mode==='yoy'?-12:-used.length;
    const cells=used.map((key,i)=>({key,base:shift(key,mode==='yoy'?-12:step),current:monthly.get(key)||0,reference:monthly.get(shift(key,mode==='yoy'?-12:step))||0}));
    const sc=cells.reduce((n,r)=>n+r.current,0),sb=cells.reduce((n,r)=>n+r.reference,0);
    const partial=cells.some(r=>r.key===`${localYear}-${String(localMonth).padStart(2,'0')}`)||cells.some(r=>r.base===`${localYear}-${String(localMonth).padStart(2,'0')}`);
    const growth=!partial&&sb>0?((sc-sb)/sb*100).toFixed(1)+'%':tr('unavailable');
    $('a17Kpis').replaceChildren();for(const [k,v] of [['total',amount(sc)],['growth',growth],['periodMonths',String(cells.length)]]){const card=make('div',{class:'a17-kpi'});card.append(make('span',{},tr(k)),make('strong',{},v));$('a17Kpis').append(card);}
    const root=$('a17SalesChart');root.replaceChildren();if(!cells.length){root.textContent=tr('noData');return;}
    // SVG is intentionally informational only: no external charting library or inline event handlers.
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 900 275');svg.setAttribute('role','img');svg.setAttribute('aria-label',tr('salesTitle'));svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    const create=(tag,props)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(props))el.setAttribute(k,String(v));return el;};
    const max=Math.max(1,...cells.flatMap(r=>[r.current,r.reference]));const w=820,h=198,ox=50,oy=18;const x=i=>ox+(cells.length===1?w/2:i*w/(cells.length-1));const y=v=>oy+h-(v/max*h);
    for(let j=0;j<=4;j++){const yy=oy+j*h/4;svg.append(create('line',{x1:ox,y1:yy,x2:ox+w,y2:yy,stroke:'currentColor','stroke-opacity':'.12'}));}
    for(const [key,color] of [['reference','#a3aab5'],['current','#16886c']]){
      const path=cells.map((r,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(r[key]).toFixed(2)).join(' ');
      svg.append(create('path',{d:path,fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'}));
      cells.forEach((r,i)=>svg.append(create('circle',{cx:x(i),cy:y(r[key]),r:4,fill:color})));
    }
    cells.forEach((r,i)=>{const tx=create('text',{x:x(i),y:252,'text-anchor':'middle','font-size':cells.length>8?12:14,fill:'currentColor'});tx.textContent=r.key.slice(5);svg.append(tx);});root.append(svg);
    const body=$('a17SalesBody'),foot=$('a17SalesFoot');body.replaceChildren();foot.replaceChildren();
    for(const r of cells){const trEl=make('tr');for(const cell of [r.key,amount(r.current),amount(r.reference),amount(r.current-r.reference)])trEl.append(make('td',{},cell));body.append(trEl);}
    const row=make('tr');for(const cell of [tr('totalRow'),amount(sc),amount(sb),amount(sc-sb)])row.append(make('td',{},cell));foot.append(row);
    if(partial)status('incomplete');else if(!sb)status('zeroBase');else status('loaded');
  }
  function activate(){if(!mayView()){clear();status('blocked');return;}if(!loaded)load();else render();}
  document.addEventListener('DOMContentLoaded',()=>{$('a17Refresh')?.addEventListener('click',load);$('a17Apply')?.addEventListener('click',render);$('a17Compare')?.addEventListener('change',render);$('a17SalesToggle')?.addEventListener('click',()=>{const pane=$('a17SalesDetails');if(!pane)return;pane.hidden=!pane.hidden;$('a17SalesToggle').setAttribute('aria-expanded',String(!pane.hidden));$('a17SalesToggle').textContent=tr(pane.hidden?'showDetails':'hideDetails');});});
  document.addEventListener('petatoe:language-changed',()=>{if(loaded){selectFilters();render();}});
  window.AdvancedAnalyticsUI={activate,render};
})();

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const page = 500, maxPages = 200;
  let records = [], ready = false, busy = false;
  const sizes = { cars: 10, teams: 10, details: 10 };
  const currency = n => `${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;", ">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));
  const toCents = amount => { const n = Number(amount); if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n * 100))) throw Error("قيمة مالية غير صالحة"); return Math.round(n * 100); };
  const validDate = raw => { const s = String(raw ?? "").slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(`${s}T00:00:00Z`).toISOString?.() === undefined) return ""; return s; };
  const option = (id, value, label) => { const node = document.createElement("option"); node.value = value; node.textContent = label; $(id).appendChild(node); };
  const value = id => $(id)?.value ?? "";
  const permitted = () => window.PermissionEngine?.canView?.("carsTeamsReports") === true && window.PermissionEngine?.canView?.("salesReports") === true;
  const status = txt => { if ($("a15Status")) $("a15Status").textContent = txt; };
  async function load() {
    if (busy || !permitted()) return;
    busy = true; ready = false; records = [];
    $("a15Refresh").disabled = true;
    status("جاري تحميل جميع صفحات المبيعات من المصدر المعتمد...");
    try {
      if (!window.customerSupabase?.rpc || navigator.onLine === false) throw Error("يلزم الاتصال بالمصدر لإظهار بيانات مكتملة.");
      const rows = [], seen = new Set(); let complete = false;
      for (let p=0; p<maxPages; p++) {
        const {data,error} = await window.customerSupabase.rpc("sales_reports_rows_r44r38r20r35").range(p*page, (p+1)*page-1);
        if (error) throw error;
        if (!Array.isArray(data)) throw Error("استجابة غير متوقعة من مصدر المبيعات");
        for (const row of data) {
          const key = `${row.is_historical ? "h":"c"}:${row.row_id}`;
          if (!row.row_id || seen.has(key)) throw Error("معرف مبيعات مفقود أو مكرر");
          seen.add(key);
          const date = String(row.invoice_date ?? "").slice(0,10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+"T00:00:00Z"))) throw Error("تاريخ مبيعات غير صالح");
          rows.push({key, date, cents:toCents(row.amount_incl_tax), invoice:String(row.invoice_number??""), carId:String(row.car_id??""),car:String(row.car_name||row.plate_number||"غير منسوبة لسيارة"),teamId:String(row.team_id??""),team:String(row.team_name||"غير منسوبة لفرقة")});
        }
        if (data.length < page) { complete = true; break; }
      }
      if (!complete) throw Error("لم يكتمل تحميل المبيعات؛ تم منع عرض تقرير ناقص");
      records = rows; ready = true;
      populate(); render();
    } catch(e) { console.error("A15 sales reporting",e); status(`تعذر إظهار التقرير: ${e.message}`); clear(); }
    finally { busy = false; $("a15Refresh").disabled = false; }
  }
  function populate() {
    const configs = [
      ["a15Year", [...new Set(records.map(r=>r.date.slice(0,4)))].sort().reverse().map(y=>[y,y]), "كل السنوات"],
      ["a15Month", Array.from({length:12},(_,i)=>[String(i+1).padStart(2,"0"), new Intl.DateTimeFormat("ar-EG",{month:"long"}).format(new Date(2026,i,1))]), "كل الشهور"],
      ["a15Car", new Map(records.filter(r=>r.carId).map(r=>[r.carId, r.car])).entries(), "كل السيارات"],
      ["a15Team", new Map(records.filter(r=>r.teamId).map(r=>[r.teamId, r.team])).entries(), "كل الفرق"]
    ];
    for (const [id, list, label] of configs) {
      const prior=value(id); $(id).replaceChildren(); option(id,"",label);
      for(const [k,v] of list) option(id,String(k),v);
      if ([...$(id).options].some(o=>o.value===prior)) $(id).value=prior;
    }
  }
  function subset() { const year=value("a15Year"), month=value("a15Month"), car=value("a15Car"), team=value("a15Team");return records.filter(r=>(!year||r.date.startsWith(year))&&(!month||r.date.slice(5,7)===month)&&(!car||r.carId===car)&&(!team||r.teamId===team)); }
  function grouping(rows, field) { const map=new Map(); for(const r of rows){const id = field==="car" ? r.carId : field==="team" ? r.teamId : r.date.slice(0,7); const label=field==="car"?r.car:field==="team"?r.team:id;const key=id||`__unassigned_${field}`;if(!map.has(key))map.set(key,{label, cents:0,count:0});const item=map.get(key); item.cents+=r.cents;item.count++;}return [...map.values()].sort((a,b)=>b.cents-a.cents); }
  function cells(body, rows, limit, map) { $(body).innerHTML = rows.slice(0,limit).map(map).join("") || '<tr><td colspan="5">لا توجد بيانات للفلاتر المختارة</td></tr>'; }
  const td = fields => `<tr>${fields.map(f=>`<td>${escapeHtml(f)}</td>`).join("")}</tr>`;
  function clear(){ $("a15Kpis").replaceChildren(); for(const id of ["a15CarsBody","a15TeamsBody","a15MonthsBody","a15DetailsBody"]) $(id).replaceChildren(); }
  function render() {
    if(!ready || !permitted()){ clear(); return; }
    const rows=subset(), cars=grouping(rows,"car"), teams=grouping(rows,"team"), months=grouping(rows,"month").sort((a,b)=>a.label.localeCompare(b.label)), total=rows.reduce((s,r)=>s+r.cents,0);
    const carSum=cars.reduce((s,r)=>s+r.cents,0), teamSum=teams.reduce((s,r)=>s+r.cents,0), monthSum=months.reduce((s,r)=>s+r.cents,0);
    if([carSum,teamSum,monthSum].some(n=>n!==total)){clear();status("فشل تطابق إجمالي المبيعات بين التقارير. لم تُعرض النتائج.");return;}
    $("a15Kpis").innerHTML=[ ["إجمالي المبيعات شامل الضريبة",currency(total)],["صفوف المبيعات",rows.length.toLocaleString("en-US")],["السيارات ذات مبيعات منسوبة",new Set(rows.filter(r=>r.carId).map(r=>r.carId)).size],["الفرق ذات مبيعات منسوبة",new Set(rows.filter(r=>r.teamId).map(r=>r.teamId)).size] ].map(([name,v])=>`<div class="a15-kpi"><span>${escapeHtml(name)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
    cells("a15CarsBody",cars,sizes.cars,r=>td([r.label,r.count,currency(r.cents)]));
    cells("a15TeamsBody",teams,sizes.teams,r=>td([r.label,r.count,currency(r.cents)]));
    cells("a15MonthsBody",months,Infinity,r=>td([r.label,r.count,currency(r.cents)]));
    const detail=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
    cells("a15DetailsBody",detail,sizes.details,r=>td([r.date,r.invoice||"—",r.car,r.team,currency(r.cents)]));
    [["a15CarsMore",cars.length,sizes.cars],["a15TeamsMore",teams.length,sizes.teams],["a15DetailsMore",detail.length,sizes.details]].forEach(([id,len,limit])=>{$(id).hidden=len<=limit;});
    status(`تم تحميل ${records.length.toLocaleString("en-US")} صف مبيعات مكتمل. المعروض ${rows.length.toLocaleString("en-US")} صف حسب الفلاتر؛ التجميعات غير المنسوبة مفصولة، ولا تمثل صفوف المبيعات عدد الفواتير.`);
  }
  let bound=false;
  function bind(){if(bound)return;bound=true;$("a15Refresh").addEventListener("click",load);$("a15Apply").addEventListener("click",()=>{sizes.cars=sizes.teams=sizes.details=10;render();});$("a15Reset").addEventListener("click",()=>{for(const id of ["a15Year","a15Month","a15Car","a15Team"])$(id).value="";sizes.cars=sizes.teams=sizes.details=10;render();});for(const [btn,field] of [["a15CarsMore","cars"],["a15TeamsMore","teams"],["a15DetailsMore","details"]])$(btn).addEventListener("click",()=>{sizes[field]+=10;render();});}
  async function activate(){bind();if(!permitted()){clear();status("ليس لديك صلاحية عرض تقارير السيارات والفرق وتقارير المبيعات.");return;}if(!ready)await load();else render();}
  window.CarsTeamsReportsUI=Object.freeze({activate,render});
})();

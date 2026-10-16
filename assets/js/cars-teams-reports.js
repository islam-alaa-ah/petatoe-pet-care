(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const t = (key, vars={}) => { const v=window.PetatoeLocalization?.t?.(`carsTeamsReports.${key}`,vars); return v&&!/^\[.+\]$/.test(v)?v:`carsTeamsReports.${key}`; };
  const num = x => Number(x).toLocaleString("en-US");
  const page = 500, maxPages = 200;
  let records = [], ready = false, busy = false, operational=null, operationalBusy=false;
  let operationDetailLimit=10;
  const sizes = { cars: 10, teams: 10, details: 10 };
  const currency = n => `${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;", ">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));
  const toCents = amount => { const n = Number(amount); if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n * 100))) throw Error(t("invalidMoney")); return Math.round(n * 100); };
  const validDate = raw => { const s = String(raw ?? "").slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(`${s}T00:00:00Z`).toISOString?.() === undefined) return ""; return s; };
  const option = (id, value, label) => { const node = document.createElement("option"); node.value = value; node.textContent = label; $(id).appendChild(node); };
  const value = id => $(id)?.value ?? "";
  const permitted = () => window.PermissionEngine?.canView?.("carsTeamsReports") === true && window.PermissionEngine?.canView?.("salesReports") === true;
  const status = txt => { if ($("a15Status")) $("a15Status").textContent = txt; };
  async function load() {
    if (busy || !permitted()) return;
    busy = true; ready = false; records = [];
    $("a15Refresh").disabled = true;
    status(t("loading"));
    try {
      if (!window.customerSupabase?.rpc || navigator.onLine === false) throw Error(t("needOnline"));
      const rows = [], seen = new Set(); let complete = false;
      for (let p=0; p<maxPages; p++) {
        const {data,error} = await window.customerSupabase.rpc("sales_reports_rows_r44r38r20r35").range(p*page, (p+1)*page-1);
        if (error) throw error;
        if (!Array.isArray(data)) throw Error(t("unexpected"));
        for (const row of data) {
          const key = `${row.is_historical ? "h":"c"}:${row.row_id}`;
          if (!row.row_id || seen.has(key)) throw Error(t("duplicate"));
          seen.add(key);
          const date = String(row.invoice_date ?? "").slice(0,10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+"T00:00:00Z"))) throw Error(t("invalidDate"));
          rows.push({key, date, cents:toCents(row.amount_incl_tax), invoice:String(row.invoice_number??""), carId:String(row.car_id??""),car:String(row.car_name||row.plate_number||t("unassignedCar")),teamId:String(row.team_id??""),team:String(row.team_name||t("unassignedTeam"))});
        }
        if (data.length < page) { complete = true; break; }
      }
      if (!complete) throw Error(t("incomplete"));
      records = rows; ready = true;
      populate(); render();
    } catch(e) { console.error("A15 sales reporting",e); status(t("failed",{reason:e.message})); clear(); }
    finally { busy = false; $("a15Refresh").disabled = false; }
  }
  function populate() {
    const configs = [
      ["a15Year", [...new Set(records.map(r=>r.date.slice(0,4)))].sort().reverse().map(y=>[y,y]), t("allYears")],
      ["a15Month", Array.from({length:12},(_,i)=>[String(i+1).padStart(2,"0"), new Intl.DateTimeFormat(window.PetatoeLocalization?.effectiveLanguage?.()==="en"?"en-US":"ar-EG",{month:"long"}).format(new Date(2026,i,1))]), t("allMonths")],
      ["a15Car", new Map(records.filter(r=>r.carId).map(r=>[r.carId, r.car])).entries(), t("allCars")],
      ["a15Team", new Map(records.filter(r=>r.teamId).map(r=>[r.teamId, r.team])).entries(), t("allTeams")]
    ];
    for (const [id, list, label] of configs) {
      const prior=value(id); $(id).replaceChildren(); option(id,"",label);
      for(const [k,v] of list) option(id,String(k),v);
      if ([...$(id).options].some(o=>o.value===prior)) $(id).value=prior;
    }
  }
  function subset() { const year=value("a15Year"), month=value("a15Month"), car=value("a15Car"), team=value("a15Team");return records.filter(r=>(!year||r.date.startsWith(year))&&(!month||r.date.slice(5,7)===month)&&(!car||r.carId===car)&&(!team||r.teamId===team)); }
  function grouping(rows, field) { const map=new Map(); for(const r of rows){const id = field==="car" ? r.carId : field==="team" ? r.teamId : r.date.slice(0,7); const label=field==="car"?r.car:field==="team"?r.team:id;const key=id||`__unassigned_${field}`;if(!map.has(key))map.set(key,{label, cents:0,count:0});const item=map.get(key); item.cents+=r.cents;item.count++;}return [...map.values()].sort((a,b)=>b.cents-a.cents); }
  function cells(body, rows, limit, map) { $(body).innerHTML = rows.slice(0,limit).map(map).join("") || `<tr><td colspan="5">${escapeHtml(t("none"))}</td></tr>`; }
  const td = fields => `<tr>${fields.map(f=>`<td>${escapeHtml(f)}</td>`).join("")}</tr>`;
  const footer = (body, fields) => { const target=$(`${body}Total`); if (target) target.innerHTML=td(fields); };
  const pct=(done,all)=>`${(all?done/all*100:0).toFixed(1)}%`;
  function clear(){ $("a15Kpis").replaceChildren(); for(const id of ["a15CarsBody","a15TeamsBody","a15MonthsBody","a15DetailsBody"]){ $(id).replaceChildren(); $(`${id}Total`)?.replaceChildren(); } }
  function render() {
    if(!ready || !permitted()){ clear(); return; }
    const rows=subset(), cars=grouping(rows,"car"), teams=grouping(rows,"team"), months=grouping(rows,"month").sort((a,b)=>a.label.localeCompare(b.label)), total=rows.reduce((s,r)=>s+r.cents,0);
    const carSum=cars.reduce((s,r)=>s+r.cents,0), teamSum=teams.reduce((s,r)=>s+r.cents,0), monthSum=months.reduce((s,r)=>s+r.cents,0);
    if([carSum,teamSum,monthSum].some(n=>n!==total)){clear();status(t("mismatch"));return;}
    $("a15Kpis").innerHTML=[ [t("gross"),currency(total)],[t("rows"),rows.length.toLocaleString("en-US")],[t("kpiCars"),new Set(rows.filter(r=>r.carId).map(r=>r.carId)).size],[t("kpiTeams"),new Set(rows.filter(r=>r.teamId).map(r=>r.teamId)).size] ].map(([name,v])=>`<div class="a15-kpi"><span>${escapeHtml(name)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
    cells("a15CarsBody",cars,sizes.cars,r=>td([r.label,r.count,currency(r.cents)]));
    cells("a15TeamsBody",teams,sizes.teams,r=>td([r.label,r.count,currency(r.cents)]));
    cells("a15MonthsBody",months,Infinity,r=>td([r.label,r.count,currency(r.cents)]));
    footer("a15CarsBody",[t("total"),num(rows.length),currency(total)]);
    footer("a15TeamsBody",[t("total"),num(rows.length),currency(total)]);
    footer("a15MonthsBody",[t("total"),num(rows.length),currency(total)]);
    const detail=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
    cells("a15DetailsBody",detail,sizes.details,r=>td([r.date,r.invoice||"—",r.car,r.team,currency(r.cents)]));
    footer("a15DetailsBody",[t("total"),"—","—",num(rows.length),currency(total)]);
    [["a15CarsMore",cars.length,sizes.cars],["a15TeamsMore",teams.length,sizes.teams],["a15DetailsMore",detail.length,sizes.details]].forEach(([id,len,limit])=>{$(id).hidden=len<=limit;});
    status(t("statusLoaded",{all:num(records.length),shown:num(rows.length)}));
  }

  const operationAllowed = () => permitted() && window.PermissionEngine?.canView?.("installationReports") === true;
  function opStatus(message){ const el=$("a15OperationsStatus");if(el)el.textContent=message; }
  function opGroup(rows, property){const groups=new Map();for(const row of rows){const id=String(row[property]||"");const name=String(row[property==="teamCarId"?"teamCarName":"teamName"]||"").trim()||t("unassigned");const key=id||"__unassigned";if(!groups.has(key))groups.set(key,{name,total:0,completed:0,cancelled:0,quantity:0});const item=groups.get(key);item.total++;const cancelled=["ملغي","ملغاة"].includes(String(row.status||"").trim());const completed=row.status==="مكتمل"||row.isInvoiced===true;if(cancelled)item.cancelled++;else if(completed)item.completed++;item.quantity+=Number(row.executedQuantity||0);}return [...groups.values()].sort((a,b)=>b.total-a.total);}
  function renderOperations(){if(!operational||!operationAllowed()){for(const id of ["a15OperationsKpis","a15OpCarBody","a15OpTeamBody","a15OpMonthBody","a15OpDetailsBody","a15ProductivityCarsBody","a15ProductivityTeamsBody","a15WorkloadCarBody","a15WorkloadTeamBody"]){$(id)?.replaceChildren();$(`${id}Total`)?.replaceChildren();}return;}
    const year=value("a15Year"),month=value("a15Month"),car=value("a15Car"),team=value("a15Team");
    const rows=operational.filter(r=>{const date=String(r.scheduledDate||"").slice(0,10);return (!year||date.startsWith(year))&&(!month||date.slice(5,7)===month)&&(!car||String(r.teamCarId||"")===car)&&(!team||String(r.teamId||"")===team);});
    const completed=rows.filter(r=>r.status==="مكتمل"||r.isInvoiced===true).length,cancelled=rows.filter(r=>["ملغي","ملغاة"].includes(String(r.status||"").trim())).length,qty=rows.reduce((v,r)=>v+Number(r.executedQuantity||0),0);
    const values=[["appointments",rows.length],["completed",completed],["cancelled",cancelled],["completionRate",rows.length?`${(completed/rows.length*100).toFixed(1)}%`:"0%"],["servicesExecuted",qty]];
    $("a15OperationsKpis").innerHTML=values.map(([key,value])=>`<div class="a15-kpi"><span>${escapeHtml(t(key))}</span><strong>${escapeHtml(typeof value==="number"?num(value):value)}</strong></div>`).join("");
    const draw=(id,field)=>{const arr=opGroup(rows,field);$(id).innerHTML=arr.length?arr.map(x=>td([x.name,num(x.total),num(x.completed),num(x.cancelled),`${(x.total?x.completed/x.total*100:0).toFixed(1)}%`,num(x.quantity)])).join(""):`<tr><td colspan="6">${escapeHtml(t("none"))}</td></tr>`;};
    draw("a15OpCarBody","teamCarId");draw("a15OpTeamBody","teamId");
    // Quantities come from operationalReport; do not infer service types or financial amounts.
    const productivity=(target,field)=>{
      const groups=opGroup(rows,field);
      $(target).innerHTML=groups.length?groups.map(g=>td([g.name,num(g.completed),num(g.quantity),g.completed?(g.quantity/g.completed).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—"])).join(""):`<tr><td colspan="4">${escapeHtml(t("none"))}</td></tr>`;
      const totalCompleted=groups.reduce((n,g)=>n+g.completed,0),totalQty=groups.reduce((n,g)=>n+g.quantity,0);
      footer(target,[t("total"),num(totalCompleted),num(totalQty),totalCompleted?(totalQty/totalCompleted).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—"]);
    };
    // A15.2.7: Workload metrics are appointment-only. Distinct active calendar days
    // are counted separately for each vehicle/team, not summed across groups.
    const workDay = r => {const date=String(r.scheduledDate||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return "";const time=Date.parse(`${date}T00:00:00Z`);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date?date:"";};
    const avgDay = (appointments, days) => days ? (appointments/days).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
    const workload = (target,field) => {
      const groups=new Map(), allDays=new Set();
      for(const r of rows){
        const id=String(r[field]||"")||"__unassigned";
        if(!groups.has(id))groups.set(id,{name:String(r[field==="teamCarId"?"teamCarName":"teamName"]||"").trim()||t("unassigned"),total:0,done:0,days:new Set()});
        const g=groups.get(id);g.total++;
        const cancelled=["ملغي","ملغاة"].includes(String(r.status||"").trim());
        if(!cancelled&&(r.status==="مكتمل"||r.isInvoiced===true))g.done++;
        const day=workDay(r);if(day){g.days.add(day);allDays.add(day);}
      }
      const ordered=[...groups.values()].sort((a,b)=>b.total-a.total);
      $(target).innerHTML=ordered.length?ordered.map(g=>td([g.name,num(g.total),num(g.days.size),avgDay(g.total,g.days.size),num(g.done),pct(g.done,g.total)])).join(""):`<tr><td colspan="6">${escapeHtml(t("none"))}</td></tr>`;
      // The global day count is a union, never the sum of per-resource active days.
      const done=ordered.reduce((n,g)=>n+g.done,0);
      footer(target,[t("total"),num(rows.length),num(allDays.size),avgDay(rows.length,allDays.size),num(done),pct(done,rows.length)]);
    };
    workload("a15WorkloadCarBody","teamCarId");
    workload("a15WorkloadTeamBody","teamId");
    productivity("a15ProductivityCarsBody","teamCarId");
    productivity("a15ProductivityTeamsBody","teamId");
    const opCompleted=opGroup(rows,"teamCarId").reduce((n,g)=>n+g.completed,0);const opCancelled=opGroup(rows,"teamCarId").reduce((n,g)=>n+g.cancelled,0);
    const opTotals=[t("total"),num(rows.length),num(opCompleted),num(opCancelled),pct(opCompleted,rows.length),num(qty)];
    footer("a15OpCarBody",opTotals);footer("a15OpTeamBody",opTotals);
    const monthGroups=new Map();
    for(const r of rows){const date=String(r.scheduledDate||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;const key=date.slice(0,7);if(!monthGroups.has(key))monthGroups.set(key,{key,total:0,done:0,cancel:0,qty:0});const g=monthGroups.get(key);g.total++;const isCancelled=["ملغي","ملغاة"].includes(String(r.status||"").trim());if(isCancelled)g.cancel++;else if(r.status==="مكتمل"||r.isInvoiced===true)g.done++;g.qty+=Number(r.executedQuantity||0);}
    const monthRows=[...monthGroups.values()].sort((a,b)=>a.key.localeCompare(b.key));
    $("a15OpMonthBody").innerHTML=monthRows.length?monthRows.map(g=>td([g.key,num(g.total),num(g.done),num(g.cancel),`${(g.total?g.done/g.total*100:0).toFixed(1)}%`,num(g.qty)])).join(""):`<tr><td colspan="6">${escapeHtml(t("none"))}</td></tr>`;
    footer("a15OpMonthBody",[t("total"),num(monthRows.reduce((n,g)=>n+g.total,0)),num(monthRows.reduce((n,g)=>n+g.done,0)),num(monthRows.reduce((n,g)=>n+g.cancel,0)),pct(monthRows.reduce((n,g)=>n+g.done,0),monthRows.reduce((n,g)=>n+g.total,0)),num(monthRows.reduce((n,g)=>n+g.qty,0))]);
    const dated=[...rows].sort((a,b)=>String(b.scheduledDate||"").localeCompare(String(a.scheduledDate||"")));
    $("a15OpDetailsBody").innerHTML=dated.length?dated.slice(0,operationDetailLimit).map(r=>td([String(r.scheduledDate||"").slice(0,10)||"—",String(r.teamCarName||t("unassignedCar")),String(r.teamName||t("unassignedTeam")),String(r.status||t("unassigned")),num(Number(r.executedQuantity||0))])).join(""):`<tr><td colspan="5">${escapeHtml(t("none"))}</td></tr>`;
    $("a15OpDetailsMore").hidden=dated.length<=operationDetailLimit;
    opStatus(t("operationLoaded",{count:num(rows.length)}));
  }
  async function loadOperations(){if(operationalBusy)return;if(!operationAllowed()){opStatus(t("operationNoPermission"));return;}
    operationalBusy=true;$("a15OperationsRefresh").disabled=true;opStatus(t("operationLoading"));
    try{if(navigator.onLine===false)throw Error(t("needOnline"));const result=await window.InstallationsServiceSafe?.operationalReport?.({});if(!result||!Array.isArray(result.rows))throw Error(t("unexpected"));operational=result.rows;renderOperations();}
    catch(e){operational=null;renderOperations();opStatus(t("operationFailed",{reason:e.message}));}
    finally{operationalBusy=false;$("a15OperationsRefresh").disabled=false;}
  }
  let bound=false;
  function bind(){if(bound)return;bound=true;$("a15OpDetailsMore").addEventListener("click",()=>{operationDetailLimit+=10;renderOperations();});$("a15OperationsRefresh").addEventListener("click",loadOperations);window.addEventListener("petatoe-language-changed",()=>{if(ready){populate();render();}if(operational)renderOperations();else if(operationAllowed())opStatus(t("operationPending"));});$("a15Refresh").addEventListener("click",load);$("a15Apply").addEventListener("click",()=>{sizes.cars=sizes.teams=sizes.details=10;operationDetailLimit=10;render();renderOperations();});$("a15Reset").addEventListener("click",()=>{for(const id of ["a15Year","a15Month","a15Car","a15Team"])$(id).value="";sizes.cars=sizes.teams=sizes.details=10;operationDetailLimit=10;render();renderOperations();});for(const [btn,field] of [["a15CarsMore","cars"],["a15TeamsMore","teams"],["a15DetailsMore","details"]])$(btn).addEventListener("click",()=>{sizes[field]+=10;render();});}
  async function activate(){bind();if(!permitted()){clear();status(t("noPermission"));return;}if(!ready)await load();else render();if(operationAllowed()){if(operational)renderOperations();else opStatus(t("operationPending"));}else opStatus(t("operationNoPermission"));}
  window.CarsTeamsReportsUI=Object.freeze({activate,render});
})();

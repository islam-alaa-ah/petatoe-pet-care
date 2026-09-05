(function(){
  'use strict';
  const CACHE_KEY='sea-vibe:snapshot:v1';
  const CACHE_TTL=15*60*1000;
  const STALE_MAX=365*24*60*60*1000;
  const ALL_SECTIONS=['trips','customers','expenses','assets','tripTypes','paymentMethods','expenseCatalog','permitFees','commissionRules','commissionEmployees','attachments','zawelTransactions','zawelBalance','fuelTransactions','fuelBalance','fuelSettlementConfig','fuelSettlements','treasuryMovements'];
  const LEGACY_CREATE_ACTIONS=new Set(['trip_create','asset_create','expense_create','expense_batch_create','reference_create','zawel_topup']);
  let memory=null;
  let readStatus={source:'none',updatedAt:0,stale:false};
  const pendingSyncSections=new Set();

  function client(){ if(!window.customerSupabase) throw new Error('اتصال Supabase غير جاهز.'); return window.customerSupabase; }
  function permission(screen,action='view'){ if(!window.CustomerPermissions?.requireAction?.(screen,action,{silent:true})) throw new Error(`Permission denied: ${screen}.${action}`); }
  async function namespace(){ const id=window.KYUMOfflineSessionStore?.currentUserId?.()||window.CustomerAuth?.getState?.().profile?.id; return `user:${id||'anonymous'}`; }
  async function unwrap(req,msg){ const {data,error}=await req; if(error) throw new Error(`${msg}: ${error.message}`); return data; }
  const num=v=>Number(v||0);
  const nowIso=()=>new Date().toISOString();
  const localDateIso=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const localId=prefix=>`local:${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const mapRef=r=>({id:r.id,nameAr:r.name_ar||'',nameEn:r.name_en||'',isActive:r.is_active!==false,systemKey:r.system_key||'',isSystem:!!r.is_system,fuelCostAmount:num(r.fuel_cost_amount),requiresCustomer:r.requires_customer!==false,serialSeriesKey:r.serial_series_key||'standard',updatedAt:r.updated_at||r.created_at||''});
  const mapTrip=r=>({id:r.id,serial:r.trip_serial||'',treasuryMovementSerial:r.treasury_movement_serial||'',date:r.trip_date||'',startTime:String(r.start_time||'').slice(0,5),durationHours:num(r.duration_hours),peopleCount:num(r.people_count),tripTypeId:r.trip_type_id||'',customerId:r.customer_id||'',customerNumber:r.customer_number||'',customerName:r.customer_name||'',totalValue:num(r.total_value),notes:r.notes||'',status:r.status||'open',closedAt:r.closed_at||'',createdAt:r.created_at||'',updatedAt:r.updated_at||'',tripExpenses:num(r.trip_expenses),netProfit:num(r.net_profit)});
  const mapCustomer=r=>({id:r.id,number:r.customer_number||'',name:r.full_name||'',notes:r.notes||'',isActive:r.is_active!==false,hasBeenUsed:r.has_been_used===true,createdAt:r.created_at||'',updatedAt:r.updated_at||''});
  const mapAsset=r=>({id:r.id,code:r.asset_code||'',name:r.asset_name||'',initialValue:num(r.initial_value),capitalizedExpenses:num(r.capitalized_expenses),currentValue:num(r.current_value??r.initial_value),notes:r.notes||'',isActive:r.is_active!==false,createdAt:r.created_at||'',updatedAt:r.updated_at||''});
  const mapExpense=r=>({id:r.id,scope:r.expense_scope,tripId:r.trip_id||'',assetId:r.asset_id||'',catalogId:r.expense_catalog_id||'',date:r.expense_date||'',amount:num(r.amount),paymentMethodId:r.payment_method_id||'',notes:r.notes||'',movementGroupId:r.movement_group_id||'',movementSerial:r.movement_serial||'',systemGenerated:!!r.is_system_generated,systemKey:r.system_key||'',commissionRuleId:r.commission_rule_id||'',commissionNameAr:r.commission_name_ar_snapshot||'',commissionNameEn:r.commission_name_en_snapshot||'',commissionBeneficiaryType:r.commission_beneficiary_type_snapshot||'',commissionBeneficiaryName:r.commission_beneficiary_name_snapshot||'',commissionCalculationType:r.commission_calculation_type_snapshot||'',commissionCalculationValue:num(r.commission_calculation_value_snapshot),commissionTripValue:num(r.commission_trip_value_snapshot),createdAt:r.created_at||'',updatedAt:r.updated_at||''});
  const mapCommissionRule=r=>({id:r.id,nameAr:r.name_ar||'',nameEn:r.name_en||'',beneficiaryType:r.beneficiary_type||'',employeeId:r.employee_id||'',brokerName:r.broker_name||'',beneficiaryName:r.beneficiary_name||'',calculationType:r.calculation_type||'fixed',calculationValue:num(r.calculation_value),tripTypeIds:Array.isArray(r.trip_type_ids)?r.trip_type_ids:[],isActive:r.is_active!==false,hasBeenUsed:r.has_been_used===true,createdAt:r.created_at||'',updatedAt:r.updated_at||''});
  const mapCommissionEmployee=r=>({id:r.id,name:r.full_name||''});
  const mapAttachment=r=>({id:r.id,expenseId:r.expense_id,path:r.storage_path,fileName:r.file_name,mimeType:r.mime_type||'',fileSize:num(r.file_size),createdAt:r.created_at||''});
  const sortTrips=rows=>[...(rows||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.serial).localeCompare(String(a.serial)));
  const mapZawel=r=>({id:r.id,type:r.transaction_type,pointsDelta:num(r.points_delta),cashAmount:num(r.cash_amount),tripId:r.trip_id||'',reference:r.reference||'',treasuryMovementSerial:r.treasury_movement_serial||'',notes:r.notes||'',transactionDate:r.transaction_date||String(r.created_at||'').slice(0,10),createdAt:r.created_at||'',updatedAt:r.updated_at||r.created_at||''});
  const mapFuel=r=>({id:r.id,type:r.transaction_type,litersDelta:r.liters_delta==null?null:num(r.liters_delta),valueDelta:num(r.value_delta),unitPriceSnapshot:r.unit_price_snapshot==null?null:num(r.unit_price_snapshot),valuationStatus:r.valuation_status||'valued',tripId:r.trip_id||'',reference:r.reference||'',treasuryMovementSerial:r.treasury_movement_serial||'',notes:r.notes||'',transactionDate:r.transaction_date||String(r.created_at||'').slice(0,10),createdAt:r.created_at||'',updatedAt:r.updated_at||r.created_at||''});
  const mapFuelSettlement=r=>({id:r.id,cutoffDate:r.cutoff_date||'',previousCutoffDate:r.previous_cutoff_date||'',balanceBeforeLiters:num(r.balance_before_liters),balanceBeforeValue:num(r.balance_before_value),unitPriceSnapshot:num(r.unit_price_snapshot),peopleWeightPct:num(r.people_weight_pct),hoursWeightPct:num(r.hours_weight_pct),valuePerPerson:num(r.value_per_person),valuePerHour:num(r.value_per_hour),eligibleTripCount:num(r.eligible_trip_count),totalPeople:num(r.total_people),totalHours:num(r.total_hours),ledgerTransactionId:r.ledger_transaction_id||'',createdBy:r.created_by||'',createdAt:r.created_at||''});
  const mapTreasury=r=>({id:r.movement_id,serial:r.movement_serial||'',date:r.movement_date||String(r.movement_at||'').slice(0,10),at:r.movement_at||'',type:r.movement_type||'',amount:num(r.amount),reference:r.reference||'',description:r.description||'',tripId:r.trip_id||'',assetId:r.asset_id||'',sourceKind:r.source_kind||'',sourceId:r.source_id||'',expenseGroupId:r.expense_group_id||''});
  const blank=()=>({trips:[],customers:[],expenses:[],assets:[],tripTypes:[],paymentMethods:[],expenseCatalog:[],permitFees:[],commissionRules:[],commissionEmployees:[],commissionRulesReady:false,attachments:[],zawelTransactions:[],zawelBalance:{balancePoints:0,totalChargedPoints:0,totalDeductedPoints:0,totalTopupCost:0},fuelTransactions:[],fuelBalance:{balanceLiters:0,balanceValue:0,totalTopupLiters:0,totalTopupValue:0,totalDeductedLiters:0,totalDeductedValue:0,averageUnitPrice:0,pendingValuationCount:0,unconfiguredTripCount:0,historicalReviewCount:0},fuelSettlementConfig:{peopleWeightPct:50,hoursWeightPct:50,updatedAt:''},fuelSettlements:[],treasuryMovements:[]});
  function normalizeSnapshot(value){const base=blank(),raw=value&&typeof value==='object'?value:{};return{...base,...raw,customers:Array.isArray(raw.customers)?raw.customers:[],commissionRules:Array.isArray(raw.commissionRules)?raw.commissionRules:[],commissionEmployees:Array.isArray(raw.commissionEmployees)?raw.commissionEmployees:[],commissionRulesReady:raw.commissionRulesReady===true,zawelTransactions:Array.isArray(raw.zawelTransactions)?raw.zawelTransactions:[],zawelBalance:{...base.zawelBalance,...(raw.zawelBalance||{})},fuelTransactions:Array.isArray(raw.fuelTransactions)?raw.fuelTransactions:[],fuelBalance:{...base.fuelBalance,...(raw.fuelBalance||{})},fuelSettlementConfig:{...base.fuelSettlementConfig,...(raw.fuelSettlementConfig||{})},fuelSettlements:Array.isArray(raw.fuelSettlements)?raw.fuelSettlements:[],treasuryMovements:Array.isArray(raw.treasuryMovements)?raw.treasuryMovements:[]};}

  function permitDurationKey(durationHours){return Math.min(5,Math.max(1,Math.trunc(num(durationHours)||1)));}
  function permitCostFromPoints(points){return Number((Math.max(0,Math.trunc(num(points)))*575/2500).toFixed(2));}
  function calcPermitPoints(peopleCount,durationHours,snapshot=memory||blank()){const hours=permitDurationKey(durationHours);return Math.max(0,Math.trunc(num((snapshot||blank()).permitFees.find(x=>x.peopleCount===num(peopleCount)&&x.durationHours===hours)?.points)));}
  function calcPermitFee(peopleCount,durationHours,snapshot=memory||blank()){return permitCostFromPoints(calcPermitPoints(peopleCount,durationHours,snapshot));}
  function recalcOptimisticTrip(snapshot,tripId){ const trip=snapshot.trips.find(x=>x.id===tripId); if(!trip)return; const total=snapshot.expenses.filter(x=>x.tripId===tripId&&x.scope==='trip').reduce((a,x)=>a+num(x.amount),0); trip.tripExpenses=total; trip.netProfit=num(trip.totalValue)-total; }
  function recalcOptimisticAsset(snapshot,assetId){ const asset=snapshot.assets.find(x=>x.id===assetId); if(!asset)return; const total=snapshot.expenses.filter(x=>x.assetId===assetId&&x.scope==='asset').reduce((a,x)=>a+num(x.amount),0); asset.capitalizedExpenses=total; asset.currentValue=num(asset.initialValue)+total; }
  function recalcOptimisticZawelBalance(snapshot){ const rows=snapshot.zawelTransactions||[]; snapshot.zawelBalance.balancePoints=rows.reduce((a,x)=>a+num(x.pointsDelta),0); snapshot.zawelBalance.totalChargedPoints=rows.filter(x=>num(x.pointsDelta)>0).reduce((a,x)=>a+num(x.pointsDelta),0); snapshot.zawelBalance.totalDeductedPoints=Math.abs(rows.filter(x=>num(x.pointsDelta)<0).reduce((a,x)=>a+num(x.pointsDelta),0)); snapshot.zawelBalance.totalTopupCost=rows.filter(x=>x.type==='topup').reduce((a,x)=>a+num(x.cashAmount),0); }
  function syncOptimisticPermitWallet(snapshot,tripId,record,existing){ const newPoints=calcPermitPoints(record.peopleCount,record.durationHours,snapshot); const oldPoints=existing?calcPermitPoints(existing.peopleCount,existing.durationHours,snapshot):0; const delta=oldPoints-newPoints; const rows=snapshot.zawelTransactions||[]; rows.filter(x=>x.tripId===tripId&&(x.type==='permit'||x.type==='permit_adjustment')).forEach(x=>{x.transactionDate=record.date;}); if(!existing&&newPoints>0){rows.unshift({id:localId('permit-wallet'),type:'permit',pointsDelta:-newPoints,cashAmount:calcPermitFee(record.peopleCount,record.durationHours),tripId,reference:record.serial||existing?.serial||'',notes:'رسوم تصريح الإبحار',transactionDate:record.date,createdAt:nowIso()});}else if(existing&&delta!==0){rows.unshift({id:localId('permit-adjustment'),type:'permit_adjustment',pointsDelta:delta,cashAmount:Number((Math.abs(delta)*575/2500).toFixed(2)),tripId,reference:existing.serial||record.serial||'',notes:'تسوية رسوم تصريح الإبحار بعد تعديل الرحلة',transactionDate:record.date,createdAt:nowIso()});} snapshot.zawelTransactions=rows; recalcOptimisticZawelBalance(snapshot); }
  function fuelCostForTripType(tripTypeId,snapshot=memory||blank()){return num((snapshot||blank()).tripTypes.find(x=>String(x.id)===String(tripTypeId))?.fuelCostAmount);}
  function commissionAmount(rule,tripValue){return rule?.calculationType==='percentage'?Number((num(tripValue)*num(rule.calculationValue)/100).toFixed(2)):Number(num(rule?.calculationValue).toFixed(2));}
  function commissionRulesForTripType(tripTypeId,snapshot=memory||blank()){return (snapshot.commissionRules||[]).filter(r=>r.isActive&&(r.tripTypeIds||[]).some(id=>String(id)===String(tripTypeId)));}
  function previewTripAutomaticCosts(record={},snapshot=memory||blank()){
    const s=snapshot||blank(),tripTypeId=record.tripTypeId||'',tripType=(s.tripTypes||[]).find(x=>String(x.id)===String(tripTypeId));
    const peopleCount=num(record.peopleCount),durationHours=num(record.durationHours),tripValue=num(record.totalValue);
    return {
      tripTypeId,
      tripNameAr:tripType?.nameAr||'',
      tripNameEn:tripType?.nameEn||'',
      permitPoints:calcPermitPoints(peopleCount,durationHours,s),
      permitFee:calcPermitFee(peopleCount,durationHours,s),
      fuelCost:fuelCostForTripType(tripTypeId,s),
      commissions:commissionRulesForTripType(tripTypeId,s).map(rule=>({
        id:rule.id,
        nameAr:rule.nameAr||'',
        nameEn:rule.nameEn||'',
        beneficiaryType:rule.beneficiaryType||'',
        beneficiaryName:rule.beneficiaryName||'',
        calculationType:rule.calculationType||'fixed',
        calculationValue:num(rule.calculationValue),
        amount:commissionAmount(rule,tripValue)
      }))
    };
  }
  function syncOptimisticTripCommissions(snapshot,tripId,record,existing){
    if(snapshot.commissionRulesReady!==true)throw new Error('SEA_VIBE_COMMISSION_REFERENCE_NOT_CACHED');
    let rows=snapshot.expenses||[];
    const catalog=snapshot.expenseCatalog.find(x=>x.systemKey==='automatic_commission');
    const addForType=()=>{const rules=commissionRulesForTripType(record.tripTypeId,snapshot);if(rules.length&&!catalog)throw new Error('SEA_VIBE_COMMISSION_EXPENSE_CATALOG_MISSING');for(const rule of rules){const systemKey=`commission:${rule.id}`;if(rows.some(e=>String(e.tripId)===String(tripId)&&e.systemKey===systemKey))continue;rows.unshift({id:localId('commission-expense'),scope:'trip',tripId,assetId:'',catalogId:catalog?.id||'',date:record.date,amount:commissionAmount(rule,record.totalValue),paymentMethodId:'',notes:`المستفيد: ${rule.beneficiaryName||''}`,movementGroupId:'',movementSerial:'',systemGenerated:true,systemKey,commissionRuleId:rule.id,commissionNameAr:rule.nameAr||'',commissionNameEn:rule.nameEn||'',commissionBeneficiaryType:rule.beneficiaryType||'',commissionBeneficiaryName:rule.beneficiaryName||'',commissionCalculationType:rule.calculationType||'fixed',commissionCalculationValue:num(rule.calculationValue),commissionTripValue:num(record.totalValue),createdAt:nowIso(),updatedAt:nowIso()});}};
    if(!existing){addForType();snapshot.expenses=rows;return;}
    if(String(existing.tripTypeId)!==String(record.tripTypeId)){rows=rows.filter(e=>!(String(e.tripId)===String(tripId)&&String(e.systemKey||'').startsWith('commission:')));snapshot.expenses=rows;addForType();snapshot.expenses=rows;return;}
    for(const e of rows.filter(e=>String(e.tripId)===String(tripId)&&String(e.systemKey||'').startsWith('commission:'))){e.date=record.date;if(e.commissionCalculationType==='percentage'&&num(existing.totalValue)!==num(record.totalValue)){e.amount=Number((num(record.totalValue)*num(e.commissionCalculationValue)/100).toFixed(2));e.commissionTripValue=num(record.totalValue);}e.updatedAt=nowIso();}
    snapshot.expenses=rows;
  }

  function fuelLitersFromValue(value,unitPrice){const price=num(unitPrice);if(price<=0)return null;return Number((num(value)/price).toFixed(3));}
  function recalcOptimisticFuelBalance(snapshot){const rows=snapshot.fuelTransactions||[];let avg=num(snapshot.fuelBalance?.averageUnitPrice);const topupLiters=rows.filter(x=>x.type==='topup').reduce((a,x)=>a+num(x.litersDelta),0),topupValue=rows.filter(x=>x.type==='topup').reduce((a,x)=>a+num(x.valueDelta),0);const valued=rows.filter(x=>x.valuationStatus==='valued'&&x.litersDelta!=null),valuedLiters=valued.reduce((a,x)=>a+num(x.litersDelta),0),valuedValue=valued.reduce((a,x)=>a+num(x.valueDelta),0),movingPrice=valuedLiters!==0?valuedValue/valuedLiters:0;if(movingPrice>0)avg=Number(movingPrice.toFixed(6));if(avg>0){rows.filter(x=>x.valuationStatus==='pending'&&x.litersDelta==null).forEach(x=>{x.litersDelta=fuelLitersFromValue(x.valueDelta,avg);x.unitPriceSnapshot=avg;x.valuationStatus='valued';x.updatedAt=nowIso();});}const nonTopupLiters=rows.filter(x=>x.type!=='topup'&&x.litersDelta!=null).reduce((a,x)=>a+num(x.litersDelta),0),nonTopupValue=rows.filter(x=>x.type!=='topup').reduce((a,x)=>a+num(x.valueDelta),0);snapshot.fuelBalance={...(snapshot.fuelBalance||{}),balanceLiters:Number(rows.reduce((a,x)=>a+num(x.litersDelta),0).toFixed(3)),balanceValue:Number(rows.reduce((a,x)=>a+num(x.valueDelta),0).toFixed(2)),totalTopupLiters:Number(topupLiters.toFixed(3)),totalTopupValue:Number(topupValue.toFixed(2)),totalDeductedLiters:Number(Math.max(0,-nonTopupLiters).toFixed(3)),totalDeductedValue:Number(Math.max(0,-nonTopupValue).toFixed(2)),averageUnitPrice:avg,pendingValuationCount:rows.filter(x=>x.valuationStatus==='pending').length};snapshot.fuelTransactions=rows;}
  function hasManualFuelExpense(snapshot,tripId){return (snapshot.expenses||[]).some(e=>e.tripId===tripId&&!e.systemGenerated&&(()=>{const c=(snapshot.expenseCatalog||[]).find(x=>String(x.id)===String(e.catalogId));return /بنزين/i.test(c?.nameAr||'')||/fuel/i.test(c?.nameEn||'');})());}
  function syncOptimisticFuelWallet(snapshot,tripId,record,existing){const cost=fuelCostForTripType(record.tripTypeId,snapshot);if(cost<=0)throw new Error('SEA_VIBE_FUEL_TARIFF_MISSING');const systemExpense=(snapshot.expenses||[]).find(x=>x.tripId===tripId&&x.systemKey==='fuel_cost');if(existing&&!systemExpense&&hasManualFuelExpense(snapshot,tripId))return;const oldCost=existing?num(systemExpense?.amount||cost):0,price=num(snapshot.fuelBalance?.averageUnitPrice),rows=snapshot.fuelTransactions||[];let fuelExpense=systemExpense;if(fuelExpense){if(!existing||String(existing.tripTypeId)!==String(record.tripTypeId))fuelExpense.amount=cost;fuelExpense.date=record.date;fuelExpense.updatedAt=nowIso();}else{fuelExpense={id:localId('fuel-expense'),scope:'trip',tripId,assetId:'',catalogId:(snapshot.expenseCatalog||[]).find(x=>x.systemKey==='fuel_cost')?.id||'',date:record.date,amount:cost,paymentMethodId:'',notes:'',systemGenerated:true,systemKey:'fuel_cost',createdAt:nowIso(),updatedAt:nowIso()};snapshot.expenses.unshift(fuelExpense);}rows.filter(x=>x.tripId===tripId&&(x.type==='trip'||x.type==='trip_adjustment')).forEach(x=>{x.transactionDate=record.date;x.reference=record.serial||existing?.serial||x.reference||'';});if(!existing){const valueDelta=-cost,liters=fuelLitersFromValue(valueDelta,price);rows.unshift({id:localId('fuel-trip'),type:'trip',litersDelta:liters,valueDelta,unitPriceSnapshot:liters==null?null:price,valuationStatus:liters==null?'pending':'valued',tripId,reference:record.serial||'',notes:'خصم بنزين الرحلة حسب نوع الرحلة',transactionDate:record.date,createdAt:nowIso(),updatedAt:nowIso()});}else if(String(existing.tripTypeId)!==String(record.tripTypeId)){const valueDelta=Number((oldCost-cost).toFixed(2));if(valueDelta!==0){const liters=fuelLitersFromValue(valueDelta,price);rows.unshift({id:localId('fuel-adjustment'),type:'trip_adjustment',litersDelta:liters,valueDelta,unitPriceSnapshot:liters==null?null:price,valuationStatus:liters==null?'pending':'valued',tripId,reference:existing.serial||record.serial||'',notes:'تسوية بنزين بعد تغيير نوع الرحلة',transactionDate:record.date,createdAt:nowIso(),updatedAt:nowIso()});}}snapshot.fuelTransactions=rows;recalcOptimisticFuelBalance(snapshot);}

  async function persist(snapshot){ memory=snapshot; const ns=await namespace(); await window.KYUMSmartCache?.set?.(CACHE_KEY,snapshot,{namespace:ns,ttlMs:CACHE_TTL,staleMaxMs:STALE_MAX,source:'supabase',schemaVersion:1}); readStatus={source:'network',updatedAt:Date.now(),stale:false}; window.dispatchEvent(new CustomEvent('sea-vibe-data-updated',{detail:{source:'persist'}})); return snapshot; }
  async function readCache(){ const ns=await namespace(); const hit=await window.KYUMSmartCache?.get?.(CACHE_KEY,{namespace:ns,allowStale:true,allowStaleAnyAge:true,staleMaxMs:STALE_MAX}); if(hit?.hit){memory=normalizeSnapshot(hit.data);readStatus={source:'cache',updatedAt:hit.updatedAt||Date.now(),stale:!!hit.stale};return memory;} return null; }

  async function fetchSections(names=ALL_SECTIONS){
    const requested=[...new Set((names||[]).filter(name=>ALL_SECTIONS.includes(name)))];
    const c=client(),out={};
    await Promise.all(requested.map(async name=>{
      if(name==='trips') out.trips=sortTrips((await unwrap(c.from('sea_vibe_trip_financials').select('*').order('trip_date',{ascending:false}),'تعذر تحميل رحلات SEA VIBE')).map(mapTrip));
      else if(name==='customers') out.customers=(await unwrap(c.rpc('get_sea_vibe_customers_r44r15'),'تعذر تحميل عملاء SEA VIBE')).map(mapCustomer);
      else if(name==='expenses') out.expenses=(await unwrap(c.from('sea_vibe_expenses').select('*').order('expense_date',{ascending:false}),'تعذر تحميل مصروفات SEA VIBE')).map(mapExpense);
      else if(name==='assets') out.assets=(await unwrap(c.from('sea_vibe_assets_with_value').select('*').order('created_at',{ascending:false}),'تعذر تحميل أصول SEA VIBE')).map(mapAsset);
      else if(name==='tripTypes') out.tripTypes=(await unwrap(c.from('sea_vibe_trip_types').select('*').order('name_ar'),'تعذر تحميل أنواع الرحلات')).map(mapRef);
      else if(name==='paymentMethods') out.paymentMethods=(await unwrap(c.from('sea_vibe_payment_methods').select('*').order('name_ar'),'تعذر تحميل طرق الدفع')).map(mapRef);
      else if(name==='expenseCatalog') out.expenseCatalog=(await unwrap(c.from('sea_vibe_expense_catalog').select('*').order('name_ar'),'تعذر تحميل المصروفات المرجعية')).map(mapRef);
      else if(name==='permitFees') out.permitFees=(await unwrap(c.from('sea_vibe_sailing_permit_fees').select('*').order('people_count').order('duration_hours'),'تعذر تحميل رسوم تصريح الإبحار')).map(r=>({peopleCount:num(r.people_count),durationHours:num(r.duration_hours),amount:num(r.fee_amount),points:r.points==null?null:num(r.points),updatedAt:r.updated_at||''}));
      else if(name==='commissionRules'){out.commissionRules=(await unwrap(c.from('sea_vibe_commission_rules_view').select('*').order('name_ar'),'تعذر تحميل العمولات المرجعية')).map(mapCommissionRule);out.commissionRulesReady=true;}
      else if(name==='commissionEmployees') out.commissionEmployees=(await unwrap(c.rpc('sea_vibe_commission_employee_options_r44r7'),'تعذر تحميل موظفي العمولات')).map(mapCommissionEmployee);
      else if(name==='attachments') out.attachments=(await unwrap(c.from('sea_vibe_expense_attachments').select('*').order('created_at',{ascending:false}),'تعذر تحميل مرفقات المصروفات')).map(mapAttachment);
      else if(name==='zawelTransactions') out.zawelTransactions=(await unwrap(c.from('sea_vibe_zawel_transactions').select('*').order('transaction_date',{ascending:false}).order('created_at',{ascending:false}),'تعذر تحميل حركات رصيد زاول')).map(mapZawel);
      else if(name==='zawelBalance') { const row=await unwrap(c.from('sea_vibe_zawel_balance').select('*').single(),'تعذر تحميل رصيد زاول'); out.zawelBalance={balancePoints:num(row.balance_points),totalChargedPoints:num(row.total_charged_points),totalDeductedPoints:num(row.total_deducted_points),totalTopupCost:num(row.total_topup_cost)}; }
      else if(name==='fuelTransactions') out.fuelTransactions=(await unwrap(c.from('sea_vibe_fuel_transactions').select('*').order('transaction_date',{ascending:false}).order('created_at',{ascending:false}),'تعذر تحميل حركات رصيد البنزين')).map(mapFuel);
      else if(name==='fuelBalance') { const rows=await unwrap(c.from('sea_vibe_fuel_balance').select('*').limit(1),'تعذر تحميل رصيد البنزين'),row=rows?.[0]||{}; out.fuelBalance={balanceLiters:num(row.balance_liters),balanceValue:num(row.balance_value),totalTopupLiters:num(row.total_topup_liters),totalTopupValue:num(row.total_topup_value),totalDeductedLiters:num(row.total_deducted_liters),totalDeductedValue:num(row.total_deducted_value),averageUnitPrice:num(row.average_unit_price),pendingValuationCount:num(row.pending_valuation_count),unconfiguredTripCount:num(row.unconfigured_trip_count),historicalReviewCount:num(row.historical_review_count)}; }
      else if(name==='fuelSettlementConfig') { const rows=await unwrap(c.from('sea_vibe_fuel_settlement_config').select('*').limit(1),'تعذر تحميل إعدادات تسوية البنزين'),row=rows?.[0]||{}; out.fuelSettlementConfig={peopleWeightPct:num(row.people_weight_pct||50),hoursWeightPct:num(row.hours_weight_pct||50),updatedAt:row.updated_at||''}; }
      else if(name==='fuelSettlements') out.fuelSettlements=(await unwrap(c.from('sea_vibe_fuel_settlements').select('*').order('cutoff_date',{ascending:false}).order('created_at',{ascending:false}),'تعذر تحميل سجل تسويات البنزين')).map(mapFuelSettlement);
      else if(name==='treasuryMovements') out.treasuryMovements=(await unwrap(c.from('sea_vibe_treasury_movements').select('*').order('movement_date',{ascending:false}).order('movement_at',{ascending:false}),'تعذر تحميل حركات الخزنة')).map(mapTreasury);
    }));
    return out;
  }

  async function fetchNetwork(){ return {...blank(),...await fetchSections(ALL_SECTIONS)}; }
  async function refreshSections(names){ const patch=await fetchSections(names); return persist({...blank(),...(memory||blank()),...patch}); }
  function markSyncSections(names){ for(const name of names||[]) if(ALL_SECTIONS.includes(name))pendingSyncSections.add(name); }
  async function syncRefresh(context={}){
    if(context.reason==='offline-queue'&&pendingSyncSections.size){const names=[...pendingSyncSections];pendingSyncSections.clear();return refreshSections(names);}
    return refresh();
  }

  async function load(options={}){
    if(memory&&!options.force) return memory;
    const cached=await readCache();
    if(cached&&!options.force){ if(navigator.onLine!==false) fetchNetwork().then(persist).catch(()=>{}); return cached; }
    try{return await persist(await fetchNetwork());}catch(error){ if(cached)return cached; throw error; }
  }
  async function refresh(){ return persist(await fetchNetwork()); }
  async function refreshCommissionEmployees(){
    if(navigator.onLine===false)return (memory||blank()).commissionEmployees||[];
    if(memory)await refreshSections(['commissionEmployees']);
    else await refresh();
    return (memory||blank()).commissionEmployees||[];
  }
  function getSnapshot(){ return memory||blank(); }
  function getReadStatus(){ return {...readStatus}; }
  async function invalidate(){ memory=null; const ns=await namespace(); await window.KYUMSmartCache?.removePrefix?.('sea-vibe:',{namespace:ns}); }

  async function audit(action,entity,id,payload){ try{ const u=(await client().auth.getUser()).data.user?.id||null; await client().from('audit_logs').insert({user_id:u,action,entity_type:entity,entity_id:String(id||''),new_data:payload,metadata:{source:'petatoe-web',phase:'P5.13.8.72R31',module:'sea-vibe'}});}catch(e){console.warn('SEA VIBE audit skipped',e);} }
  function optimistic(mutator){ const s=structuredClone(memory||blank()); mutator(s); memory=s; namespace().then(ns=>window.KYUMSmartCache?.set?.(CACHE_KEY,s,{namespace:ns,ttlMs:CACHE_TTL,staleMaxMs:STALE_MAX,source:'offline-optimistic',schemaVersion:1})); window.dispatchEvent(new CustomEvent('sea-vibe-data-updated',{detail:{source:'offline-optimistic'}})); return s; }
  function newOperationKey(kind){const suffix=globalThis.crypto?.randomUUID?.()||`${Date.now()}:${Math.random().toString(36).slice(2)}`;return `sea_vibe:${kind}:${suffix}`;}
  const serverReplayAnchors=new Map();
  function replayAnchorIso(value){const n=Number(value||0);if(n>0)return new Date(n).toISOString();const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?new Date(parsed).toISOString():new Date().toISOString();}
  function queueReplayAnchor(operation){return operation?.payload?.replayAnchorAt||replayAnchorIso(operation?.firstAttemptAt||operation?.replayHorizonStartedAt||Date.now());}
  function conflictError(message,details={}){const C=window.KYUMOfflineQueue?.ConflictError;if(C)return new C(message||'SEA VIBE sync conflict',details);const e=new Error(message||'SEA VIBE sync conflict');e.code='OFFLINE_CONFLICT';e.details=details;return e;}
  async function enqueue(action,payload,localEntityId,dependsOn=[],baseUpdatedAt='',idempotencyKey=''){ if(!window.KYUMOfflineQueue) throw new Error('نظام المزامنة غير جاهز.'); const key=idempotencyKey||`sea_vibe:${action}:${localEntityId||payload?.id||Date.now()}`;const replayAnchorAt=payload?.replayAnchorAt||serverReplayAnchors.get(key)||'';return window.KYUMOfflineQueue.enqueue({entity:'sea_vibe',action,payload:{...(payload||{}),replayAnchorAt},localEntityId,dependsOn,baseUpdatedAt,idempotencyKey:key}); }
  async function findSeaVibeCreateOperation(localId,namespaceValue){
    const standard=await window.KYUMOfflineQueue?.findCreateOperationByLocalId?.(localId,namespaceValue);if(standard?.id)return standard;
    const rows=await window.KYUMOfflineQueue?.list?.({namespace:namespaceValue,statuses:['pending','retry','processing','synced']}).catch(()=>[])||[];
    return rows.find(row=>row.entity==='sea_vibe'&&row.localEntityId===localId&&LEGACY_CREATE_ACTIONS.has(row.action))||null;
  }
  async function localDependencies(...ids){ const out=[],ns=await window.KYUMOfflineQueue?.getNamespace?.({allowNetwork:false}).catch(()=>null); for(const id of ids.filter(Boolean)){ if(!String(id).startsWith('local:'))continue; const parent=await findSeaVibeCreateOperation(id,ns); if(parent?.id)out.push(parent.id); } return [...new Set(out)]; }
  async function resolveQueuedId(id,operation,helpers){
    if(!String(id||'').startsWith('local:'))return id;
    const mapped=await helpers.resolveServerId(id,operation.namespace);if(mapped)return mapped;
    const parent=await findSeaVibeCreateOperation(id,operation.namespace);
    if(parent?.status==='synced'&&parent.resultId)return parent.resultId;
    if(parent)throw new TypeError('offline SEA VIBE dependency is not synchronized yet');
    throw new Error('SEA_VIBE_LOCAL_ID_MAPPING_MISSING');
  }
  async function syncMutationOnline(kind,mutation,operationKey,entityId,payload={},baseUpdatedAt=''){
    const replayAnchorAt=serverReplayAnchors.get(operationKey)||new Date().toISOString();serverReplayAnchors.set(operationKey,replayAnchorAt);
    let data;try{
      data=await unwrap(client().rpc('sync_sea_vibe_mutation_v2',{p_kind:kind,p_mutation:mutation,p_operation_key:operationKey,p_entity_id:entityId||null,p_payload:payload||{},p_base_updated_at:baseUpdatedAt||null,p_replay_anchor_at:replayAnchorAt,p_replay_policy_version:'r38-90d-v1'}),'تعذر مزامنة بيانات SEA VIBE');
    }catch(error){
      if(String(error?.message||'').includes('SYNC_REPLAY_HORIZON_EXPIRED')){error.code='OFFLINE_REPLAY_HORIZON_EXPIRED';}
      throw error;
    }
    if(data?.conflict){serverReplayAnchors.delete(operationKey);throw conflictError(data.message||'تم تعديل البيانات على الخادم بعد آخر مزامنة.',data);}
    serverReplayAnchors.delete(operationKey);
    return data||{};
  }

  async function saveTripOnline(record,options={}){
    const isUpdate=!!(record.id&&!String(record.id).startsWith('local:'));
    const existing=isUpdate?(memory||blank()).trips.find(x=>String(x.id)===String(record.id)):null;
    const operationKey=options.operationKey||newOperationKey(isUpdate?'trip-update':'trip-create');
    const baseUpdatedAt=options.baseUpdatedAt??record.baseUpdatedAt??existing?.updatedAt??'';
    const result=await syncMutationOnline('trip',isUpdate?'update':'create',operationKey,isUpdate?record.id:null,{date:record.date,startTime:record.startTime,durationHours:num(record.durationHours),peopleCount:num(record.peopleCount),tripTypeId:record.tripTypeId,customerId:record.customerId||'',totalValue:num(record.totalValue),notes:String(record.notes||'').trim()},baseUpdatedAt);
    await audit(isUpdate?'update':'insert','sea_vibe_trips',result.id,{date:record.date,durationHours:num(record.durationHours),peopleCount:num(record.peopleCount),tripTypeId:record.tripTypeId,customerId:record.customerId||'',totalValue:num(record.totalValue)});
    if(!options.skipRefresh)await refreshSections(['trips','expenses','zawelTransactions','zawelBalance','fuelTransactions','fuelBalance','treasuryMovements']);
    else markSyncSections(['trips','expenses','zawelTransactions','zawelBalance','fuelTransactions','fuelBalance','treasuryMovements']);
    return result.id;
  }
  async function saveTrip(record,context={}){
    const isUpdate=!!record.id;
    permission(isUpdate?'seaVibeTrips':'seaVibeTripNew',isUpdate?'edit':'add');
    if(!record.customerId&&(String(record.customerNumber||'').trim()||String(record.customerName||'').trim()))record={...record,customerId:await ensureTripCustomer({number:record.customerNumber,name:record.customerName})};
    const existing=isUpdate?(memory||blank()).trips.find(x=>String(x.id)===String(record.id)):null;
    const baseUpdatedAt=isUpdate&&!String(record.id).startsWith('local:')?(record.baseUpdatedAt||existing?.updatedAt||''):'';
    const operationKey=context.operationKey||newOperationKey(isUpdate?'trip-update':'trip-create');
    const applyLocal=()=>{const id=record.id||localId('trip');optimistic(s=>{const old=s.trips.find(x=>x.id===id);const permit=calcPermitFee(record.peopleCount,record.durationHours,s);if(fuelCostForTripType(record.tripTypeId,s)<=0)throw new Error('SEA_VIBE_FUEL_TARIFF_MISSING');const customer=(s.customers||[]).find(x=>String(x.id)===String(record.customerId||''));const row={...old,...record,id,customerId:record.customerId||'',customerNumber:customer?.number||old?.customerNumber||'',customerName:customer?.name||old?.customerName||'',serial:record.serial||old?.serial||`SV-OFFLINE-${String(Date.now()).slice(-6)}`,status:record.status||old?.status||'open',tripExpenses:num(old?.tripExpenses),netProfit:num(old?.netProfit),createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};s.trips=[row,...s.trips.filter(x=>x.id!==id)];syncOptimisticPermitWallet(s,id,row,old);const localPermit=s.expenses.find(x=>x.tripId===id&&x.systemKey==='sailing_permit');if(localPermit){localPermit.amount=permit;localPermit.date=record.date;localPermit.updatedAt=nowIso();}else{s.expenses.unshift({id:localId('permit'),scope:'trip',tripId:id,assetId:'',catalogId:s.expenseCatalog.find(x=>x.systemKey==='sailing_permit')?.id||'',date:record.date,amount:permit,paymentMethodId:'',notes:'',systemGenerated:true,systemKey:'sailing_permit',createdAt:nowIso(),updatedAt:nowIso()});}syncOptimisticFuelWallet(s,id,row,old);syncOptimisticTripCommissions(s,id,row,old);recalcOptimisticTrip(s,id);s.trips=sortTrips(s.trips);});return id;};
    const queueIt=async id=>enqueue(isUpdate?'update':'create',{kind:'trip',mutation:isUpdate?'update':'create',record:{...record,id},operationKey},id,await localDependencies(record.id,record.tripTypeId),baseUpdatedAt,operationKey);
    if(!context.skipOfflineQueue&&navigator.onLine===false){const id=applyLocal();await queueIt(id);return id;}
    try{return await saveTripOnline(record,{operationKey,baseUpdatedAt});}catch(error){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(error)){const id=applyLocal();await queueIt(id);return id;}throw error;}
  }

  async function setTripStatusOnline(id,status,options={}){
    const existing=(memory||blank()).trips.find(x=>String(x.id)===String(id));
    const operationKey=options.operationKey||newOperationKey(`trip-${status}`);
    const baseUpdatedAt=options.baseUpdatedAt??existing?.updatedAt??'';
    const result=await syncMutationOnline('trip','status',operationKey,id,{status},baseUpdatedAt);
    await audit(status,'sea_vibe_trips',result.id,{status});
    if(!options.skipRefresh)await refreshSections(['trips']);else markSyncSections(['trips']);
    return result.id;
  }
  async function setTripStatus(id,status,context={}){
    permission('seaVibeTrips','edit');
    const existing=(memory||blank()).trips.find(x=>String(x.id)===String(id));
    const baseUpdatedAt=!String(id).startsWith('local:')?(existing?.updatedAt||''):'';
    const operationKey=context.operationKey||newOperationKey(`trip-${status}`);
    const applyLocal=()=>optimistic(s=>{const r=s.trips.find(x=>x.id===id);if(r){r.status=status;r.updatedAt=nowIso();}});
    const queueIt=async()=>enqueue('update',{kind:'trip',mutation:'status',id,status,operationKey},id,await localDependencies(id),baseUpdatedAt,operationKey);
    if(!context.skipOfflineQueue&&navigator.onLine===false){applyLocal();await queueIt();return id;}
    try{return await setTripStatusOnline(id,status,{operationKey,baseUpdatedAt});}catch(e){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(e)){applyLocal();await queueIt();return id;}throw e;}
  }


  async function saveAssetOnline(record,options={}){
    const isUpdate=!!(record.id&&!String(record.id).startsWith('local:'));
    const existing=isUpdate?(memory||blank()).assets.find(x=>String(x.id)===String(record.id)):null;
    const operationKey=options.operationKey||newOperationKey(isUpdate?'asset-update':'asset-create');
    const baseUpdatedAt=options.baseUpdatedAt??record.baseUpdatedAt??existing?.updatedAt??'';
    const result=await syncMutationOnline('asset',isUpdate?'update':'create',operationKey,isUpdate?record.id:null,{name:String(record.name||'').trim(),initialValue:num(record.initialValue),notes:String(record.notes||'').trim(),isActive:record.isActive!==false},baseUpdatedAt);
    await audit(isUpdate?'update':'insert','sea_vibe_assets',result.id,{name:record.name,initialValue:num(record.initialValue),isActive:record.isActive!==false});
    if(!options.skipRefresh)await refreshSections(['assets']);else markSyncSections(['assets']);
    return result.id;
  }
  async function saveAsset(record,context={}){
    const isUpdate=!!record.id;permission('seaVibeAssets',isUpdate?'edit':'add');
    const existing=isUpdate?(memory||blank()).assets.find(x=>String(x.id)===String(record.id)):null;
    const baseUpdatedAt=isUpdate&&!String(record.id).startsWith('local:')?(record.baseUpdatedAt||existing?.updatedAt||''):'';
    const operationKey=context.operationKey||newOperationKey(isUpdate?'asset-update':'asset-create');
    const applyLocal=()=>{const id=record.id||localId('asset');optimistic(s=>{const old=s.assets.find(x=>x.id===id);const row={...old,...record,id,code:record.code||old?.code||`AS-OFF-${String(Date.now()).slice(-4)}`,capitalizedExpenses:old?.capitalizedExpenses||0,currentValue:num(record.initialValue)+num(old?.capitalizedExpenses),createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};s.assets=[row,...s.assets.filter(x=>x.id!==id)];});return id;};
    const queueIt=async id=>enqueue(isUpdate?'update':'create',{kind:'asset',mutation:isUpdate?'update':'create',record:{...record,id},operationKey},id,await localDependencies(record.id),baseUpdatedAt,operationKey);
    if(!context.skipOfflineQueue&&navigator.onLine===false){const id=applyLocal();await queueIt(id);return id;}
    try{return await saveAssetOnline(record,{operationKey,baseUpdatedAt});}catch(e){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(e)){const id=applyLocal();await queueIt(id);return id;}throw e;}
  }


  async function uploadAttachment(expenseId,file,operationKey=''){
    if(!file)return null;
    const safe=String(file.name||'attachment').replace(/[^a-zA-Z0-9._-]+/g,'-');
    const ns=operationKey?await namespace():'';
    const evidenceKey=operationKey?`${ns}:${operationKey}:${expenseId}:${file.size||0}:${safe}`:'';
    const pathToken=evidenceKey?evidenceKey.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-150):String(Date.now());
    const path=`${expenseId}/${pathToken}-${safe}`;
    const {error}=await client().storage.from('sea-vibe-expenses').upload(path,file,{upsert:!!evidenceKey,contentType:file.type||undefined});
    if(error)throw new Error(`تعذر رفع المرفق: ${error.message}`);
    const payload={expense_id:expenseId,storage_path:path,file_name:file.name||safe,mime_type:file.type||null,file_size:file.size||null,client_operation_key:evidenceKey||null};
    const req=evidenceKey?client().from('sea_vibe_expense_attachments').upsert(payload,{onConflict:'client_operation_key'}).select('*').single():client().from('sea_vibe_expense_attachments').insert(payload).select('*').single();
    return mapAttachment(await unwrap(req,'تعذر حفظ بيانات المرفق'));
  }
  async function fileToPayload(file){ if(!file)return null; const data=await file.arrayBuffer(); let binary=''; new Uint8Array(data).forEach(b=>binary+=String.fromCharCode(b)); return {name:file.name,type:file.type,size:file.size,base64:btoa(binary)}; }
  function payloadToFile(payload){ if(!payload?.base64)return null; const binary=atob(payload.base64),bytes=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i); return new File([bytes],payload.name||'attachment',{type:payload.type||'application/octet-stream'}); }
  function expenseBatchArgs(records){
    const rows=records||[]; if(!rows.length)throw new Error('أضف مصروفًا واحدًا على الأقل.');
    const first=rows[0],scope=first.scope,tripId=scope==='trip'?first.tripId:null,assetId=scope==='asset'?first.assetId:null;
    if(rows.some(r=>r.scope!==scope||(scope==='trip'&&r.tripId!==first.tripId)||(scope==='asset'&&r.assetId!==first.assetId)))throw new Error('يجب أن تكون بنود الحركة ضمن نفس نوع المصروف والمرجع.');
    return {scope,tripId,assetId,lines:rows.map(r=>({id:r.id||null,catalog_id:r.catalogId,date:r.date,amount:num(r.amount),payment_method_id:r.paymentMethodId||null,notes:String(r.notes||'').trim()||null}))};
  }
  async function addExpensesOnline(records,options={}){
    const batch=expenseBatchArgs(records),operationKey=options.operationKey||newOperationKey('expense-batch-create');
    const result=await syncMutationOnline('expense_batch','create',operationKey,null,{scope:batch.scope,tripId:batch.tripId||'',assetId:batch.assetId||'',lines:batch.lines},'');
    const ids=result?.expense_ids||[];
    for(let i=0;i<records.length;i++){if(records[i].file&&ids[i])await uploadAttachment(ids[i],records[i].file,`${operationKey}:${i}`);}
    await audit('insert','sea_vibe_expense_movement',result?.movement_group_id||result?.id||'',{movementSerial:result?.movement_serial,scope:batch.scope,tripId:batch.tripId,assetId:batch.assetId,lines:batch.lines});
    const sections=['expenses','attachments','treasuryMovements'];if(batch.scope==='trip')sections.push('trips');if(batch.scope==='asset')sections.push('assets');
    if(!options.skipRefresh)await refreshSections(sections);else markSyncSections(sections);
    return result;
  }
  async function addExpenses(records,context={}){
    permission('seaVibeExpenseNew','add');const rows=records||[];const batch=expenseBatchArgs(rows);const operationKey=context.operationKey||newOperationKey('expense-batch-create');
    const applyLocal=async()=>{const groupId=localId('expense-group'),serial=`SV-MOV-OFF-${String(Date.now()).slice(-8)}`,filePayloads=[];for(const r of rows)filePayloads.push(await fileToPayload(r.file));optimistic(s=>{rows.forEach(record=>s.expenses.unshift({id:localId('expense'),...record,movementGroupId:groupId,movementSerial:serial,systemGenerated:false,createdAt:nowIso(),updatedAt:nowIso()}));if(batch.scope==='trip')recalcOptimisticTrip(s,batch.tripId);if(batch.scope==='asset')recalcOptimisticAsset(s,batch.assetId);});return{groupId,serial,filePayloads};};
    const queueIt=async local=>enqueue('create',{kind:'expense_batch',mutation:'create',records:rows.map((r,i)=>({...r,file:null,filePayload:local.filePayloads[i]})),groupId:local.groupId,serial:local.serial,operationKey},local.groupId,await localDependencies(batch.tripId,batch.assetId,...rows.flatMap(r=>[r.catalogId,r.paymentMethodId]).filter(Boolean)),'',operationKey);
    if(!context.skipOfflineQueue&&navigator.onLine===false){const local=await applyLocal();await queueIt(local);return{movement_group_id:local.groupId,movement_serial:local.serial};}
    try{return await addExpensesOnline(rows,{operationKey});}catch(e){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(e)){const local=await applyLocal();await queueIt(local);return{movement_group_id:local.groupId,movement_serial:local.serial};}throw e;}
  }

  async function getExpenseMovement(groupId){permission('seaVibeExpenseNew','view');const local=(memory||blank()).expenses.filter(x=>String(x.movementGroupId)===String(groupId)&&!x.systemGenerated);if(local.length)return local;if(navigator.onLine===false)throw new Error('تعذر تحميل حركة المصروفات من الكاش. اتصل بالإنترنت وحاول مرة أخرى.');const rows=await unwrap(client().from('sea_vibe_expenses').select('*').eq('movement_group_id',groupId).eq('is_system_generated',false).order('created_at',{ascending:true}).order('id',{ascending:true}),'تعذر تحميل حركة المصروفات');return rows.map(mapExpense);}
  async function updateExpenseMovement(groupId,records){permission('seaVibeExpenseNew','edit');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لتعديل حركة المصروفات.');const batch=expenseBatchArgs(records);const data=await unwrap(client().rpc('sea_vibe_update_expense_batch',{p_group_id:groupId,p_scope:batch.scope,p_trip_id:batch.tripId,p_asset_id:batch.assetId,p_lines:batch.lines}),'تعذر تعديل حركة المصروفات');const ids=data?.expense_ids||[];for(let i=0;i<records.length;i++){if(records[i].file&&ids[i])await uploadAttachment(ids[i],records[i].file);}await audit('update','sea_vibe_expense_movement',groupId,{movementSerial:data?.movement_serial,scope:batch.scope,tripId:batch.tripId,assetId:batch.assetId,lines:batch.lines});const sections=['expenses','attachments','treasuryMovements'];if(batch.scope==='trip')sections.push('trips');if(batch.scope==='asset')sections.push('assets');await refreshSections(sections);return data;}
  async function deleteExpenseMovement(groupId){permission('seaVibeExpenseNew','delete');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحذف حركة المصروفات.');await unwrap(client().rpc('sea_vibe_delete_expense_batch',{p_group_id:groupId}),'تعذر حذف حركة المصروفات');await audit('delete','sea_vibe_expense_movement',groupId,{});await refreshSections(['expenses','attachments','trips','assets','treasuryMovements']);return groupId;}
  async function deleteExpenseOnline(id){ const row=(memory||blank()).expenses.find(x=>x.id===id); if(row?.systemGenerated)throw new Error('لا يمكن حذف مصروف نظامي.'); await unwrap(client().from('sea_vibe_expenses').delete().eq('id',id),'تعذر حذف المصروف');await audit('delete','sea_vibe_expenses',id,row||{});await refreshSections(['expenses','attachments','trips','assets','treasuryMovements']);return id; }
  async function deleteExpense(id){permission('seaVibeExpenseNew','delete');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحذف المصروف.');return deleteExpenseOnline(id);}

  async function saveReferenceOnline(kind,record,options={}){
    const isUpdate=!!(record.id&&!String(record.id).startsWith('local:'));
    const existing=isUpdate?referenceRows(memory||blank(),kind).find(x=>String(x.id)===String(record.id)):null;
    const operationKey=options.operationKey||newOperationKey(isUpdate?`reference-${kind}-update`:`reference-${kind}-create`);
    const baseUpdatedAt=options.baseUpdatedAt??record.baseUpdatedAt??existing?.updatedAt??'';
    const syncKind=kind==='tripTypes'?'trip_type_reference':'reference';const result=await syncMutationOnline(syncKind,isUpdate?'update':'create',operationKey,isUpdate?record.id:null,{refKind:kind,nameAr:String(record.nameAr||'').trim(),nameEn:String(record.nameEn||'').trim(),isActive:record.isActive!==false,fuelCostAmount:kind==='tripTypes'?num(record.fuelCostAmount):0,requiresCustomer:kind==='tripTypes'?record.requiresCustomer!==false:true},baseUpdatedAt);
    const section=kind==='tripTypes'?'tripTypes':kind==='paymentMethods'?'paymentMethods':'expenseCatalog';
    if(!options.skipRefresh)await refreshSections([section]);else markSyncSections([section]);
    return result.id;
  }
  function referenceRows(snapshot,kind){return kind==='tripTypes'?snapshot.tripTypes:kind==='paymentMethods'?snapshot.paymentMethods:snapshot.expenseCatalog;}
  async function saveReference(kind,record,context={}){
    const isUpdate=!!record.id;permission('seaVibeReference',isUpdate?'edit':'add');
    const existing=isUpdate?referenceRows(memory||blank(),kind).find(x=>String(x.id)===String(record.id)):null;
    const baseUpdatedAt=isUpdate&&!String(record.id).startsWith('local:')?(record.baseUpdatedAt||existing?.updatedAt||''):'';
    const operationKey=context.operationKey||newOperationKey(isUpdate?`reference-${kind}-update`:`reference-${kind}-create`);
    const applyLocal=()=>{const id=record.id||localId(`ref-${kind}`);optimistic(s=>{const rows=referenceRows(s,kind),old=rows.find(x=>x.id===id),next={...old,...record,id,isActive:record.isActive!==false,fuelCostAmount:kind==='tripTypes'?num(record.fuelCostAmount):num(old?.fuelCostAmount),requiresCustomer:kind==='tripTypes'?record.requiresCustomer!==false:(old?.requiresCustomer!==false),updatedAt:nowIso()},filtered=rows.filter(x=>x.id!==id);if(kind==='tripTypes')s.tripTypes=[next,...filtered];else if(kind==='paymentMethods')s.paymentMethods=[next,...filtered];else s.expenseCatalog=[next,...filtered];});return id;};
    const syncKind=kind==='tripTypes'?'trip_type_reference':'reference';const queueIt=async id=>enqueue(isUpdate?'update':'create',{kind:syncKind,mutation:isUpdate?'update':'create',refKind:kind,record:{...record,id},operationKey},id,await localDependencies(record.id),baseUpdatedAt,operationKey);
    if(!context.skipOfflineQueue&&navigator.onLine===false){const id=applyLocal();await queueIt(id);return id;}
    try{return await saveReferenceOnline(kind,record,{operationKey,baseUpdatedAt});}catch(e){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(e)){const id=applyLocal();await queueIt(id);return id;}throw e;}
  }

  async function saveCustomer(record){
    const isUpdate=!!record.id;permission('seaVibeCustomers',isUpdate?'edit':'add');
    if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحفظ بيانات عملاء SEA VIBE.');
    const number=String(record.number||'').trim(),name=String(record.name||'').trim();
    if(!number)throw new Error('أدخل رقم العميل.');if(!name)throw new Error('أدخل اسم العميل.');
    try{
      const id=await unwrap(client().rpc('save_sea_vibe_customer_r44r13',{p_id:record.id||null,p_customer_number:number,p_full_name:name,p_notes:String(record.notes||'').trim()||null,p_is_active:record.isActive!==false}),'تعذر حفظ عميل SEA VIBE');
      await audit(isUpdate?'update':'insert','sea_vibe_customers',id,{customerNumber:number,fullName:name,isActive:record.isActive!==false});
      await refreshSections(['customers']);return id;
    }catch(error){if(String(error?.message||'').includes('SEA_VIBE_CUSTOMER_NUMBER_EXISTS'))throw new Error('رقم العميل مستخدم بالفعل.');throw error;}
  }
  async function deleteCustomer(id){
    permission('seaVibeCustomers','delete');
    if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحذف عميل SEA VIBE.');
    const customerId=String(id||'').trim();if(!customerId)throw new Error('حدد العميل المراد حذفه.');
    try{
      await unwrap(client().rpc('delete_sea_vibe_customer_r44r15',{p_customer_id:customerId}),'تعذر حذف عميل SEA VIBE');
      await audit('delete','sea_vibe_customers',customerId,{source:'sea-vibe-customers'});
      await refreshSections(['customers']);return true;
    }catch(error){
      const message=String(error?.message||'');
      if(message.includes('SEA_VIBE_CUSTOMER_USED_DELETE_BLOCKED'))throw new Error('لا يمكن حذف العميل لأنه استُخدم في رحلة سابقة. يمكنك إيقافه فقط.');
      if(message.includes('SEA_VIBE_CUSTOMER_DELETE_PERMISSION_REQUIRED'))throw new Error('لا توجد صلاحية حذف عملاء SEA VIBE.');
      throw error;
    }
  }

  async function ensureTripCustomer(record={}){
    const existingId=String(record.id||'').trim();if(existingId)return existingId;
    const number=String(record.number||'').trim(),name=String(record.name||'').trim();
    if(!number&&!name)return '';
    if(!number||!name)throw new Error('أدخل رقم العميل واسم العميل.');
    if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لإضافة عميل SEA VIBE جديد من الرحلة.');
    try{
      const result=await unwrap(client().rpc('ensure_sea_vibe_trip_customer_r44r14',{p_customer_number:number,p_full_name:name}),'تعذر تجهيز عميل الرحلة');
      const id=String(result?.id||'');if(!id)throw new Error('تعذر تحديد عميل الرحلة.');
      if(result?.created===true)await audit('insert','sea_vibe_customers',id,{customerNumber:number,fullName:name,source:'trip-entry'});
      await refreshSections(['customers']);return id;
    }catch(error){const message=String(error?.message||'');if(message.includes('SEA_VIBE_CUSTOMER_NUMBER_NAME_MISMATCH'))throw new Error('رقم العميل موجود بالفعل باسم مختلف. اختر العميل المسجل أو استخدم رقمًا جديدًا.');if(message.includes('SEA_VIBE_CUSTOMER_INACTIVE'))throw new Error('رقم العميل موجود لكنه غير نشط. فعّل العميل من شاشة عملاء SEA VIBE أولًا.');throw error;}
  }
  async function previewTripSerial(tripTypeId,tripDate){
    if(!tripTypeId)return '';
    if(navigator.onLine===false)return '';
    return String(await unwrap(client().rpc('preview_sea_vibe_trip_serial_r44r13',{p_trip_type_id:tripTypeId,p_trip_date:tripDate||localDateIso()}),'تعذر معاينة سيريال الرحلة')||'');
  }

  async function saveCommissionRule(record){const isUpdate=!!record.id;permission('seaVibeReference',isUpdate?'edit':'add');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحفظ بيانات العمولات.');const tripTypeIds=[...new Set((record.tripTypeIds||[]).filter(Boolean))];if(!tripTypeIds.length)throw new Error('حدد نوع رحلة واحدًا على الأقل.');const calculationValue=num(record.calculationValue);if(calculationValue<0)throw new Error('أدخل قيمة عمولة صحيحة.');if(record.calculationType==='percentage'&&calculationValue>100)throw new Error('نسبة العمولة يجب ألا تتجاوز 100%.');const id=await unwrap(client().rpc('sea_vibe_save_commission_rule_r44r7',{p_id:record.id||null,p_name_ar:String(record.nameAr||'').trim(),p_name_en:String(record.nameEn||'').trim(),p_beneficiary_type:record.beneficiaryType,p_employee_id:record.beneficiaryType==='employee'?(record.employeeId||null):null,p_broker_name:record.beneficiaryType==='broker'?String(record.brokerName||'').trim():null,p_calculation_type:record.calculationType,p_calculation_value:calculationValue,p_trip_type_ids:tripTypeIds,p_is_active:record.isActive!==false}),'تعذر حفظ العمولة');await audit(isUpdate?'update':'insert','sea_vibe_commission_rule',id,{nameAr:record.nameAr,beneficiaryType:record.beneficiaryType,calculationType:record.calculationType,calculationValue,tripTypeIds});await refreshSections(['commissionRules']);return id;}
  async function deleteCommissionRule(id){permission('seaVibeReference','delete');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحذف تعريف العمولة.');if(!id)throw new Error('تعريف العمولة غير محدد.');try{await unwrap(client().rpc('sea_vibe_delete_commission_rule_r44r10',{p_id:id}),'تعذر حذف العمولة');}catch(error){if(String(error?.message||'').includes('SEA_VIBE_COMMISSION_RULE_USED_DELETE_BLOCKED'))throw new Error('تم استخدام هذه العمولة في رحلة من قبل، لذلك لا يمكن حذفها. يمكنك إيقافها فقط.');throw error;}await audit('delete','sea_vibe_commission_rule',id,{});await refreshSections(['commissionRules']);return id;}
  async function previewCommissionRuleBackfill(id){permission('seaVibeReference','view');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لمعاينة التطبيق بأثر رجعي.');if(!id)throw new Error('تعريف العمولة غير محدد.');return await unwrap(client().rpc('preview_sea_vibe_commission_rule_backfill_r44r11',{p_rule_id:id}),'تعذر معاينة التطبيق بأثر رجعي');}
  async function backfillCommissionRule(id){permission('seaVibeReference','edit');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لتطبيق العمولة بأثر رجعي.');if(!id)throw new Error('تعريف العمولة غير محدد.');try{const result=await unwrap(client().rpc('sea_vibe_backfill_commission_rule_r44r11',{p_rule_id:id}),'تعذر تطبيق العمولة بأثر رجعي');await audit('historical_backfill','sea_vibe_commission_rule',id,result||{});await refreshSections(['expenses','commissionRules']);return result;}catch(error){const msg=String(error?.message||'');if(msg.includes('SEA_VIBE_COMMISSION_BACKFILL_SUPER_ADMIN_REQUIRED'))throw new Error('تطبيق العمولات بأثر رجعي متاح للسوبر أدمن فقط.');if(msg.includes('SEA_VIBE_COMMISSION_BACKFILL_ACTIVE_RULE_REQUIRED'))throw new Error('يجب تفعيل العمولة قبل تطبيقها بأثر رجعي.');if(msg.includes('SEA_VIBE_COMMISSION_BACKFILL_PAYROLL_STATEMENT_CONFLICT'))throw new Error('لا يمكن تطبيق عمولة موظف بأثر رجعي لأن هناك كشف راتب قائمًا يغطي إحدى الرحلات المستهدفة. راجع كشف الراتب أولًا.');throw error;}}

  function normalizePermitEntries(entries){const map=new Map();for(const raw of entries||[]){const people=Math.trunc(num(raw.peopleCount)),hours=permitDurationKey(raw.durationHours),points=Math.max(0,Math.trunc(num(raw.points)));if(people<1||people>10)continue;map.set(`${people}:${hours}`,{peopleCount:people,durationHours:hours,points,amount:permitCostFromPoints(points)});}return [...map.values()];}
  function expandPermitRows(entries){const rows=[];for(const x of normalizePermitEntries(entries)){const hoursList=x.durationHours===5?[5,6,7,8,9,10]:[x.durationHours];for(const h of hoursList){const existing=(memory||blank()).permitFees.find(r=>r.peopleCount===x.peopleCount&&r.durationHours===h);rows.push({peopleCount:x.peopleCount,durationHours:h,points:x.points,amount:x.amount,baseUpdatedAt:existing?.updatedAt||''});}}return rows;}
  async function savePermitFeesOnline(entries,options={}){const rows=Array.isArray(options.syncEntries)?options.syncEntries:expandPermitRows(entries);if(!rows.length)return;const operationKey=options.operationKey||newOperationKey('permit-fees-update');const result=await syncMutationOnline('permit_fees','update',operationKey,null,{entries:rows},'');if(!options.skipRefresh)await refreshSections(['permitFees']);else markSyncSections(['permitFees']);return result;}
  async function savePermitFees(entries,context={}){permission('seaVibeReference','edit');const clean=normalizePermitEntries(entries);if(!clean.length)return;const syncEntries=expandPermitRows(clean),operationKey=context.operationKey||newOperationKey('permit-fees-update');const applyLocal=()=>optimistic(s=>{for(const x of clean){const hoursList=x.durationHours===5?[5,6,7,8,9,10]:[x.durationHours];for(const h of hoursList){const row=s.permitFees.find(r=>r.peopleCount===x.peopleCount&&r.durationHours===h);const next={peopleCount:x.peopleCount,durationHours:h,points:x.points,amount:x.amount,updatedAt:nowIso()};if(row)Object.assign(row,next);else s.permitFees.push(next);}}});const queueIt=()=>enqueue('update',{kind:'permit_fees',mutation:'update',entries:syncEntries,operationKey},`permit-batch:${operationKey}`,[],'',operationKey);if(!context.skipOfflineQueue&&navigator.onLine===false){applyLocal();await queueIt();return;}try{return await savePermitFeesOnline(clean,{operationKey,syncEntries});}catch(e){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(e)){applyLocal();await queueIt();return;}throw e;}}

  async function savePermitFee(peopleCount,durationHours,points,context={}){return savePermitFees([{peopleCount,durationHours,points}],context);}

  async function topupZawelOnline(points,notes,transactionDate,options={}){const operationKey=options.operationKey||newOperationKey('zawel-topup');const result=await syncMutationOnline('zawel_topup','create',operationKey,null,{points:num(points),notes:String(notes||'').trim(),transactionDate:transactionDate||localDateIso()},'');await audit('topup','sea_vibe_zawel_transactions',result.id,{points:num(points)});if(!options.skipRefresh)await refreshSections(['zawelTransactions','zawelBalance','treasuryMovements']);else markSyncSections(['zawelTransactions','zawelBalance','treasuryMovements']);return result.id;}
  async function topupZawel(points,notes='',transactionDate='',context={}){permission('seaVibeZawel','add');const p=Math.trunc(num(points));if(p<=0)throw new Error('أدخل عدد نقاط صحيح أكبر من صفر.');const cost=Number((p*575/2500).toFixed(2)),movementDate=transactionDate||localDateIso(),operationKey=context.operationKey||newOperationKey('zawel-topup');const applyLocal=()=>{const id=localId('zawel-topup');optimistic(s=>{s.zawelTransactions.unshift({id,type:'topup',pointsDelta:p,cashAmount:cost,tripId:'',reference:`OFFLINE-${Date.now()}`,notes,transactionDate:movementDate,createdAt:nowIso(),updatedAt:nowIso()});recalcOptimisticZawelBalance(s);s.treasuryMovements.unshift({id:`zawel_topup:${id}`,serial:'',date:movementDate,at:nowIso(),type:'zawel_topup',amount:-cost,reference:'',description:'شحن رصيد زاول',tripId:'',assetId:'',sourceKind:'zawel_topup',sourceId:id,expenseGroupId:''});});return id;};const queueIt=id=>enqueue('create',{kind:'zawel_topup',mutation:'create',points:p,notes,transactionDate:movementDate,operationKey},id,[],'',operationKey);if(!context.skipOfflineQueue&&navigator.onLine===false){const id=applyLocal();await queueIt(id);return id;}try{return await topupZawelOnline(p,notes,movementDate,{operationKey});}catch(e){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(e)){const id=applyLocal();await queueIt(id);return id;}throw e;}}

  async function updateZawelTopup(id,points,notes='',transactionDate=''){ permission('seaVibeZawel','edit'); if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لتعديل حركة شحن زاول.'); const p=Math.trunc(num(points)); if(p<=0)throw new Error('أدخل عدد نقاط صحيح أكبر من صفر.'); await unwrap(client().rpc('sea_vibe_zawel_topup_update',{p_id:id,p_points:p,p_notes:String(notes||'').trim()||null,p_transaction_date:transactionDate||localDateIso()}),'تعذر تعديل حركة شحن زاول'); await audit('update','sea_vibe_zawel_transactions',id,{points:p,transactionDate:transactionDate||localDateIso()}); await refreshSections(['zawelTransactions','zawelBalance','treasuryMovements']); return id; }
  async function deleteZawelTopup(id){ permission('seaVibeZawel','delete'); if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحذف حركة شحن زاول.'); await unwrap(client().rpc('sea_vibe_zawel_topup_delete',{p_id:id}),'تعذر حذف حركة شحن زاول'); await audit('delete','sea_vibe_zawel_transactions',id,{}); await refreshSections(['zawelTransactions','zawelBalance','treasuryMovements']); return id; }

  async function topupFuelOnline(liters,value,notes,transactionDate,options={}){const operationKey=options.operationKey||newOperationKey('fuel-topup');const result=await syncMutationOnline('fuel_topup','create',operationKey,null,{liters:num(liters),value:num(value),notes:String(notes||'').trim(),transactionDate:transactionDate||localDateIso()},'');await audit('topup','sea_vibe_fuel_transactions',result.id,{liters:num(liters),value:num(value)});if(!options.skipRefresh)await refreshSections(['fuelTransactions','fuelBalance','treasuryMovements']);else markSyncSections(['fuelTransactions','fuelBalance','treasuryMovements']);return result.id;}
  async function topupFuel(liters,value,notes='',transactionDate='',context={}){permission('seaVibeFuel','add');const l=Number(num(liters).toFixed(3)),v=Number(num(value).toFixed(2));if(l<=0)throw new Error('أدخل كمية لترات صحيحة أكبر من صفر.');if(v<=0)throw new Error('أدخل قيمة شحن صحيحة أكبر من صفر.');const movementDate=transactionDate||localDateIso(),operationKey=context.operationKey||newOperationKey('fuel-topup');const applyLocal=()=>{const id=localId('fuel-topup'),unitPrice=Number((v/l).toFixed(6));optimistic(s=>{s.fuelTransactions.unshift({id,type:'topup',litersDelta:l,valueDelta:v,unitPriceSnapshot:unitPrice,valuationStatus:'valued',tripId:'',reference:`OFFLINE-${Date.now()}`,treasuryMovementSerial:'',notes,transactionDate:movementDate,createdAt:nowIso(),updatedAt:nowIso()});recalcOptimisticFuelBalance(s);s.treasuryMovements.unshift({id:`fuel_topup:${id}`,serial:'',date:movementDate,at:nowIso(),type:'fuel_topup',amount:-v,reference:'',description:'شحن رصيد البنزين',tripId:'',assetId:'',sourceKind:'fuel_topup',sourceId:id,expenseGroupId:''});});return id;};const queueIt=id=>enqueue('create',{kind:'fuel_topup',mutation:'create',liters:l,value:v,notes,transactionDate:movementDate,operationKey},id,[],'',operationKey);if(!context.skipOfflineQueue&&navigator.onLine===false){const id=applyLocal();await queueIt(id);return id;}try{return await topupFuelOnline(l,v,notes,movementDate,{operationKey});}catch(e){if(!context.skipOfflineQueue&&window.KYUMOfflineQueue?.isRetryableError?.(e)){const id=applyLocal();await queueIt(id);return id;}throw e;}}
  async function updateFuelTopup(id,liters,value,notes='',transactionDate=''){permission('seaVibeFuel','edit');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لتعديل حركة شحن البنزين.');const l=Number(num(liters).toFixed(3)),v=Number(num(value).toFixed(2));if(l<=0)throw new Error('أدخل كمية لترات صحيحة أكبر من صفر.');if(v<=0)throw new Error('أدخل قيمة شحن صحيحة أكبر من صفر.');await unwrap(client().rpc('sea_vibe_fuel_topup_update',{p_id:id,p_liters:l,p_value:v,p_notes:String(notes||'').trim()||null,p_transaction_date:transactionDate||localDateIso()}),'تعذر تعديل حركة شحن البنزين');await audit('update','sea_vibe_fuel_transactions',id,{liters:l,value:v,transactionDate:transactionDate||localDateIso()});await refreshSections(['fuelTransactions','fuelBalance','treasuryMovements']);return id;}
  async function deleteFuelTopup(id){permission('seaVibeFuel','delete');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لحذف حركة شحن البنزين.');await unwrap(client().rpc('sea_vibe_fuel_topup_delete',{p_id:id}),'تعذر حذف حركة شحن البنزين');await audit('delete','sea_vibe_fuel_transactions',id,{});await refreshSections(['fuelTransactions','fuelBalance','treasuryMovements']);return id;}

  async function previewFuelSettlement(cutoffDate){permission('seaVibeFuel','view');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لمعاينة تسوية البنزين.');if(!cutoffDate)throw new Error('حدد تاريخ التسوية.');return await unwrap(client().rpc('sea_vibe_fuel_settlement_preview_r44r4',{p_cutoff_date:cutoffDate}),'تعذر معاينة تسوية البنزين');}
  async function applyFuelSettlement(cutoffDate){permission('seaVibeFuel','edit');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لاعتماد تسوية البنزين.');if(!cutoffDate)throw new Error('حدد تاريخ التسوية.');const result=await unwrap(client().rpc('sea_vibe_apply_fuel_settlement_r44r4',{p_cutoff_date:cutoffDate}),'تعذر اعتماد تسوية البنزين');await audit('settlement','sea_vibe_fuel_settlements',result?.settlementId||'',result||{});await refreshSections(['trips','expenses','fuelTransactions','fuelBalance','fuelSettlements']);return result;}
  async function updateFuelSettlementConfig(peopleWeightPct,hoursWeightPct){permission('seaVibeReference','edit');if(navigator.onLine===false)throw new Error('يلزم الاتصال بالإنترنت لتعديل نسب تسوية البنزين.');const people=Number(Number(peopleWeightPct||0).toFixed(2)),hours=Number(Number(hoursWeightPct||0).toFixed(2));if(people<0||people>100||hours<0||hours>100||Number((people+hours).toFixed(2))!==100)throw new Error('يجب أن تكون نسبتا الأفراد والساعات بين 0 و100 ومجموعهما 100%.');const result=await unwrap(client().rpc('sea_vibe_update_fuel_settlement_config_r44r4',{p_people_weight_pct:people,p_hours_weight_pct:hours}),'تعذر حفظ نسب تسوية البنزين');await audit('update','sea_vibe_fuel_settlement_config','1',result||{});await refreshSections(['fuelSettlementConfig']);return result;}
  async function signedAttachment(path){ const {data,error}=await client().storage.from('sea-vibe-expenses').createSignedUrl(path,300);if(error)throw new Error(`تعذر فتح المرفق: ${error.message}`);return data?.signedUrl||''; }

  async function queueServerBase(kind,id){if(!id||String(id).startsWith('local:'))return '';const table=kind==='trip'?'sea_vibe_trips':kind==='asset'?'sea_vibe_assets':null;if(!table)return '';const row=await unwrap(client().from(table).select('updated_at').eq('id',id).single(),'تعذر التحقق من نسخة SEA VIBE على الخادم');return row?.updated_at||'';}
  async function handleQueuedMutation(operation,helpers){
    const p={...operation.payload};
    if(operation.action==='create'||operation.action==='update'){
      const kind=p.kind,mutation=p.mutation||operation.action,operationKey=p.operationKey||operation.idempotencyKey;
      serverReplayAnchors.set(operationKey,queueReplayAnchor(operation));
      if(kind==='trip'){
        const r={...(p.record||{})};if(r.tripTypeId)r.tripTypeId=await resolveQueuedId(r.tripTypeId,operation,helpers);let id=operation.action==='update'?await resolveQueuedId(r.id||operation.localEntityId,operation,helpers):null;let base=operation.baseUpdatedAt||'';if(operation.action==='update'&&String(r.id||'').startsWith('local:'))base=await queueServerBase('trip',id);const result=await syncMutationOnline('trip',mutation,operationKey,id,mutation==='status'?{status:p.status||r.status}:{date:r.date,startTime:r.startTime,durationHours:num(r.durationHours),peopleCount:num(r.peopleCount),tripTypeId:r.tripTypeId,customerId:r.customerId||'',totalValue:num(r.totalValue),notes:String(r.notes||'').trim()},base);markSyncSections(mutation==='status'?['trips']:['trips','expenses','zawelTransactions','zawelBalance','fuelTransactions','fuelBalance','treasuryMovements']);return{id:result.id};
      }
      if(kind==='asset'){
        const r={...(p.record||{})},localRef=r.id||operation.localEntityId;let id=operation.action==='update'?await resolveQueuedId(localRef,operation,helpers):null;let base=operation.baseUpdatedAt||'';if(operation.action==='update'&&String(localRef||'').startsWith('local:'))base=await queueServerBase('asset',id);const result=await syncMutationOnline('asset',mutation,operationKey,id,{name:String(r.name||'').trim(),initialValue:num(r.initialValue),notes:String(r.notes||'').trim(),isActive:r.isActive!==false},base);markSyncSections(['assets']);return{id:result.id};
      }
      if(kind==='trip_type_reference'){
        const r={...(p.record||{})},localRef=r.id||operation.localEntityId;let id=operation.action==='update'?await resolveQueuedId(localRef,operation,helpers):null;let base=operation.baseUpdatedAt||'';if(operation.action==='update'&&String(localRef||'').startsWith('local:')){const row=await unwrap(client().from('sea_vibe_trip_types').select('updated_at').eq('id',id).single(),'تعذر التحقق من نسخة نوع الرحلة');base=row?.updated_at||'';}const result=await syncMutationOnline('trip_type_reference',mutation,operationKey,id,{refKind:'tripTypes',nameAr:String(r.nameAr||'').trim(),nameEn:String(r.nameEn||'').trim(),isActive:r.isActive!==false,fuelCostAmount:num(r.fuelCostAmount),requiresCustomer:r.requiresCustomer!==false},base);markSyncSections(['tripTypes']);return{id:result.id};
      }
      if(kind==='reference'){
        const r={...(p.record||{})},localRef=r.id||operation.localEntityId;let id=operation.action==='update'?await resolveQueuedId(localRef,operation,helpers):null;let base=operation.baseUpdatedAt||'';if(operation.action==='update'&&String(localRef||'').startsWith('local:')){const section=p.refKind==='paymentMethods'?'sea_vibe_payment_methods':'sea_vibe_expense_catalog';const row=await unwrap(client().from(section).select('updated_at').eq('id',id).single(),'تعذر التحقق من نسخة البيانات المرجعية');base=row?.updated_at||'';}const result=await syncMutationOnline('reference',mutation,operationKey,id,{refKind:p.refKind,nameAr:String(r.nameAr||'').trim(),nameEn:String(r.nameEn||'').trim(),isActive:r.isActive!==false},base);markSyncSections([p.refKind==='paymentMethods'?'paymentMethods':'expenseCatalog']);return{id:result.id};
      }
      if(kind==='expense_batch'){
        const records=[];for(const raw of p.records||[]){const r={...raw};if(r.tripId)r.tripId=await resolveQueuedId(r.tripId,operation,helpers);if(r.assetId)r.assetId=await resolveQueuedId(r.assetId,operation,helpers);if(r.catalogId)r.catalogId=await resolveQueuedId(r.catalogId,operation,helpers);if(r.paymentMethodId)r.paymentMethodId=await resolveQueuedId(r.paymentMethodId,operation,helpers);r.file=r.filePayload?payloadToFile(r.filePayload):null;records.push(r);}const result=await addExpensesOnline(records,{operationKey,skipRefresh:true});return{id:result?.movement_group_id||result?.id||operation.localEntityId};
      }
      if(kind==='permit_fees'){const result=await syncMutationOnline('permit_fees','update',operationKey,null,{entries:p.entries||[]},'');markSyncSections(['permitFees']);return{id:result?.id||'permit-fees'};}
      if(kind==='zawel_topup'){const result=await syncMutationOnline('zawel_topup','create',operationKey,null,{points:num(p.points),notes:p.notes||'',transactionDate:p.transactionDate||''},'');markSyncSections(['zawelTransactions','zawelBalance','treasuryMovements']);return{id:result.id};}
      if(kind==='fuel_topup'){const result=await syncMutationOnline('fuel_topup','create',operationKey,null,{liters:num(p.liters),value:num(p.value),notes:p.notes||'',transactionDate:p.transactionDate||''},'');markSyncSections(['fuelTransactions','fuelBalance','treasuryMovements']);return{id:result.id};}
    }

    // Backward-compatible replay for operations queued before R31.
    const legacyKey=operation.idempotencyKey||`legacy:${operation.id}`;
    serverReplayAnchors.set(legacyKey,queueReplayAnchor(operation));
    if(operation.action==='trip_create'||operation.action==='trip_update'){const r={...p};if(r.tripTypeId)r.tripTypeId=await resolveQueuedId(r.tripTypeId,operation,helpers);const localRef=r.id||operation.localEntityId,id=operation.action==='trip_update'?await resolveQueuedId(localRef,operation,helpers):null,base=operation.action==='trip_update'?(String(localRef||'').startsWith('local:')?await queueServerBase('trip',id):operation.baseUpdatedAt||r.updatedAt||''):'';const result=await syncMutationOnline('trip',operation.action==='trip_update'?'update':'create',legacyKey,id,{date:r.date,startTime:r.startTime,durationHours:num(r.durationHours),peopleCount:num(r.peopleCount),tripTypeId:r.tripTypeId,customerId:r.customerId||'',totalValue:num(r.totalValue),notes:String(r.notes||'').trim()},base);markSyncSections(['trips','expenses','zawelTransactions','zawelBalance','fuelTransactions','fuelBalance','treasuryMovements']);return{id:result.id};}
    if(operation.action==='trip_close'||operation.action==='trip_reopen'){const localRef=p.id||operation.localEntityId,id=await resolveQueuedId(localRef,operation,helpers),base=String(localRef||'').startsWith('local:')?await queueServerBase('trip',id):operation.baseUpdatedAt||'';const result=await syncMutationOnline('trip','status',legacyKey,id,{status:operation.action==='trip_close'?'closed':'open'},base);markSyncSections(['trips']);return{id:result.id};}
    if(operation.action==='asset_create'||operation.action==='asset_update'){const localRef=p.id||operation.localEntityId,id=operation.action==='asset_update'?await resolveQueuedId(localRef,operation,helpers):null,base=operation.action==='asset_update'?(String(localRef||'').startsWith('local:')?await queueServerBase('asset',id):operation.baseUpdatedAt||p.updatedAt||''):'';const result=await syncMutationOnline('asset',operation.action==='asset_update'?'update':'create',legacyKey,id,{name:String(p.name||'').trim(),initialValue:num(p.initialValue),notes:String(p.notes||'').trim(),isActive:p.isActive!==false},base);markSyncSections(['assets']);return{id:result.id};}
    if(operation.action==='expense_create'||operation.action==='expense_batch_create'){const rawRecords=operation.action==='expense_create'?[p]:p.records||[],records=[];for(const raw of rawRecords){const r={...raw};if(r.tripId)r.tripId=await resolveQueuedId(r.tripId,operation,helpers);if(r.assetId)r.assetId=await resolveQueuedId(r.assetId,operation,helpers);if(r.catalogId)r.catalogId=await resolveQueuedId(r.catalogId,operation,helpers);if(r.paymentMethodId)r.paymentMethodId=await resolveQueuedId(r.paymentMethodId,operation,helpers);r.file=r.filePayload?payloadToFile(r.filePayload):null;records.push(r);}const result=await addExpensesOnline(records,{operationKey:legacyKey,skipRefresh:true});return{id:result?.movement_group_id||result?.expense_ids?.[0]||operation.localEntityId};}
    if(operation.action==='reference_create'||operation.action==='reference_update'){const r={...p.record},localRef=r.id||operation.localEntityId,id=operation.action==='reference_update'?await resolveQueuedId(localRef,operation,helpers):null,base=operation.action==='reference_update'?(operation.baseUpdatedAt||r.updatedAt||''):'';const result=await syncMutationOnline('reference',operation.action==='reference_update'?'update':'create',legacyKey,id,{refKind:p.kind,nameAr:String(r.nameAr||'').trim(),nameEn:String(r.nameEn||'').trim(),isActive:r.isActive!==false},base);markSyncSections([p.kind==='tripTypes'?'tripTypes':p.kind==='paymentMethods'?'paymentMethods':'expenseCatalog']);return{id:result.id};}
    if(operation.action==='permit_fee_update'||operation.action==='permit_fees_batch'){const source=operation.action==='permit_fee_update'?[{peopleCount:p.peopleCount,durationHours:p.durationHours,points:p.points}]:p.entries||[];const entries=expandPermitRows(source);const result=await syncMutationOnline('permit_fees','update',legacyKey,null,{entries},'');markSyncSections(['permitFees']);return{id:result?.id||'permit-fees'};}
    if(operation.action==='zawel_topup'){const result=await syncMutationOnline('zawel_topup','create',legacyKey,null,{points:num(p.points),notes:p.notes||'',transactionDate:p.transactionDate||''},'');markSyncSections(['zawelTransactions','zawelBalance','treasuryMovements']);return{id:result.id};}
    if(operation.action==='expense_delete'){const id=await resolveQueuedId(p.id,operation,helpers);await deleteExpenseOnline(id);return{id};}
    throw new Error('SEA VIBE offline action unsupported');
  }

  window.KYUMSyncEngine?.register?.('sea_vibe',context=>syncRefresh(context));
  window.KYUMOfflineQueue?.register?.('sea_vibe',handleQueuedMutation);


  window.SeaVibeService=Object.freeze({load,refresh,refreshCommissionEmployees,getSnapshot,getReadStatus,invalidate,previewTripAutomaticCosts,previewTripSerial,saveTrip,setTripStatus,saveCustomer,deleteCustomer,ensureTripCustomer,saveAsset,addExpenses,getExpenseMovement,updateExpenseMovement,deleteExpenseMovement,deleteExpense,saveReference,saveCommissionRule,deleteCommissionRule,previewCommissionRuleBackfill,backfillCommissionRule,savePermitFee,savePermitFees,topupZawel,updateZawelTopup,deleteZawelTopup,topupFuel,updateFuelTopup,deleteFuelTopup,previewFuelSettlement,applyFuelSettlement,updateFuelSettlementConfig,signedAttachment});
})();

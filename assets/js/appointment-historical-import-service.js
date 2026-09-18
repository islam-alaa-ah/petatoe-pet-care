(function(){
  'use strict';

  const SCREEN='appointmentDataImport';
  const VALIDATE_RPC='validate_appointment_historical_sales_r44r38r20';
  const IMPORT_RPC='import_appointment_historical_sales_r44r38r20';

  const t=(key,fallback)=>window.PetatoeLocalization?.t?.(key)||fallback;
  const client=()=>{
    if(!window.customerSupabase) throw new Error(t('appointmentDataImport.error.dbNotReady','Database service is not ready.'));
    return window.customerSupabase;
  };
  const can=action=>Boolean(window.PermissionEngine?.can?.(SCREEN,action)??window.CustomerPermissions?.canScreen?.(SCREEN,action));
  const requirePermission=action=>{
    if(can(action)) return true;
    throw new Error(t('appointmentDataImport.error.permission','You do not have permission for this action.'));
  };
  const requireOnline=()=>{
    if(navigator.onLine===false) throw new Error(t('appointmentDataImport.error.onlineRequired','An internet connection is required to validate or import historical data.'));
  };
  const unwrap=data=>{
    if(Array.isArray(data)&&data.length===1&&data[0]&&typeof data[0]==='object') return data[0];
    return data;
  };
  const translatedError=(error,fallback)=>{
    const raw=String(error?.message||'').trim();
    const translated=window.PetatoeLocalization?.translateMessage?.(raw)||raw;
    return translated||fallback;
  };

  async function validateRows(rows){
    requirePermission('view');
    requireOnline();
    if(!Array.isArray(rows)) throw new Error(t('appointmentDataImport.error.invalidRows','Historical data rows are invalid.'));
    const {data,error}=await client().rpc(VALIDATE_RPC,{p_rows:rows});
    if(error) throw new Error(translatedError(error,t('appointmentDataImport.error.validate','Unable to validate the historical data file.')));
    return unwrap(data)||{summary:{},rows:[]};
  }

  async function importRows(fileName,fileSha256,rows){
    requirePermission('add');
    requireOnline();
    if(!Array.isArray(rows)||rows.length===0) throw new Error(t('appointmentDataImport.error.noRows','There are no data rows to import.'));
    const {data,error}=await client().rpc(IMPORT_RPC,{
      p_file_name:String(fileName||'').trim(),
      p_file_sha256:String(fileSha256||'').trim()||null,
      p_rows:rows
    });
    if(error) throw new Error(translatedError(error,t('appointmentDataImport.error.import','Unable to import the historical data file.')));
    return unwrap(data)||{summary:{},rows:[]};
  }

  window.AppointmentHistoricalImportService=Object.freeze({
    screenKey:SCREEN,
    validateRows,
    importRows,
    can
  });
})();

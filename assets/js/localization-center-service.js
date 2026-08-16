(function(){
  'use strict';
  const db=()=>{if(!window.customerSupabase)throw new Error('اتصال Supabase غير جاهز.');return window.customerSupabase};
  async function listScreen(screenKey){const{data,error}=await db().from('app_translations').select('translation_key,screen_key,text_type,ar_text,en_text').eq('screen_key',screenKey).eq('is_active',true).order('translation_key');if(error)throw new Error(`تعذر تحميل الترجمات: ${error.message}`);return data||[]}
  async function saveScreen(screenKey,entries){if(!window.CustomerPermissions?.requireAction?.('translationCenter','edit',{silent:true}))throw new Error('ليس لديك صلاحية تعديل مركز الترجمه.');const uid=window.CustomerAuth?.getState?.().profile?.id||null,payload=(entries||[]).map(x=>({translation_key:x.translation_key,screen_key:screenKey,module_name:x.module_name||'appointments',text_type:x.text_type||'label',ar_text:String(x.ar_text||'').trim(),en_text:String(x.en_text||'').trim(),default_ar:String(x.default_ar||'').trim(),default_en:String(x.default_en||'').trim(),is_active:true,updated_by:uid,updated_at:new Date().toISOString()}));const{error}=await db().from('app_translations').upsert(payload,{onConflict:'translation_key'});if(error)throw new Error(`تعذر حفظ مركز الترجمه: ${error.message}`);return listScreen(screenKey)}
  window.LocalizationCenterService=Object.freeze({listScreen,saveScreen});
})();

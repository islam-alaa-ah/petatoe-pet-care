// Local UI smoke test: original HTML/CSS + notification runtime + fake Supabase.
// Requires Playwright and Chromium. No Supabase credentials or production access.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.P3_PLAYWRIGHT_MODULE||'playwright');
const output=process.env.P3_QA_OUTPUT;
if(output)await fs.mkdir(output,{recursive:true});
const bootstrap=String.raw`
  const params=new URLSearchParams(location.search),theme=params.get('theme')||'light';
  localStorage.setItem('petatoe-execution-pilot-language-v1',params.get('lang')||'ar');
  document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;
  document.body.classList.toggle('dark-mode',theme==='dark');
  document.getElementById('authLoadingOverlay').classList.add('hidden');
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  let state={user:{id:'A'},profile:{id:'A',role:'super_admin'},session:{user:{id:'A'}}};
  const makeRow=(id,extra={})=>({id,user_id:'A',event_key:'installation.request_updated',title:'تم تعديل الموعد',
    body:'تم التعديل على الطلب رقم 123',created_at:new Date().toISOString(),is_read:false,in_app_delivery:true,...extra});
  const data=[makeRow('n1'),makeRow('n2')],calls=[],channels=[],auth=[];
  window.CustomerAuth={getState:()=>state};
  window.CustomerPermissions={roleOptions:['super_admin','employee'],roleLabels:{super_admin:'Administrator',employee:'Employee'},requireAction:()=>true};
  window.customerSupabase={
    from(table){let action='read',values,filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},
      maybeSingle(){return q},in(){return q},upsert(v){action='write';values=v;return q},insert(v){action='write';values=v;return q},delete(){action='write';return q},
      update(v){action='write';values=v;return q},
      then(resolve,reject){calls.push({table,action,filters,values});let result=[];
        if(table==='notifications'){
          if(action==='write')data.forEach(row=>{if(filters.every(([k,v])=>row[k]===v))Object.assign(row,values)});
          result=data.filter(row=>filters.every(([k,v])=>row[k]===v)).map(row=>({...row}));
        }else if(table==='notification_system_settings')result={id:1,is_enabled:true};
        else if(table==='notification_event_settings')result=[{event_key:'installation.request_updated',event_name:'تعديل الطلب',module_name:'التركيبات',is_enabled:true,in_app_enabled:true,push_enabled:false,display_order:1,target_view:'installationRequests'}];
        else if(table==='notification_event_recipient_rules')result=[{event_key:'installation.request_updated',recipient_type:'role',role_key:'super_admin',is_active:true}];
        else if(table==='user_profiles')result=[{id:'A',role:'super_admin',full_name:'Local QA'}];
        return Promise.resolve({data:result,error:null}).then(resolve,reject);
      }};return q;
    },
    channel(name){const c={name,handlers:[],removed:false,on(type,filter,fn){c.handlers.push({type,filter,fn});return c},
      subscribe(fn){c.status=fn;queueMicrotask(()=>fn('SUBSCRIBED'));return c},
      event(type,row){for(const h of c.handlers)if(h.type==='postgres_changes'&&h.filter.event===type)h.fn({new:row})}};
      channels.push(c);return c;
    },
    async removeChannel(c){c.removed=true;return'ok'},
    auth:{onAuthStateChange(fn){auth.push(fn);return{data:{subscription:{unsubscribe(){}}}}}},
    functions:{async invoke(){return{data:{configured:false},error:null}}},
    async rpc(){return{error:null}}
  };
  window.KYUMSmartCache={async get(){return null},async set(){},async removePrefix(){}};
  window.P3Mock={calls,channels,makeRow,data,
    insert(id){const row=makeRow(id);data.push(row);channels.at(-1).event('INSERT',row)},
    update(id,values){const row=data.find(x=>x.id===id);Object.assign(row,values);channels.at(-1).event('UPDATE',{...row})},
    logout(){state={profile:null,user:null,session:null};for(const fn of auth)fn('SIGNED_OUT',null)}
  };
`;
const original=await fs.readFile(path.join(root,'index.html'),'utf8');
const html=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',`
  <script>${bootstrap}</script>
  <script src="assets/js/localization-center.js"></script>
  <script src="assets/js/notification-center-service.js"></script>
  <script src="assets/js/notification-center.js"></script>
  </body>`);
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return}
    const data=await fs.readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch(_){res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.P3_CHROMIUM?{executablePath:process.env.P3_CHROMIUM}:{}),args:['--no-sandbox']});
const results=[];
try{
  for(const device of [{name:'desktop',width:1440,height:1000,touch:false},{name:'tablet',width:820,height:1180,touch:true},{name:'mobile',width:390,height:844,touch:true}]){
    for(const lang of ['ar','en'])for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport:{width:device.width,height:device.height},hasTouch:device.touch,isMobile:device.touch,serviceWorkers:'block'});
      const page=await context.newPage(),errors=[],external=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        if(route.request().url().startsWith(origin+'/'))return route.continue();
        external.push(route.request().url());return route.abort();
      });
      await page.goto(origin+'/?lang='+lang+'&theme='+theme,{waitUntil:'load'});
      await page.waitForFunction(()=>document.getElementById('notificationUnreadBadge').textContent==='2');
      await page.evaluate(()=>{
        P3Mock.channels[0].event('INSERT',P3Mock.makeRow('n1'));
        P3Mock.insert('n3');P3Mock.update('n1',{is_read:true});
        window.dispatchEvent(new CustomEvent('customer-auth-ready'));
        window.dispatchEvent(new CustomEvent('kyum-auth-state-changed'));
      });
      assert.equal(await page.locator('[data-notification-id]').count(),3);
      assert.equal(await page.locator('#notificationUnreadBadge').textContent(),'2');
      const bell=page.locator('#notificationBellBtn');
      if(device.touch)await bell.tap();else await bell.click();
      await page.locator('#notificationDropdown').waitFor({state:'visible'});
      const geometry=await page.locator('#notificationDropdown').evaluate(el=>{
        const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,parent:el.parentElement.tagName,bg:getComputedStyle(el).backgroundColor}});
      assert.equal(geometry.parent,'BODY');assert.ok(geometry.x>=0&&geometry.x+geometry.width<=device.width+1);
      assert.ok(geometry.y>=0&&geometry.y+geometry.height<=device.height+1);
      const label=await bell.getAttribute('aria-label');assert.equal(label,lang==='en'?'Notifications':'الإشعارات');
      const text=await page.locator('[data-notification-id="n1"] strong').textContent();assert.ok(text.length>0);
      if(lang==='en')assert.doesNotMatch(text,/[\u0600-\u06ff]/);
      if(output)await page.screenshot({path:path.join(output,device.name+'-'+lang+'-'+theme+'.png')});
      await page.locator('#notificationMarkAllRead').click();
      await page.waitForFunction(()=>document.getElementById('notificationUnreadBadge').classList.contains('hidden'));
      await page.evaluate(()=>P3Mock.insert('n4'));await page.waitForFunction(()=>document.getElementById('notificationUnreadBadge').textContent==='1');
      const state=await page.evaluate(()=>({channels:P3Mock.channels.length,reads:P3Mock.calls.filter(x=>x.table==='notifications'&&x.action==='read').length}));
      assert.equal(state.channels,1);assert.equal(state.reads,1);
      await page.evaluate(()=>NotificationCenterUI.loadConfig());
      assert.equal(await page.locator('[data-notification-event]').count(),1);
      await page.evaluate(()=>P3Mock.logout());
      assert.equal(await page.locator('[data-notification-id]').count(),0);
      assert.equal(await page.locator('#notificationDropdown').isVisible(),false);
      assert.deepEqual(errors,[]);
      results.push({device:device.name,lang,theme,status:'PASS',...state,geometry,externalRequestsBlocked:external.length});
      console.log('PASS '+device.name+' / '+lang+' / '+theme);await context.close();
    }
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
if(output)await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify({mode:'local mocked Supabase; not production',cases:results},null,2)+'\n');
console.log(results.length+'/12 UI cases passed.');

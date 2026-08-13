/* OAVIX — Google Drive, persistent app session, per-account local data, offline queue. */
(function(){
  'use strict';
  if (window.__OAVIX_SYNC_V5__) return;
  window.__OAVIX_SYNC_V5__ = true;

  const CFG = window.OAVIX_GOOGLE_CLIENT_ID || '';
  const FILE_NAME = 'oavix-data.json';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DATA_KEYS = ['oavix_auto_records','oavix_auto_mileage','oavix_auto_categories','oavix_auto_unit','oavix_custom_bg','oavix_custom_neon','oavix_is_light','oavix_triggered_alarms','oavix_fuel_history','oavix_fuel_vehicle_config'];
  const SESSION_KEY = 'oavix_google_session';
  const ACCOUNT_PREFIX = 'oavix_account_';
  const META_SUFFIX = '__meta';
  const PENDING_KEY = 'oavix_sync_pending';
  const LAST_SYNC_KEY = 'oavix_sync_last';
  const DEBOUNCE = 1600;
  let tokenClient = null, accessToken = null, tokenExpiresAt = 0, fileId = null, busy = false, timer = null, authInProgress = false, accountEmail = '', pendingTokenResolve = null, pendingTokenReject = null;

  const nativeSet = localStorage.setItem.bind(localStorage);
  const nativeRemove = localStorage.removeItem.bind(localStorage);
  const nativeGet = localStorage.getItem.bind(localStorage);
  const accountKey = (email, key) => ACCOUNT_PREFIX + encodeURIComponent(email.toLowerCase()) + '__' + key;
  const metaKey = email => accountKey(email, META_SUFFIX);
  const localUpdatedKey = email => accountKey(email, 'local_updated');
  const needsPullKey = email => accountKey(email, 'needs_pull');
  const session = () => { try { return JSON.parse(nativeGet(SESSION_KEY) || 'null'); } catch { return null; } };

  /* Copias escritas antes de que estas claves se sincronizaran: no declaran `keys`,
     así que no pueden borrarlas del dispositivo. */
  const LEGACY_DATA_KEYS = DATA_KEYS.filter(k=>k!=='oavix_fuel_history'&&k!=='oavix_fuel_vehicle_config');
  const coveredKeys = copy => Array.isArray(copy&&copy.keys) ? copy.keys : LEGACY_DATA_KEYS;
  function dataSnapshot(){ const d={}; DATA_KEYS.forEach(k=>{const v=nativeGet(k); if(v!==null)d[k]=v;}); return d; }
  function dataString(){ return JSON.stringify(dataSnapshot()); }
  function accountSnapshot(email){ try{return JSON.parse(nativeGet(metaKey(email))||'null');}catch{return null;} }
  function saveAccountSnapshot(email, updatedAt){ if(!email)return; const snap={schemaVersion:5,updatedAt:updatedAt||new Date().toISOString(),keys:DATA_KEYS.slice(),data:dataSnapshot()}; nativeSet(metaKey(email),JSON.stringify(snap)); return snap; }
  function restoreAccount(email){ const snap=accountSnapshot(email); if(!snap)return false; const covered=coveredKeys(snap); DATA_KEYS.forEach(k=>{ if(Object.prototype.hasOwnProperty.call(snap.data||{},k)) nativeSet(k,snap.data[k]); else if(covered.includes(k)) nativeRemove(k); }); nativeSet(localUpdatedKey(email),snap.updatedAt||new Date().toISOString()); nativeSet(LAST_SYNC_KEY,snap.updatedAt||''); nativeRemove(PENDING_KEY); return true; }
  function clearActiveData(){ DATA_KEYS.forEach(k=>nativeRemove(k)); nativeRemove(LAST_SYNC_KEY); nativeRemove(PENDING_KEY); }
  function hasLegacyData(){ return DATA_KEYS.some(k=>nativeGet(k)!==null); }
  function legacyMigrationAllowed(){ return nativeGet('oavix_migration_v5')!=='done'; }

  const existingSession=session();
  if(existingSession && existingSession.email){ accountEmail=existingSession.email; restoreAccount(accountEmail); }
  else if(!legacyMigrationAllowed()) { clearActiveData(); }

  function toast(title,body,tone){ if(typeof window.showToast==='function')window.showToast(title,body,tone); else setTimeout(()=>{if(typeof window.showToast==='function')window.showToast(title,body,tone);},0); }
  function loadGIS(){ return new Promise((resolve,reject)=>{ if(window.google&&google.accounts&&google.accounts.oauth2){resolve();return;} const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.onload=resolve;s.onerror=()=>reject(new Error('No se pudo cargar Google Identity Services.'));document.head.appendChild(s); }); }
  async function aboutMe(){ const r=await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',{headers:{Authorization:'Bearer '+accessToken}}); if(!r.ok)throw new Error('No se pudo identificar la cuenta de Google.'); return r.json(); }
  function initTokenClient(){ if(tokenClient||!window.google)return; tokenClient=google.accounts.oauth2.initTokenClient({client_id:CFG,scope:DRIVE_SCOPE,include_granted_scopes:true,callback:resp=>{if(resp&&resp.access_token){accessToken=resp.access_token;tokenExpiresAt=Date.now()+Math.max(30,(resp.expires_in||3600)-30)*1000;if(pendingTokenResolve){const r=pendingTokenResolve;pendingTokenResolve=null;pendingTokenReject=null;r(resp);}}else if(pendingTokenReject){const r=pendingTokenReject;pendingTokenResolve=null;pendingTokenReject=null;r(new Error(resp&&resp.error_description||'Google no concedió acceso.'));}},error_callback:err=>{if(pendingTokenReject){const r=pendingTokenReject;pendingTokenResolve=null;pendingTokenReject=null;r(new Error(err&&err.type==='popup_closed'?'Se canceló el inicio de sesión.':'No se pudo abrir el acceso de Google.'));}}}); }
  function requestToken(interactive,loginHint){ return new Promise(async(resolve,reject)=>{ try{await loadGIS();initTokenClient();pendingTokenResolve=resolve;pendingTokenReject=reject;const cfg={login_hint:loginHint||undefined};if(interactive)cfg.prompt='select_account';else cfg.prompt='';tokenClient.requestAccessToken(cfg);}catch(e){pendingTokenResolve=null;pendingTokenReject=null;reject(e);} }); }
  async function ensureToken(interactive){ if(accessToken&&Date.now()<tokenExpiresAt)return accessToken; if(!CFG)throw new Error('Falta configurar el Client ID de Google.'); const resp=await requestToken(interactive,accountEmail||undefined); return resp.access_token; }
  async function drive(method,url,opts){ let token=await ensureToken(!!(opts&&opts.interactive)); const options=Object.assign({},opts||{}); delete options.interactive; options.method=method; options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+token}); let r=await fetch(url,options); if(r.status===401){accessToken=null;tokenExpiresAt=0;token=await ensureToken(true);options.headers.Authorization='Bearer '+token;r=await fetch(url,options);} if(!r.ok)throw new Error('Google Drive respondió con '+r.status); return r; }
  async function findFile(){ const q="name='"+FILE_NAME+"' and 'appDataFolder' in parents and trashed=false"; const r=await drive('GET','https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&spaces=appDataFolder&fields=files(id,name,modifiedTime)',{interactive:false}); const j=await r.json(); return j.files&&j.files[0]||null; }
  async function readCloud(){ const f=await findFile(); if(!f)return null; fileId=f.id; const r=await drive('GET','https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(f.id)+'?alt=media',{interactive:false}); const p=await r.json(); p.updatedAt=p.updatedAt||f.modifiedTime; return p; }
  async function writeCloud(payload){ const body=JSON.stringify(payload); let f=fileId?{id:fileId}:await findFile(); if(!f){const boundary='oavix_'+Math.random().toString(16).slice(2);const meta={name:FILE_NAME,parents:['appDataFolder'],mimeType:'application/json'};const multipart='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+boundary+'--';const r=await drive('POST','https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',{interactive:false,headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart});f=await r.json();}else{fileId=f.id;await drive('PATCH','https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(f.id)+'?uploadType=media',{interactive:false,headers:{'Content-Type':'application/json'},body});}fileId=f.id; }
  function payload(){ const snap=accountSnapshot(accountEmail); const updatedAt=nativeGet(localUpdatedKey(accountEmail)) || (snap&&snap.updatedAt) || new Date().toISOString(); saveAccountSnapshot(accountEmail,updatedAt); return {schemaVersion:5,app:'OAVIX',account:accountEmail,updatedAt,keys:DATA_KEYS.slice(),data:dataSnapshot()}; }
  function applyCloud(p){ if(!p||!p.data)return false; const covered=coveredKeys(p); DATA_KEYS.forEach(k=>{if(Object.prototype.hasOwnProperty.call(p.data,k))nativeSet(k,p.data[k]);else if(covered.includes(k))nativeRemove(k);}); nativeSet(localUpdatedKey(accountEmail),p.updatedAt||new Date().toISOString()); saveAccountSnapshot(accountEmail,p.updatedAt||new Date().toISOString());nativeSet(LAST_SYNC_KEY,p.updatedAt||'');nativeRemove(PENDING_KEY);nativeRemove(needsPullKey(accountEmail)); return true; }
  /* Un dispositivo que aún no conoce la cuenta debe traer los datos de Drive:
     nunca subir su copia vacía, que borraría el historial de la nube. */
  function mustPullFromCloud(){ return nativeGet(needsPullKey(accountEmail))==='true' || !nativeGet(localUpdatedKey(accountEmail)); }
  async function syncNow(interactive){
    if(busy||!accountEmail)return;
    /* Sin conexión solo avisamos si de verdad hay algo por subir: el sync
       automático de cada carga no debe marcar cambios pendientes. */
    if(!navigator.onLine){if(interactive||nativeGet(PENDING_KEY)==='true'){nativeSet(PENDING_KEY,'true');toast('✓ Guardado localmente','Se sincronizará automáticamente al conectarse a Internet.','amber');}return;}
    busy=true;
    try{
      toast('☁️ Sincronizando','Sincronizando con Google Drive…','cyan');
      const pullOnly=mustPullFromCloud();
      const cloud=await readCloud();
      const local=payload();
      if(!cloud){
        await writeCloud(local);
        nativeSet(LAST_SYNC_KEY,local.updatedAt);nativeRemove(PENDING_KEY);nativeRemove(needsPullKey(accountEmail));
        toast('✓ Sincronizado correctamente','Los datos están guardados en Google Drive.','emerald');
        return;
      }
      if(pullOnly&&applyCloud(cloud)){
        toast('✓ Datos restaurados','Se descargaron los datos de tu cuenta desde Google Drive.','emerald');
        setTimeout(()=>{window.location.reload();},600);
        return;
      }
      const localUpdated=Date.parse(local.updatedAt)||0,cloudUpdated=Date.parse(cloud.updatedAt)||Date.parse(cloud.modifiedTime)||0;
      const localChanged=dataString()!==JSON.stringify(cloud.data||{});
      if(!localChanged){
        saveAccountSnapshot(accountEmail,cloud.updatedAt);
        nativeSet(localUpdatedKey(accountEmail),cloud.updatedAt||local.updatedAt);nativeRemove(PENDING_KEY);nativeRemove(needsPullKey(accountEmail));
        toast('✓ Sincronizado correctamente','Todos los datos están actualizados.','emerald');
        return;
      }
      if(localUpdated>=cloudUpdated){
        await writeCloud(local);
        nativeSet(LAST_SYNC_KEY,local.updatedAt);nativeRemove(PENDING_KEY);nativeRemove(needsPullKey(accountEmail));
        toast('✓ Sincronizado correctamente','Se conservaron los cambios más recientes.','emerald');
      }else{
        /* index.html lee localStorage al cargar, así que recargamos para
           mostrar los datos que acaba de traer el otro dispositivo. */
        if(applyCloud(cloud))setTimeout(()=>{window.location.reload();},600);
        toast('✓ Sincronizado correctamente','Se conservaron los cambios más recientes.','emerald');
      }
    }catch(e){
      console.error('[OAVIX]',e);
      nativeSet(PENDING_KEY,'true');
      toast('⚠ Guardado localmente','Se intentará sincronizar automáticamente cuando haya conexión.','amber');
    }finally{busy=false;}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>syncNow(false),DEBOUNCE);}

  localStorage.setItem=function(k,v){nativeSet(k,v);if(accountEmail&&DATA_KEYS.includes(k)){const t=new Date().toISOString();nativeSet(localUpdatedKey(accountEmail),t);saveAccountSnapshot(accountEmail,t);nativeSet(PENDING_KEY,'true');schedule();}};
  localStorage.removeItem=function(k){nativeRemove(k);if(accountEmail&&DATA_KEYS.includes(k)){const t=new Date().toISOString();nativeSet(localUpdatedKey(accountEmail),t);saveAccountSnapshot(accountEmail,t);nativeSet(PENDING_KEY,'true');schedule();}};

  async function loginWithGoogle(){ if(authInProgress)return;authInProgress=true;try{if(!CFG)throw new Error('Falta configurar el Client ID de Google.');await loadGIS();initTokenClient();await requestToken(true,'');const me=await aboutMe();const email=me.user&&me.user.emailAddress;if(!email)throw new Error('Google no devolvió el correo de la cuenta.');const oldEmail=accountEmail;const firstMigration=!oldEmail&&legacyMigrationAllowed()&&hasLegacyData();if(firstMigration){const t=new Date().toISOString();nativeSet(localUpdatedKey(email),t);saveAccountSnapshot(email,t);nativeSet('oavix_migration_v5','done');}else if(accountSnapshot(email))restoreAccount(email);else{clearActiveData();nativeRemove(localUpdatedKey(email));nativeSet(needsPullKey(email),'true');}accountEmail=email;nativeSet(SESSION_KEY,JSON.stringify({email,displayName:(me.user&&me.user.displayName)||email}));nativeSet('oavix_current_user_name',email);nativeRemove('oavix_current_user_pin');location.reload();}catch(e){console.error('[OAVIX login]',e);toast('No se pudo iniciar sesión',e.message||'Google canceló el acceso.','rose');}finally{authInProgress=false;} }
  function logoutSessionV5(){if(accountEmail){const snap=accountSnapshot(accountEmail);saveAccountSnapshot(accountEmail,nativeGet(localUpdatedKey(accountEmail))||(snap&&snap.updatedAt)||new Date().toISOString());}accessToken=null;tokenExpiresAt=0;fileId=null;nativeRemove(SESSION_KEY);nativeRemove('oavix_current_user_name');nativeRemove('oavix_current_user_pin');clearActiveData();accountEmail='';setTimeout(()=>{window.location.reload();},100);}
  function buildLogin(){let modal=document.getElementById('modal-login');if(!modal){const container=document.createElement('div');container.id='modal-login';container.className='fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur';document.body.appendChild(container);modal=container;}modal.innerHTML='<div class="animated-glass-card rounded-3xl max-w-md w-full p-7 shadow-2xl space-y-5 border border-cyan-500/50 text-center"><div class="mx-auto w-16 h-16 rounded-2xl bg-slate-900 border border-cyan-500/40 flex items-center justify-center"><i class="fa-solid fa-cloud text-cyan-400 text-2xl"></i></div><div><h3 class="text-2xl font-black text-white">Bienvenido a OAVIX</h3><p class="text-sm text-slate-300 font-bold mt-2">Inicia sesión con tu cuenta de Google para sincronizar tus datos.</p></div><button id="oavix-google-login" type="button" class="w-full py-3 px-4 rounded-2xl bg-white text-slate-900 font-black flex items-center justify-center gap-3 hover:bg-slate-100 transition"><span class="text-lg font-black">G</span><span>Continuar con Google</span></button><p class="text-[11px] text-slate-400">Tus datos de OAVIX se guardan en el espacio privado de la cuenta seleccionada.</p></div>';modal.classList.remove('hidden');modal.style.display='flex';document.getElementById('oavix-google-login').onclick=loginWithGoogle;}
  function hideLogin(){const m=document.getElementById('modal-login');if(m){m.classList.add('hidden');m.style.display='none';}}
  function cleanHeader(){const top=document.querySelector('header .flex.flex-wrap.items-center.gap-1');if(top){top.querySelectorAll('button').forEach(b=>{if(b.getAttribute('onclick')==='giveAppLike()'||(b.title&&/Like/i.test(b.title)))b.remove();});}const like=document.getElementById('global-likes-count');if(like){const b=like.closest('button');if(b)b.remove();}const badge=document.getElementById('user-session-badge');if(badge)badge.remove();const bannerTag=document.getElementById('banner-username-tag');if(bannerTag){bannerTag.textContent=accountEmail?'Usuario: '+accountEmail:'';if(accountEmail)bannerTag.style.display='inline-flex';let wrap=bannerTag.parentElement;if(wrap&&!document.getElementById('oavix-banner-logout')){const out=document.createElement('button');out.id='oavix-banner-logout';out.type='button';out.className='px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/30 text-[10px] font-extrabold transition';out.textContent='Cerrar sesión';out.onclick=logoutSessionV5;wrap.appendChild(out);}}let drive=document.getElementById('oavix-drive-control');if(!drive){drive=document.createElement('button');drive.id='oavix-drive-control';drive.className='fixed top-[5.1rem] left-2 sm:left-6 z-40 p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-lg';drive.title='Sincronizar Google Drive';drive.innerHTML='<i class="fa-solid fa-cloud text-sm"></i>';document.body.appendChild(drive);}drive.onclick=()=>syncNow(true);}
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function css(){if(document.getElementById('oavix-v5-css'))return;const s=document.createElement('style');s.id='oavix-v5-css';s.textContent='#oavix-drive-control{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}#oavix-banner-logout{white-space:nowrap}@media(max-width:640px){#oavix-drive-control{top:5rem;left:.5rem}}';document.head.appendChild(s);}
  function installPwa(){if(!document.querySelector('link[rel=manifest]')){const l=document.createElement('link');l.rel='manifest';l.href='manifest.webmanifest?v=5';document.head.appendChild(l);}if(!document.querySelector('link[rel=icon]')){const l=document.createElement('link');l.rel='icon';l.href='icon.svg?v=5';l.type='image/svg+xml';document.head.appendChild(l);}if(!document.querySelector('link[rel=apple-touch-icon]')){const l=document.createElement('link');l.rel='apple-touch-icon';l.href='icon.svg?v=5';document.head.appendChild(l);}const metas=[['theme-color','#030712'],['mobile-web-app-capable','yes'],['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-status-bar-style','black-translucent'],['apple-mobile-web-app-title','OAVIX']];metas.forEach(([n,c])=>{if(!document.querySelector('meta[name="'+n+'"]')){const m=document.createElement('meta');m.name=n;m.content=c;document.head.appendChild(m);}});if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js?v=6').catch(()=>{});}
  function initUI(){css();cleanHeader();installPwa();if(accountEmail)hideLogin();else buildLogin();window.handleLoginSubmit=()=>false;window.logoutSession=logoutSessionV5;window.checkLoginState=function(){if(accountEmail)hideLogin();else buildLogin();};}
  window.OAVIXDriveSync={syncNow:()=>syncNow(true),loginWithGoogle,logoutSession:logoutSessionV5,refreshUI:initUI};
  window.addEventListener('online',()=>{if(accountEmail&&nativeGet(PENDING_KEY)==='true')setTimeout(()=>syncNow(false),400);});
  window.addEventListener('beforeunload',()=>{if(accountEmail)saveAccountSnapshot(accountEmail,nativeGet(localUpdatedKey(accountEmail))||(accountSnapshot(accountEmail)||{}).updatedAt||new Date().toISOString());});
  /* La UI de sesión debe existir antes de que los listeners de index.html
     consulten checkLoginState; diferirla un turno dejaba la app a medio iniciar. */
  document.addEventListener('DOMContentLoaded',()=>{initUI();if(accountEmail&&navigator.onLine)setTimeout(()=>syncNow(false),900);},{once:true});
  document.addEventListener('oavix:views-ready',initUI);
})();

/* OAVIX — ajustes puntuales de mantenimiento y calendario. */
(function(){
  'use strict';

  const DEFAULT_CATEGORIES = [
    'Mantenimiento General',
    'Cambio de Aceite',
    'Llantas / Frenos',
    'Combustible',
    'Reparaciones'
  ];
  const CATEGORY_KEY = 'oavix_auto_categories';
  const CATEGORY_INIT_KEY = 'oavix_auto_categories_initialized';

  function fixCategories(){
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(CATEGORY_KEY)); } catch (_) { stored = null; }

    /* Si una instalación anterior dejó la lista vacía sin haber sido gestionada
       por el usuario, recuperamos las categorías iniciales una sola vez. */
    if (Array.isArray(stored) && stored.length === 0 && !localStorage.getItem(CATEGORY_INIT_KEY)) {
      stored = DEFAULT_CATEGORIES.slice();
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(stored));
    }

    if (!Array.isArray(stored)) {
      stored = DEFAULT_CATEGORIES.slice();
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(stored));
    }

    if (Array.isArray(window.autoCategories)) {
      window.autoCategories.splice(0, window.autoCategories.length, ...stored);
    }

    localStorage.setItem(CATEGORY_INIT_KEY, 'true');

    if (typeof window.setupCategoryDropdowns === 'function') {
      window.setupCategoryDropdowns();
    }
  }

  function keepCategoryStateManaged(){
    if (typeof window.addNewCategory === 'function' && !window.__OAVIX_CATEGORY_WRAPPED__) {
      const originalAdd = window.addNewCategory;
      window.addNewCategory = function(){
        originalAdd.apply(this, arguments);
        localStorage.setItem(CATEGORY_INIT_KEY, 'true');
      };

      const originalDelete = window.deleteCategory;
      if (typeof originalDelete === 'function') {
        window.deleteCategory = function(){
          originalDelete.apply(this, arguments);
          localStorage.setItem(CATEGORY_INIT_KEY, 'true');
        };
      }
      window.__OAVIX_CATEGORY_WRAPPED__ = true;
    }
  }

  function applyFixes(){
    fixCategories();
    keepCategoryStateManaged();

    /* El calendario ya conserva selectedCalendarMonth/selectedCalendarYear
       durante toda la sesión y se inicializa con el mes actual al recargar.
       No se guarda en localStorage para que una recarga vuelva al mes actual. */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(applyFixes, 0); }, {once:true});
  } else {
    setTimeout(applyFixes, 0);
  }
})();

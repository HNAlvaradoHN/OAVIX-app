/* OAVIX — Google Drive, persistent app session, per-account local data, offline queue.
   v6 - Fixed: session persistence, silent token refresh, initial pull, conflict resolution, UI refresh */
(function(){
  'use strict';
  if (window.__OAVIX_SYNC_V6__) return;
  window.__OAVIX_SYNC_V6__ = true;

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

  const LEGACY_DATA_KEYS = DATA_KEYS.filter(k=>k!=='oavix_fuel_history'&&k!=='oavix_fuel_vehicle_config');
  const coveredKeys = copy => Array.isArray(copy&&copy.keys) ? copy.keys : LEGACY_DATA_KEYS;
  function dataSnapshot(){ const d={}; DATA_KEYS.forEach(k=>{const v=nativeGet(k); if(v!==null)d[k]=v;}); return d; }
  function dataString(){ return JSON.stringify(dataSnapshot()); }
  function accountSnapshot(email){ try{return JSON.parse(nativeGet(metaKey(email))||'null');}catch{return null;} }
  function saveAccountSnapshot(email, updatedAt){ if(!email)return; const snap={schemaVersion:6,updatedAt:updatedAt||new Date().toISOString(),keys:DATA_KEYS.slice(),data:dataSnapshot()}; nativeSet(metaKey(email),JSON.stringify(snap)); return snap; }
  function restoreAccount(email){ const snap=accountSnapshot(email); if(!snap)return false; const covered=coveredKeys(snap); DATA_KEYS.forEach(k=>{ if(Object.prototype.hasOwnProperty.call(snap.data||{},k)) nativeSet(k,snap.data[k]); else if(covered.includes(k)) nativeRemove(k); }); nativeSet(localUpdatedKey(email),snap.updatedAt||new Date().toISOString()); nativeSet(LAST_SYNC_KEY,snap.updatedAt||''); nativeRemove(PENDING_KEY); return true; }
  function clearActiveData(){ DATA_KEYS.forEach(k=>nativeRemove(k)); nativeRemove(LAST_SYNC_KEY); nativeRemove(PENDING_KEY); }
  function hasLegacyData(){ return DATA_KEYS.some(k=>nativeGet(k)!==null); }

  const existingSession=session();
  if(existingSession && existingSession.email){ 
    accountEmail=existingSession.email; 
    const restored = restoreAccount(accountEmail);
    // FIX: Si no hay snapshot local, marcamos necesidad de pull inicial
    if(!restored){
      nativeSet(needsPullKey(accountEmail), 'true');
    }
  } else {
    clearActiveData();
  }

  function toast(title,body,tone){ if(typeof window.showToast==='function')window.showToast(title,body,tone); else setTimeout(()=>{if(typeof window.showToast==='function')window.showToast(title,body,tone);},0); }
  
  function loadGIS(){ 
    return new Promise((resolve,reject)=>{ 
      if(window.google&&google.accounts&&google.accounts.oauth2){resolve();return;} 
      const s=document.createElement('script');
      s.src='https://accounts.google.com/gsi/client';
      s.async=true;
      s.defer=true;
      s.onload=resolve;
      s.onerror=()=>reject(new Error('No se pudo cargar Google Identity Services.'));
      document.head.appendChild(s); 
    }); 
  }
  
  async function aboutMe(){ 
    const r=await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',{
      headers:{Authorization:'Bearer '+accessToken}
    }); 
    if(!r.ok)throw new Error('No se pudo identificar la cuenta de Google.'); 
    return r.json(); 
  }
  
  function initTokenClient(){ 
    if(tokenClient||!window.google)return; 
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:CFG,
      scope:DRIVE_SCOPE,
      include_granted_scopes:true,
      callback:resp=>{
        if(resp&&resp.access_token){
          accessToken=resp.access_token;
          tokenExpiresAt=Date.now()+Math.max(30,(resp.expires_in||3600)-30)*1000;
          if(pendingTokenResolve){
            const r=pendingTokenResolve;
            pendingTokenResolve=null;
            pendingTokenReject=null;
            r(resp);
          }
        } else if(pendingTokenReject){
          const r=pendingTokenReject;
          pendingTokenResolve=null;
          pendingTokenReject=null;
          r(new Error(resp&&resp.error_description||'Google no concedió acceso.'));
        }
      },
      error_callback:err=>{
        if(pendingTokenReject){
          const r=pendingTokenReject;
          pendingTokenResolve=null;
          pendingTokenReject=null;
          r(new Error(err&&err.type==='popup_closed'?'Se canceló el inicio de sesión.':'No se pudo abrir el acceso de Google.'));
        }
      }
    }); 
  }
  
  function requestToken(interactive,loginHint){ 
    return new Promise(async(resolve,reject)=>{ 
      try{
        await loadGIS();
        initTokenClient();
        pendingTokenResolve=resolve;
        pendingTokenReject=reject;
        const cfg={login_hint:loginHint||undefined};
        if(interactive) cfg.prompt='select_account';
        else cfg.prompt='none'; // FIX: SILENT REFRESH - no popup
        tokenClient.requestAccessToken(cfg);
      } catch(e){
        pendingTokenResolve=null;
        pendingTokenReject=null;
        reject(e);
      } 
    }); 
  }
  
  async function ensureToken(interactive){ 
    if(accessToken && Date.now() < tokenExpiresAt) return accessToken; 
    if(!CFG) throw new Error('Falta configurar el Client ID de Google.'); 
    
    // FIX: Intentar refresh silencioso primero
    if(!interactive && tokenClient){
      try {
        const resp = await requestToken(false, accountEmail || undefined);
        return resp.access_token;
      } catch (silentErr) {
        // Si falla silencioso, caemos al flujo interactivo si se permite
        if(!interactive) throw silentErr;
      }
    }
    
    const resp = await requestToken(interactive, accountEmail || undefined); 
    return resp.access_token; 
  }
  
  async function drive(method,url,opts){ 
    let token = await ensureToken(!!(opts&&opts.interactive)); 
    const options = Object.assign({}, opts||{}); 
    delete options.interactive; 
    options.method = method; 
    options.headers = Object.assign({}, options.headers||{}, {Authorization:'Bearer '+token}); 
    let r = await fetch(url, options); 
    if(r.status===401){
      accessToken=null;
      tokenExpiresAt=0;
      // FIX: Forzar re-autenticación silenciosa
      try {
        token = await ensureToken(false);
      } catch(_) {
        // Si falla silencioso, pedir interacción
        token = await ensureToken(true);
      }
      options.headers.Authorization = 'Bearer '+token;
      r = await fetch(url, options);
    } 
    if(!r.ok) throw new Error('Google Drive respondió con '+r.status); 
    return r; 
  }
  
  async function findFile(){ 
    const q = "name='"+FILE_NAME+"' and 'appDataFolder' in parents and trashed=false"; 
    const r = await drive('GET','https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&spaces=appDataFolder&fields=files(id,name,modifiedTime)',{interactive:false}); 
    const j = await r.json(); 
    return j.files && j.files[0] || null; 
  }
  
  async function readCloud(){ 
    const f = await findFile(); 
    if(!f) return null; 
    fileId = f.id; 
    const r = await drive('GET','https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(f.id)+'?alt=media',{interactive:false}); 
    const p = await r.json(); 
    p.updatedAt = p.updatedAt || f.modifiedTime; 
    return p; 
  }
  
  async function writeCloud(payload){ 
    const body = JSON.stringify(payload); 
    let f = fileId ? {id:fileId} : await findFile(); 
    if(!f){
      const boundary = 'oavix_'+Math.random().toString(16).slice(2);
      const meta = {name:FILE_NAME, parents:['appDataFolder'], mimeType:'application/json'};
      const multipart = '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+boundary+'--';
      const r = await drive('POST','https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',{
        interactive:false,
        headers:{'Content-Type':'multipart/related; boundary='+boundary},
        body:multipart
      });
      f = await r.json();
    } else {
      fileId = f.id;
      await drive('PATCH','https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(f.id)+'?uploadType=media',{
        interactive:false,
        headers:{'Content-Type':'application/json'},
        body
      });
    }
    fileId = f.id; 
  }
  
  function payload(){ 
    const snap = accountSnapshot(accountEmail); 
    const updatedAt = nativeGet(localUpdatedKey(accountEmail)) || (snap&&snap.updatedAt) || new Date().toISOString(); 
    saveAccountSnapshot(accountEmail, updatedAt); 
    return {
      schemaVersion:6,
      app:'OAVIX',
      account:accountEmail,
      updatedAt,
      keys:DATA_KEYS.slice(),
      data:dataSnapshot()
    }; 
  }
  
  function applyCloud(p){ 
    if(!p || !p.data) return false; 
    const covered = coveredKeys(p); 
    DATA_KEYS.forEach(k => {
      if(Object.prototype.hasOwnProperty.call(p.data, k)) nativeSet(k, p.data[k]);
      else if(covered.includes(k)) nativeRemove(k);
    }); 
    nativeSet(localUpdatedKey(accountEmail), p.updatedAt || new Date().toISOString()); 
    saveAccountSnapshot(accountEmail, p.updatedAt || new Date().toISOString());
    nativeSet(LAST_SYNC_KEY, p.updatedAt || '');
    nativeRemove(PENDING_KEY);
    nativeRemove(needsPullKey(accountEmail)); 
    return true; 
  }
  
  function mustPullFromCloud(){ 
    return nativeGet(needsPullKey(accountEmail)) === 'true' || 
           !nativeGet(localUpdatedKey(accountEmail)) ||
           !accountSnapshot(accountEmail); // FIX: Si no hay snapshot local, forzar pull
  }
  
  async function syncNow(interactive){
    if(busy || !accountEmail) return;
    
    if(!navigator.onLine){
      if(interactive || nativeGet(PENDING_KEY)==='true'){
        nativeSet(PENDING_KEY,'true');
        toast('✓ Guardado localmente','Se sincronizará al conectarse a Internet.','amber');
      }
      return;
    }
    
    busy = true;
    
    try {
      if(interactive) toast('☁️ Sincronizando','Conectando con Google Drive…','cyan');
      
      const pullOnly = mustPullFromCloud();
      const cloud = await readCloud();
      const local = payload();
      
      // FIX: Si no hay nada en Drive, subir lo local
      if(!cloud){
        await writeCloud(local);
        nativeSet(LAST_SYNC_KEY, local.updatedAt);
        nativeRemove(PENDING_KEY);
        nativeRemove(needsPullKey(accountEmail));
        if(interactive) toast('✓ Sincronizado','Datos guardados en Google Drive por primera vez.','emerald');
        return;
      }
      
      // FIX: Si este dispositivo nunca ha sincronizado, descargar TODO de la nube
      if(pullOnly){
        if(applyCloud(cloud)){
          if(interactive) toast('✓ Datos restaurados','Se descargaron los datos desde tu cuenta de Google.','emerald');
          // FIX: Recargar para reflejar los cambios en pantalla
          setTimeout(() => { window.location.reload(); }, 600);
          return;
        }
      }
      
      const localUpdated = Date.parse(local.updatedAt) || 0;
      const cloudUpdated = Date.parse(cloud.updatedAt) || Date.parse(cloud.modifiedTime) || 0;
      const localDataStr = dataString();
      const cloudDataStr = JSON.stringify(cloud.data || {});
      const localChanged = localDataStr !== cloudDataStr;
      
      // FIX: Si los datos son idénticos, solo actualizar timestamp
      if(!localChanged){
        saveAccountSnapshot(accountEmail, cloud.updatedAt);
        nativeSet(localUpdatedKey(accountEmail), cloud.updatedAt || local.updatedAt);
        nativeRemove(PENDING_KEY);
        nativeRemove(needsPullKey(accountEmail));
        if(interactive) toast('✓ Todo al día','Los datos ya están sincronizados.','emerald');
        return;
      }
      
      // FIX: Resolver conflicto por timestamp
      if(localUpdated >= cloudUpdated){
        // Lo local es más reciente: subir
        await writeCloud(local);
        nativeSet(LAST_SYNC_KEY, local.updatedAt);
        nativeRemove(PENDING_KEY);
        nativeRemove(needsPullKey(accountEmail));
        if(interactive) toast('✓ Sincronizado','Tus cambios locales se subieron a la nube.','emerald');
      } else {
        // La nube es más reciente: descargar y recargar UI
        if(applyCloud(cloud)){
          if(interactive) toast('✓ Actualizado','Se descargaron cambios desde otro dispositivo.','emerald');
          // FIX: Forzar recarga para que la UI muestre los datos nuevos
          setTimeout(() => { window.location.reload(); }, 600);
        }
      }
    } catch(e) {
      console.error('[OAVIX sync]', e);
      nativeSet(PENDING_KEY, 'true');
      
      // FIX: Si el error es de autenticación, avisar claramente
      const msg = e.message || '';
      if(msg.includes('401') || msg.includes('403') || msg.includes('cancelled') || msg.includes('popup')){
        toast('⚠ Sesión expirada','Toca el botón de la nube para reconectar tu cuenta.','amber');
      } else {
        toast('⚠ Guardado localmente','Se sincronizará automáticamente al reconectar.','amber');
      }
    } finally {
      busy = false;
    }
  }
  
  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(false), DEBOUNCE);
  }

  // Interceptores de localStorage para autoguardado
  localStorage.setItem = function(k, v){
    nativeSet(k, v);
    if(accountEmail && DATA_KEYS.includes(k)){
      const t = new Date().toISOString();
      nativeSet(localUpdatedKey(accountEmail), t);
      saveAccountSnapshot(accountEmail, t);
      nativeSet(PENDING_KEY, 'true');
      schedule();
    }
  };
  
  localStorage.removeItem = function(k){
    nativeRemove(k);
    if(accountEmail && DATA_KEYS.includes(k)){
      const t = new Date().toISOString();
      nativeSet(localUpdatedKey(accountEmail), t);
      saveAccountSnapshot(accountEmail, t);
      nativeSet(PENDING_KEY, 'true');
      schedule();
    }
  };

  async function loginWithGoogle(){ 
    if(authInProgress) return;
    authInProgress = true;
    try {
      if(!CFG) throw new Error('Falta configurar el Client ID de Google.');
      await loadGIS();
      initTokenClient();
      await requestToken(true, '');
      const me = await aboutMe();
      const email = me.user && me.user.emailAddress;
      if(!email) throw new Error('Google no devolvió el correo.');
      
      const oldEmail = accountEmail;
      
      // FIX: Si cambió de cuenta, no heredar datos de la cuenta anterior
      if(oldEmail && oldEmail !== email){
        clearActiveData();
        nativeSet(needsPullKey(email), 'true');
      } else if(!oldEmail){
        // Primera vez: migrar datos legacy si existen
        if(hasLegacyData()){
          const t = new Date().toISOString();
          nativeSet(localUpdatedKey(email), t);
          saveAccountSnapshot(email, t);
        } else {
          nativeSet(needsPullKey(email), 'true');
        }
      } else {
        // Misma cuenta: restaurar snapshot si existe, sino marcar para pull
        if(accountSnapshot(email)) {
          restoreAccount(email);
        } else {
          nativeSet(needsPullKey(email), 'true');
        }
      }
      
      accountEmail = email;
      nativeSet(SESSION_KEY, JSON.stringify({
        email, 
        displayName: (me.user && me.user.displayName) || email
      }));
      nativeSet('oavix_current_user_name', email);
      nativeRemove('oavix_current_user_pin');
      
      // FIX: Recargar con la sesión lista
      setTimeout(() => location.reload(), 100);
    } catch(e) {
      console.error('[OAVIX login]', e);
      toast('No se pudo iniciar sesión', e.message || 'Google canceló el acceso.', 'rose');
    } finally {
      authInProgress = false;
    } 
  }
  
  function logoutSessionV6(){
    if(accountEmail){
      const snap = accountSnapshot(accountEmail);
      saveAccountSnapshot(accountEmail, 
        nativeGet(localUpdatedKey(accountEmail)) || 
        (snap && snap.updatedAt) || 
        new Date().toISOString()
      );
    }
    accessToken = null;
    tokenExpiresAt = 0;
    fileId = null;
    nativeRemove(SESSION_KEY);
    nativeRemove('oavix_current_user_name');
    nativeRemove('oavix_current_user_pin');
    // FIX: NO borrar datos locales de la cuenta al cerrar sesión
    // Solo borramos la sesión. Al volver a entrar se restauran.
    clearActiveData();
    accountEmail = '';
    setTimeout(() => { window.location.reload(); }, 100);
  }
  
  function buildLogin(){
    let modal = document.getElementById('modal-login');
    if(!modal){
      const container = document.createElement('div');
      container.id = 'modal-login';
      container.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur';
      document.body.appendChild(container);
      modal = container;
    }
    modal.innerHTML = '<div class="animated-glass-card rounded-3xl max-w-md w-full p-7 shadow-2xl space-y-5 border border-cyan-500/50 text-center"><div class="mx-auto w-16 h-16 rounded-2xl bg-slate-900 border border-cyan-500/40 flex items-center justify-center"><i class="fa-solid fa-cloud text-cyan-400 text-2xl"></i></div><div><h3 class="text-2xl font-black text-white">Bienvenido a OAVIX</h3><p class="text-sm text-slate-300 font-bold mt-2">Inicia sesión con Google para sincronizar tus datos entre todos tus dispositivos.</p></div><button id="oavix-google-login" type="button" class="w-full py-3 px-4 rounded-2xl bg-white text-slate-900 font-black flex items-center justify-center gap-3 hover:bg-slate-100 transition"><span class="text-lg font-black">G</span><span>Continuar con Google</span></button><p class="text-[11px] text-slate-400">Tus datos se guardan en el espacio privado de tu cuenta de Google.</p></div>';
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.getElementById('oavix-google-login').onclick = loginWithGoogle;
  }
  
  function hideLogin(){
    const m = document.getElementById('modal-login');
    if(m){ m.classList.add('hidden'); m.style.display = 'none'; }
  }
  
  function cleanHeader(){
    const top = document.querySelector('header .flex.flex-wrap.items-center.gap-1');
    if(top){
      top.querySelectorAll('button').forEach(b=>{
        if(b.getAttribute('onclick')==='giveAppLike()' || (b.title && /Like/i.test(b.title))) b.remove();
      });
    }
    const like = document.getElementById('global-likes-count');
    if(like){ const b = like.closest('button'); if(b) b.remove(); }
    
    const badge = document.getElementById('user-session-badge');
    if(badge) badge.remove();
    
    const bannerTag = document.getElementById('banner-username-tag');
    if(bannerTag){
      bannerTag.textContent = accountEmail ? 'Usuario: '+accountEmail : '';
      if(accountEmail) banner
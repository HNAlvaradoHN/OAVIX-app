/* OAVIX Unified Sync v7 - Login persistente, Drive por cuenta, categorías, fotos */
(function(){
  'use strict';
  if (window.__OAVIX_UNIFIED_V7__) return;
  window.__OAVIX_UNIFIED_V7__ = true;

  var CFG = window.OAVIX_GOOGLE_CLIENT_ID || '';
  var FILE_NAME = 'oavix-data.json';
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var KEYS = [
    'oavix_auto_records','oavix_auto_mileage','oavix_auto_categories',
    'oavix_auto_unit','oavix_custom_bg','oavix_custom_neon','oavix_is_light',
    'oavix_triggered_alarms','oavix_fuel_history','oavix_fuel_vehicle_config',
    'oavix_auto_categories_initialized','oavix_migration_v7'
  ];
  var SESSION_KEY = 'oavix_google_session';
  var UPDATED_KEY = 'oavix_unified_updated';
  var email='', token=null, expires=0, fileId=null, busy=false, timer=null;
  var nativeSet = localStorage.setItem.bind(localStorage);
  var nativeGet = localStorage.getItem.bind(localStorage);
  var nativeDel = localStorage.removeItem.bind(localStorage);

  function snap(){ var d={}; KEYS.forEach(function(k){ var v=nativeGet(k); if(v!==null) d[k]=v; }); return d; }
  function snapStr(){ return JSON.stringify(snap()); }

  function loadGIS(){ return new Promise(function(res,rej){ if(window.google&&google.accounts&&google.accounts.oauth2) return res(); var s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.onload=res; s.onerror=function(){rej(new Error('GIS no cargó'));}; document.head.appendChild(s); }); }

  function askToken(interactive){ return new Promise(function(res,rej){ loadGIS().then(function(){ if(!window.__u7c){ window.__u7c=google.accounts.oauth2.initTokenClient({ client_id:CFG, scope:SCOPE, include_granted_scopes:true, callback:function(r){ if(r&&r.access_token){ token=r.access_token; expires=Date.now()+Math.max(60,(r.expires_in||3600)-60)*1000; res(r); } else { rej(new Error(r&&r.error_description||'Google negó acceso')); } }, error_callback:function(e){ rej(new Error(e&&e.type==='popup_closed'?'Se canceló el acceso':'Error de Google')); } }); } window.__u7c.requestAccessToken({ prompt: interactive?'select_account':'none', login_hint: email||undefined }); }).catch(rej); }); }

  function ensure(){ if(token&&Date.now()<expires) return Promise.resolve(token); if(!CFG) return Promise.reject(new Error('Falta Client ID')); return askToken(!!email).then(function(r){ return r.access_token; }).catch(function(){ return askToken(true).then(function(r){ return r.access_token; }); }); }

  function drive(method,url,body,ct){ return ensure().then(function(t){ var o={method:method,headers:{Authorization:'Bearer '+t}}; if(body){ o.headers['Content-Type']=ct||'application/json'; o.body=body; } return fetch(url,o).then(function(r){ if(r.status===401){ token=null; return askToken(true).then(function(r2){ o.headers.Authorization='Bearer '+r2.access_token; return fetch(url,o); }); } if(!r.ok) throw new Error('Drive '+r.status); return r; }); }); }

  function find(){ return drive('GET','https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent("name='"+FILE_NAME+"' and 'appDataFolder' in parents and trashed=false")+'&spaces=appDataFolder&fields=files(id,modifiedTime)').then(function(r){return r.json();}).then(function(j){return (j.files&&j.files[0])||null;}); }

  function pull(){ return find().then(function(f){ if(!f) return null; fileId=f.id; return drive('GET','https://www.googleapis.com/drive/v3/files/'+f.id+'?alt=media').then(function(r){return r.json();}).then(function(p){ p._modTime=f.modifiedTime; return p; }); }); }

  function push(){ var payload={schemaVersion:7,app:'OAVIX',account:email,updatedAt:new Date().toISOString(),keys:KEYS,data:snap()}; var body=JSON.stringify(payload); var base=fileId?Promise.resolve({id:fileId}):find(); return base.then(function(f){ if(!f){ var b='oavix_'+Math.random().toString(16).slice(2); var multi='--'+b+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:FILE_NAME,parents:['appDataFolder'],mimeType:'application/json'})+'\r\n--'+b+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+b+'--'; return drive('POST','https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',multi,'multipart/related; boundary='+b).then(function(r){return r.json();}).then(function(j){ fileId=j.id; return payload.updatedAt; }); } fileId=f.id; return drive('PATCH','https://www.googleapis.com/upload/drive/v3/files/'+f.id+'?uploadType=media',body).then(function(){ return payload.updatedAt; }); }); }

  function applyCloud(p){ if(!p||!p.data) return false; KEYS.forEach(function(k){ if(Object.prototype.hasOwnProperty.call(p.data,k)) nativeSet(k,p.data[k]); }); nativeSet(UPDATED_KEY, p.updatedAt||new Date().toISOString()); return true; }

  function sync(interactive){ if(busy||!email) return Promise.resolve(); if(!navigator.onLine){ return Promise.resolve(); } busy=true; return pull().then(function(cloud){ var localTime=nativeGet(UPDATED_KEY)||''; if(!cloud){ return push(); } var distinto=snapStr()!==JSON.stringify(cloud.data||{}); var cloudTime=cloud.updatedAt||cloud._modTime||''; if(!distinto){ nativeSet(UPDATED_KEY, cloudTime||localTime); return cloudTime; } if(!localTime || cloudTime>localTime){ applyCloud(cloud); setTimeout(function(){ location.reload(); },600); return cloudTime; } return push(); }).catch(function(e){ console.error('[OAVIX SYNC]',e); }).then(function(){ busy=false; }); }

  function schedule(){ clearTimeout(timer); nativeSet(UPDATED_KEY, new Date().toISOString()); timer=setTimeout(function(){ sync(false); },1500); }

  /* Interceptor seguro: no falla en fotos grandes, no dispara sync si hay error */
  var realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k,v){ try{ realSet(k,v); }catch(e){ console.warn('[OAVIX] localStorage overflow',k); return; } if(email && KEYS.indexOf(k)>=0) schedule(); };

  try { var s=JSON.parse(nativeGet(SESSION_KEY)||'null'); if(s&&s.email) email=s.email; } catch(e){}

  function login(){ askToken(true).then(function(){ return fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',{headers:{Authorization:'Bearer '+token}}); }).then(function(r){return r.json();}).then(function(me){ var em=me.user&&me.user.emailAddress; if(!em) throw new Error('Google no devolvió correo'); email=em; nativeSet(SESSION_KEY,JSON.stringify({email:em,displayName:me.user.displayName||em})); nativeSet('oavix_current_user_name',em); location.reload(); }).catch(function(e){ if(window.showToast) window.showToast('No se pudo iniciar sesión',e.message||'Cancelado','rose'); }); }

  function logout(){ nativeDel(SESSION_KEY); nativeDel('oavix_current_user_name'); nativeDel(UPDATED_KEY); /* NO borrar datos locales, solo la sesión */ location.reload(); }

  function ui(){
    var badge=document.getElementById('user-session-badge'); if(badge) badge.remove();
    var like=document.getElementById('global-likes-count'); if(like&&like.closest('button')) like.closest('button').remove();
    var tag=document.getElementById('banner-username-tag'); if(tag&&email) tag.textContent='Usuario: '+email;
    var old=document.getElementById('modal-login');
    if(email){
      if(old) old.style.display='none';
      if(!document.getElementById('u7-logout')){ var b=document.createElement('button'); b.id='u7-logout'; b.type='button'; b.textContent='Cerrar sesión'; b.style.cssText='margin-left:6px;padding:2px 8px;border-radius:6px;border:1px solid rgba(244,63,94,.4);background:rgba(244,63,94,.15);color:#fda4af;font-weight:800;font-size:10px;'; b.onclick=logout; (tag?tag.parentElement:document.body).appendChild(b); }
      if(!document.getElementById('u7-cloud')){ var c=document.createElement('button'); c.id='u7-cloud'; c.type='button'; c.title='Sincronizar ahora'; c.textContent='☁️'; c.style.cssText='position:fixed;top:5rem;left:.5rem;z-index:40;padding:8px 10px;border-radius:12px;border:1px solid rgba(16,185,129,.35);background:rgba(16,185,129,.18);backdrop-filter:blur(12px);'; c.onclick=function(){ if(!navigator.onLine){ if(window.showToast) window.showToast('Sin conexión','Conecta a Internet para sincronizar.','amber'); return; } if(window.showToast) window.showToast('☁️ Sincronizando','Actualizando tus datos…','cyan'); sync(true).then(function(){ if(window.showToast) window.showToast('✓ Sincronizado','Todo al día.','emerald'); }); }; document.body.appendChild(c); }
      setTimeout(function(){ sync(false); },800);
      /* Resincronizar al volver a primer plano */
      document.addEventListener('visibilitychange', function(){ if(!document.hidden && email && navigator.onLine){ var last=nativeGet(UPDATED_KEY); if(!last || Date.now()-new Date(last).getTime()>30000) sync(false); } });
    } else {
      if(!old){ old=document.createElement('div'); old.id='modal-login'; old.className='fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur'; old.innerHTML='<div class="animated-glass-card rounded-3xl max-w-md w-full p-7 shadow-2xl space-y-5 text-center"><div class="mx-auto w-16 h-16 rounded-2xl bg-slate-900 border border-cyan-500/40 flex items-center justify-center"><i class="fa-solid fa-cloud text-cyan-400 text-2xl"></i></div><h3 class="text-2xl font-black text-white">Bienvenido a OAVIX</h3><p class="text-sm text-slate-300 font-bold">Inicia sesión con Google para sincronizar tus datos entre todos tus dispositivos.</p><button id="u7-google" type="button" class="w-full py-3 px-4 rounded-2xl bg-white text-slate-900 font-black flex items-center justify-center gap-3 hover:bg-slate-100 transition"><span class="text-lg">G</span><span>Continuar con Google</span></button><p class="text-[11px] text-slate-400">Tus datos se guardan en el espacio privado de tu cuenta.</p></div>'; document.body.appendChild(old); }
      old.style.display='flex';
      var g=document.getElementById('u7-google'); if(g) g.onclick=login;
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(ui,0); },{once:true}); else setTimeout(ui,0);

  /* Exponer API pública */
  window.OAVIXDriveSync = { syncNow:function(){ sync(true); }, loginWithGoogle:login, logoutSession:logout };
  window.logoutSession = logout;
  window.checkLoginState = function(){ if(email) { var m=document.getElementById('modal-login'); if(m) m.style.display='none'; } else { ui(); } };
})();
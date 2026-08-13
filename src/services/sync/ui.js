(function initializeSyncUI(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;
  const { state } = runtime.context;

  function buildLogin() {
    let modal = document.getElementById('modal-login');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-login';
      modal.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="animated-glass-card rounded-3xl max-w-md w-full p-7 shadow-2xl space-y-5 border border-cyan-500/50 text-center">
        <div class="mx-auto w-16 h-16 rounded-2xl bg-slate-900 border border-cyan-500/40 flex items-center justify-center">
          <i class="fa-solid fa-cloud text-cyan-400 text-2xl"></i>
        </div>
        <div>
          <h3 class="text-2xl font-black text-white">Bienvenido a OAVIX</h3>
          <p class="text-sm text-slate-300 font-bold mt-2">Inicia sesión con tu cuenta de Google para sincronizar tus datos.</p>
        </div>
        <button id="oavix-google-login" type="button" class="w-full py-3 px-4 rounded-2xl bg-white text-slate-900 font-black flex items-center justify-center gap-3 hover:bg-slate-100 transition">
          <span class="text-lg font-black">G</span><span>Continuar con Google</span>
        </button>
        <p class="text-[11px] text-slate-400">Tus datos de OAVIX se guardan en el espacio privado de la cuenta seleccionada.</p>
      </div>`;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.getElementById('oavix-google-login').onclick = runtime.auth.loginWithGoogle;
  }

  function hideLogin() {
    const modal = document.getElementById('modal-login');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  function cleanHeader() {
    const top = document.querySelector('header .flex.flex-wrap.items-center.gap-1');
    if (top) {
      top.querySelectorAll('button').forEach(button => {
        if (button.getAttribute('onclick') === 'giveAppLike()' || button.title && /Like/i.test(button.title)) {
          button.remove();
        }
      });
    }

    const likes = document.getElementById('global-likes-count');
    if (likes) {
      const button = likes.closest('button');
      if (button) button.remove();
    }
    const badge = document.getElementById('user-session-badge');
    if (badge) badge.remove();

    const bannerTag = document.getElementById('banner-username-tag');
    if (bannerTag) {
      bannerTag.textContent = state.accountEmail ? 'Usuario: ' + state.accountEmail : '';
      if (state.accountEmail) bannerTag.style.display = 'inline-flex';
      const wrapper = bannerTag.parentElement;
      if (wrapper && state.accountEmail && !document.getElementById('oavix-banner-logout')) {
        const logout = document.createElement('button');
        logout.id = 'oavix-banner-logout';
        logout.type = 'button';
        logout.className = 'px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/30 text-[10px] font-extrabold transition';
        logout.textContent = 'Cerrar sesión';
        logout.onclick = runtime.auth.logoutSession;
        wrapper.appendChild(logout);
      }
    }

    let driveButton = document.getElementById('oavix-drive-control');
    if (!driveButton) {
      driveButton = document.createElement('button');
      driveButton.id = 'oavix-drive-control';
      driveButton.className = 'fixed top-[5.1rem] left-2 sm:left-6 z-40 p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-lg';
      driveButton.title = 'Sincronizar Google Drive';
      driveButton.innerHTML = '<i class="fa-solid fa-cloud text-sm"></i>';
      document.body.appendChild(driveButton);
    }
    driveButton.onclick = () => runtime.synchronizer.syncNow(true);
  }

  function addSyncStyles() {
    if (document.getElementById('oavix-v5-css')) return;
    const style = document.createElement('style');
    style.id = 'oavix-v5-css';
    style.textContent = '#oavix-drive-control{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}#oavix-banner-logout{white-space:nowrap}@media(max-width:640px){#oavix-drive-control{top:5rem;left:.5rem}}';
    document.head.appendChild(style);
  }

  function installPwa() {
    if (!document.querySelector('link[rel=manifest]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'manifest.webmanifest?v=5';
      document.head.appendChild(manifest);
    }
    if (!document.querySelector('link[rel=icon]')) {
      const icon = document.createElement('link');
      icon.rel = 'icon';
      icon.href = 'icon.svg?v=5';
      icon.type = 'image/svg+xml';
      document.head.appendChild(icon);
    }
    if (!document.querySelector('link[rel=apple-touch-icon]')) {
      const appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.href = 'icon.svg?v=5';
      document.head.appendChild(appleIcon);
    }

    const metadata = [
      ['theme-color', '#030712'],
      ['mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
      ['apple-mobile-web-app-title', 'OAVIX']
    ];
    metadata.forEach(([name, content]) => {
      if (document.querySelector(`meta[name="${name}"]`)) return;
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=8').catch(() => {});
    }
  }

  function initUI() {
    addSyncStyles();
    cleanHeader();
    installPwa();
    if (state.accountEmail) hideLogin();
    else buildLogin();
    root.handleLoginSubmit = () => false;
    root.logoutSession = runtime.auth.logoutSession;
    root.checkLoginState = function checkLoginState() {
      if (state.accountEmail) hideLogin();
      else buildLogin();
    };
  }

  runtime.ui = { buildLogin, hideLogin, cleanHeader, addSyncStyles, installPwa, initUI };
})(window);

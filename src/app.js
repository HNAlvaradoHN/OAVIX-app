const fragmentHosts = Array.from(document.querySelectorAll('[data-oavix-fragment]'));

export const controllerScripts = [
  'src/core/utils.js',
  'src/core/state.js',
  'src/core/storage.js',
  'src/ui/toasts/controller.js',
  'src/ui/theme/controller.js',
  'src/features/dashboard/controller.js',
  'src/features/maintenance/controller.js',
  'src/features/archive/controller.js',
  'src/features/calendar/controller.js',
  'src/features/alerts/controller.js',
  'src/features/fuel/controller.js',
  'src/ui/navigation/controller.js',
  'src/core/bootstrap.js'
];

async function loadFragment(host) {
  const path = host.dataset.oavixFragment;
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);

  const template = document.createElement('template');
  template.innerHTML = (await response.text()).trim();
  host.replaceWith(template.content);
}

function loadClassicScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = path;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
    document.body.appendChild(script);
  });
}

async function loadControllers() {
  for (const path of controllerScripts) {
    await loadClassicScript(`${path}?v=5`);
  }
}

async function bootstrap() {
  try {
    await Promise.all(fragmentHosts.map(loadFragment));
    document.dispatchEvent(new CustomEvent('oavix:views-ready'));
    await loadControllers();
    document.documentElement.dataset.oavixReady = 'true';
    document.dispatchEvent(new CustomEvent('oavix:ready'));
  } catch (error) {
    console.error('[OAVIX bootstrap]', error);
    document.body.innerHTML = `
      <main class="min-h-screen grid place-items-center p-6 bg-slate-950 text-white">
        <section class="max-w-md rounded-2xl border border-rose-500/50 bg-slate-900 p-6 text-center">
          <h1 class="text-xl font-black text-rose-300">OAVIX no pudo iniciar</h1>
          <p class="mt-2 text-sm text-slate-300">Recarga la página. Si el problema continúa, revisa tu conexión.</p>
        </section>
      </main>
    `;
    throw error;
  }
}

window.OAVIX_APP_READY = bootstrap();

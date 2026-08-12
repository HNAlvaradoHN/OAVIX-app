/* OAVIX - Google Drive Sync configuration
 *
 * OAuth 2.0 Client ID for the OAVIX web application.
 * This identifier is public by design; never place a client secret here.
 */
window.OAVIX_GOOGLE_CLIENT_ID = '450696651936-p56j2qn8iccbktb375s737pa3hvpki1s.apps.googleusercontent.com';

/* OAVIX — visual override: load the moderated information-window surfaces once. */
(function () {
  if (document.getElementById('oavix-theme-overrides')) return;
  var link = document.createElement('link');
  link.id = 'oavix-theme-overrides';
  link.rel = 'stylesheet';
  link.href = 'oavix-theme-overrides.css?v=1';
  document.head.appendChild(link);
})();

/* OAVIX — initialize maintenance categories before index.html reads them. */
(function () {
  var key = 'oavix_auto_categories';
  var initKey = 'oavix_auto_categories_initialized';
  var defaults = [
    'Mantenimiento General',
    'Cambio de Aceite',
    'Llantas / Frenos',
    'Combustible',
    'Reparaciones'
  ];

  try {
    var raw = localStorage.getItem(key);
    var parsed = raw === null ? null : JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      localStorage.setItem(key, JSON.stringify(defaults));
    } else if (parsed.length === 0 && !localStorage.getItem(initKey)) {
      /* Recupera una instalación que quedó con la lista vacía sin gestionarla. */
      localStorage.setItem(key, JSON.stringify(defaults));
    }
  } catch (e) {
    console.warn('[OAVIX] Categorías guardadas ilegibles o almacenamiento bloqueado; se restauran las predeterminadas.', e);
    try {
      localStorage.setItem(key, JSON.stringify(defaults));
    } catch (writeError) {
      console.error('[OAVIX] No se pudo escribir las categorías predeterminadas.', writeError);
    }
  }
})();

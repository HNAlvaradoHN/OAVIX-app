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

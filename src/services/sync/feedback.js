(function initializeSyncFeedback(root) {
  'use strict';

  const runtime = root.OAVIXSyncInternal;

  function toast(title, body, tone) {
    if (typeof root.showToast === 'function') {
      root.showToast(title, body, tone);
      return;
    }
    setTimeout(() => {
      if (typeof root.showToast === 'function') root.showToast(title, body, tone);
    }, 0);
  }

  runtime.feedback = { toast };
})(window);

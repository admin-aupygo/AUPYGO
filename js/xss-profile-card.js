/* AUPYGO — XSS fix updateProfileCard (hostCountry, otherLang, stayTxt, hobby title)
 * Charge APRÈS app.js. Réécrit les insertions HTML non échappées.
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function patchUpdateProfileCard() {
    if (typeof window.updateProfileCard !== 'function') return false;
    if (window._aupygoXssProfileCardFixed) return true;

    var orig = window.updateProfileCard;
    window.updateProfileCard = function (data) {
      if (!data) return orig.apply(this, arguments);

      var safe = Object.assign({}, data);
      if (safe.hostCountry != null) safe.hostCountry = escapeHtml(String(safe.hostCountry));
      if (safe.otherLang != null) safe.otherLang = escapeHtml(String(safe.otherLang));
      if (safe.stayEnd != null) safe.stayEnd = escapeHtml(String(safe.stayEnd));
      if (Array.isArray(safe.hobbies)) {
        safe.hobbies = safe.hobbies.map(function (h) { return String(h); });
      }
      if (safe.name != null) safe.name = String(safe.name);

      orig.call(this, safe);

      var hobbiesEl = document.getElementById('profileCardHobbies');
      if (hobbiesEl && Array.isArray(data.hobbies) && data.hobbies.length) {
        // HOBBY_EMOJI est un `const` de app.js : accessible comme variable globale, mais PAS via window.
        // (avant : window.HOBBY_EMOJI était undefined -> tous les hobbies s'affichaient en ✨)
        var emojiMap = (typeof HOBBY_EMOJI !== 'undefined') ? HOBBY_EMOJI : (window.HOBBY_EMOJI || {});
        hobbiesEl.innerHTML = data.hobbies.map(function (h) {
          var emoji = emojiMap[h] || '✨';
          return '<span class="hobby-emoji" title="' + escapeAttr(h) + '">' + emoji + '</span>';
        }).join('');
      }
      return undefined;
    };

    window._aupygoXssProfileCardFixed = true;
    console.log('[AUPYGO] XSS fix updateProfileCard applied');
    return true;
  }

  function tryPatch() {
    if (patchUpdateProfileCard()) return;
    setTimeout(tryPatch, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryPatch);
  } else {
    tryPatch();
  }
  setTimeout(tryPatch, 500);
  setTimeout(tryPatch, 1500);
})();

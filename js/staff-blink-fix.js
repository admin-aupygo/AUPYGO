/* staff-blink-fix — clignotement nav OK, pas de bulle en double */
(function () {
  'use strict';
  window.stopMessageBlink = function () {
    var extra = document.getElementById('navStaffMessages');
    if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
  };
  // Appliquer une fois
  setTimeout(function () {
    if (typeof window.stopMessageBlink === 'function') window.stopMessageBlink();
  }, 800);
})();

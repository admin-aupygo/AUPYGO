/* AUPYGO — legal.js : remplit les variables <span data-v="..."> depuis legal-config.js */
(function () {
  'use strict';
  var C = window.AUPYGO_LEGAL || {};
  var todo = 0;

  document.querySelectorAll('[data-v]').forEach(function (el) {
    var k = el.getAttribute('data-v');
    var v = C[k];
    if (v === undefined || v === null || v === '') {
      if (el.hasAttribute('data-optional')) { el.style.display = 'none'; return; }
      v = '[À COMPLÉTER : ' + k + ']';
    }
    if (el.tagName === 'A' && el.hasAttribute('data-mailto')) {
      el.href = 'mailto:' + v;
    }
    if (el.tagName === 'A' && el.hasAttribute('data-href')) {
      el.href = v;
    }
    el.textContent = v;
    if (String(v).indexOf('À COMPLÉTER') !== -1) { el.classList.add('todo'); todo++; }
  });

  document.querySelectorAll('[data-optional-wrap]').forEach(function (w) {
    var k = w.getAttribute('data-optional-wrap');
    if (!C[k]) w.style.display = 'none';
  });

  if (todo > 0) {
    var b = document.getElementById('draft-banner');
    if (b) {
      b.hidden = false;
      b.querySelector('b').textContent = String(todo);
    }
  }
})();

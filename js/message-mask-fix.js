/* AUPYGO message-mask-fix.js - anti-contournement coordonnees (apres message-rules.js) */
(function () {
  'use strict';
  var MASK = '[Donnee masquee pour votre securite]';
  var NUM =
    '(?:z[ee]ro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|' +
    'vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|nonante|cent|cents|' +
    'quatre[\\s\\-]?vingts?|quatrevingt|quatreving|' +
    'dix[\\s\\-]?sept|dixsept|dix[\\s\\-]?huit|dixhuit|dix[\\s\\-]?neuf|dixneuf|' +
    'soixante[\\s\\-]?dix|soixantedix|soixante[\\s\\-]?et[\\s\\-]?un|' +
    'vingt[\\s\\-]?et[\\s\\-]?un|trente[\\s\\-]?et[\\s\\-]?un|' +
    'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|' +
    'cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
  var MAIL_DOM = '(?:gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|proton(?:mail)?|orange|free|wanadoo|laposte|sfr|bbox|gmx|aol|mail|email|courriel)';
  var AT_WORD = '(?:arobase|arobas|arobaze|arroba|at|ate)';
  var DOT_WORD = '(?:point|dot|period)';

  var RE_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g;
  var RE_EMAIL_OBF = new RegExp(
    '(?:[A-Za-z0-9._%+\\-]+|\\d{1,4})\\s*(?:' +
      '(?:\\(\\s*at\\s*\\)|\\[\\s*at\\s*\\]|\\{\\s*at\\s*\\}|@)|' +
      '(?:\\b' + AT_WORD + '\\b)' +
    ')\\s*(?:sur\\s+|chez\\s+|on\\s+)?' +
    '(?:[A-Za-z0-9\\-]+|' + MAIL_DOM + ')' +
    '(?:\\s*(?:' +
      '(?:\\(\\s*dot\\s*\\)|\\[\\s*dot\\s*\\]|\\{\\s*dot\\s*\\)|\\.)|' +
      '(?:\\b' + DOT_WORD + '\\b)' +
    ')\\s*[A-Za-z0-9\\-]+)+',
    'gi'
  );
  var RE_EMAIL_OBF2 = new RegExp(
    '\\b(?:' + AT_WORD + ')\\s+(?:sur\\s+|chez\\s+|on\\s+)?(?:' + MAIL_DOM + ')\\s+(?:' + DOT_WORD + '|\\.)\\s*(?:com|fr|net|org|be|ch|es|de|uk|co)\\b',
    'gi'
  );
  var RE_MAIL_DOMAIN = new RegExp(
    '\\b(?:' + MAIL_DOM + ')\\s*(?:' + DOT_WORD + '|\\.)\\s*(?:com|fr|net|org|be|ch)\\b',
    'gi'
  );
  var RE_NUMWORDS = new RegExp('(?:\\b' + NUM + '\\b[\\s\\-.,]*){4,}', 'gi');
  var RE_PHONE = /(?:\+|00)?\(?\d[\d\s.\-/()]{6,}\d/g;
  var RE_DATE = /\d{1,2}[.\/\-]\d{1,2}[.\/\-](?:19|20)\d{2}/g;

  function normalizeText(s) {
    return String(s == null ? '' : s)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .normalize('NFKC');
  }

  function maskSensitive(input) {
    var base = normalizeText(input);
    var t = base;
    t = t.replace(RE_EMAIL, MASK);
    t = t.replace(RE_EMAIL_OBF, MASK);
    t = t.replace(RE_EMAIL_OBF2, MASK);
    t = t.replace(RE_MAIL_DOMAIN, MASK);
    t = t.replace(RE_NUMWORDS, MASK);
    t = t.replace(RE_PHONE, function (m) {
      var digits = m.replace(RE_DATE, '').replace(/\D/g, '');
      return digits.length >= 9 ? MASK : m;
    });
    if (window.AupyModeration && typeof window.AupyModeration._legacyMask === 'function') {
      var leg = window.AupyModeration._legacyMask(t);
      if (leg && leg.text) t = leg.text;
    }
    return { text: t, masked: t !== base };
  }

  function install() {
    if (!window.AupyModeration) {
      window.AupyModeration = { maskSensitive: maskSensitive, MASK: MASK };
    } else {
      if (!window.AupyModeration._legacyMask && window.AupyModeration.maskSensitive) {
        window.AupyModeration._legacyMask = window.AupyModeration.maskSensitive;
      }
      window.AupyModeration.maskSensitive = maskSensitive;
      window.AupyModeration.MASK = MASK;
    }
  }
  install();
  setTimeout(install, 300);
  setTimeout(install, 1500);
  console.log('[AUPYGO] message-mask-fix - arobase / point com / chiffres en lettres');
})();

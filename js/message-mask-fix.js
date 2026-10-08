/* AUPYGO message-mask-fix.js v2 - anti-contournement renforce */
(function () {
  'use strict';
  var MASK = '[Donnee masquee pour votre securite]';

  function softNorm(s) {
    var t = String(s == null ? '' : s)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .normalize('NFKC')
      .toLowerCase();
    t = t.replace(/qutre/g, 'quatre');
    t = t
      .replace(/quatre[\s\-]*v[a-z]{0,12}/g, 'quatre vingt ')
      .replace(/quatrevingt/g, 'quatre vingt ')
      .replace(/dix[\s\-]*huit/g, 'dix huit ')
      .replace(/dixhuit/g, 'dix huit ')
      .replace(/dix[\s\-]*neuf/g, 'dix neuf ')
      .replace(/dixneuf/g, 'dix neuf ')
      .replace(/dix[\s\-]*sept/g, 'dix sept ')
      .replace(/dixsept/g, 'dix sept ')
      .replace(/soixante[\s\-]*dix/g, 'soixante dix ')
      .replace(/soixantedix/g, 'soixante dix ')
      .replace(/soixante[\s\-]*et[\s\-]*un/g, 'soixante un ')
      .replace(/vingt[\s\-]*et[\s\-]*un/g, 'vingt un ')
      .replace(/trente[\s\-]*et[\s\-]*un/g, 'trente un ')
      .replace(/trente[\s\-]*deux/g, 'trente deux ')
      .replace(/trentedeux/g, 'trente deux ')
      .replace(/google\s*mail/g, 'gmail')
      .replace(/\bg\s*mail\b/g, 'gmail');
    t = t.replace(/vingt(huit|neuf|dix|un|deux|trois|quatre|cinq|six|sept)/g, 'vingt $1 ');
    return t;
  }

  var NUM =
    '(?:z[ee]ro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|' +
    'vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|nonante|cent|cents|' +
    'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|' +
    'cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';

  var MAIL_DOM = '(?:gmail|googlemail|google|yahoo|hotmail|outlook|live|icloud|me|proton(?:mail)?|orange|free|wanadoo|laposte|sfr|bbox|gmx|aol|mail|email|courriel)';
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
    ')\\s*[A-Za-z0-9\\-]+)*',
    'gi'
  );
  var RE_EMAIL_OBF2 = new RegExp(
    '\\b(?:' + AT_WORD + ')\\s+(?:sur\\s+|chez\\s+|on\\s+)?(?:' + MAIL_DOM + ')(?:\\s+(?:' + DOT_WORD + '|\\.)\\s*(?:com|fr|net|org|be|ch|es|de|uk|co))?\\b',
    'gi'
  );
  var RE_ATE_GOOGLE = new RegExp(
    '(?:[A-Za-z0-9._%+\\-]*)\\b(?:' + AT_WORD + ')\\b\\s*(?:sur\\s+|chez\\s+|on\\s+)?(?:' + MAIL_DOM + ')\\b',
    'gi'
  );
  var RE_MAIL_DOMAIN = new RegExp(
    '\\b(?:' + MAIL_DOM + ')\\s*(?:' + DOT_WORD + '|\\.)\\s*(?:com|fr|net|org|be|ch)\\b',
    'gi'
  );
  var RE_NUMWORDS = new RegExp('(?:\\b' + NUM + '\\b[\\s\\-.,]*){4,}', 'gi');
  var RE_PHONE = /(?:\+|00)?\(?\d[\d\s.\-/()]{6,}\d/g;
  var RE_DATE = /\d{1,2}[.\/\-]\d{1,2}[.\/\-](?:19|20)\d{2}/g;

  function maskSensitive(input) {
    var original = String(input == null ? '' : input);
    var base = softNorm(original);
    var t = base;
    t = t.replace(RE_EMAIL, MASK);
    t = t.replace(RE_EMAIL_OBF, MASK);
    t = t.replace(RE_EMAIL_OBF2, MASK);
    t = t.replace(RE_ATE_GOOGLE, MASK);
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
    if (t === base) return { text: original, masked: false };
    var residual = (t.match(new RegExp('\\b' + NUM + '\\b', 'gi')) || []).length;
    if (residual >= 2) return { text: MASK, masked: true };
    if (/(?:quatre|vingt|soixante|trente|quarante|cinquante)[a-z]{3,}/i.test(t.replace(MASK, ''))) {
      return { text: MASK, masked: true };
    }
    return { text: t.indexOf(MASK) !== -1 ? t : MASK, masked: true };
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
  console.log('[AUPYGO] message-mask-fix v2 - typos + mots colles + ate google');
})();

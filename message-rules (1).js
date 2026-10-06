/* AUPYGO — Messagerie : limites par forfait, compteur de mots, modération anti-coordonnées
 *
 * Ce module est une COUCHE D'AFFICHAGE ET DE CONFORT. L'application réelle des règles se fait côté
 * serveur (sql/03_messaging_rules.sql : triggers sur la table messages) — ce script ne peut donc pas
 * être contourné, il évite seulement à l'utilisateur d'aller au refus.
 *
 *   FREE      10 messages au total · 25 mots max par message
 *   STANDARD  10 messages par jour · 1000 mots max (plafond technique)
 *   PREMIUM   illimité            · 1000 mots max (plafond technique)
 *
 * Contenu :
 *   1. Filtre de modération  → window.AupyModeration.maskSensitive(texte)  (mêmes règles que le SQL)
 *   2. Compteur de mots + solde de messages sous le champ de saisie
 *   3. Blocage de l'envoi hors limites + pop-up d'incitation à l'upgrade
 *   4. Infobulle préventive quand une coordonnée est détectée
 *
 * À charger APRÈS app.js et les modules staff-* (il enveloppe window.sendMessage).
 */
(function () {
  'use strict';

  /* =====================================================================
   * 1. FILTRE DE MODÉRATION
   * ===================================================================== */
  var MASK = '[Donnée masquée pour votre sécurité]';
  var PRIVACY_TIP = "Pour votre sécurité et la protection de votre vie privée, le partage de coordonnées directes n'est pas autorisé sur la plateforme.";

  // mots-clés de réseaux / messageries
  var KW = "(?:insta(?:gr?a?m)?|ig|wh?a+t+['’]?s?\\s*-?\\s*a+p+|snap(?:chat+)?|telegram|tg|face\\s?book|fb|tik\\s?-?\\s?tok)";
  // chiffres écrits en lettres (FR / ES / EN) — 5 à la suite = numéro
  var NUM = '(?:z[ée]ro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|nonante|cent|cents|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|one|two|three|four|five|seven|eight|nine)';

  var RE_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g;
  // "nom AT gmail DOT com", "nom [at] yahoo [dot] fr", "nom(at)gmail(dot)com"
  var RE_EMAIL_OBF = /[A-Za-z0-9._%+\-]+\s*(?:\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|\bat\b|@)\s*[A-Za-z0-9\-]+\s*(?:(?:\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\}|\bdot\b|\bpoint\b)\s*[A-Za-z0-9\-]+\s*)+/gi;
  var RE_NUMWORDS = new RegExp('(?:\\b' + NUM + '\\b[\\s\\-.,]*){5,}', 'gi');
  // candidat numéro en chiffres : espaces, points, tirets, slashes, parenthèses, +41, +33, 0033…
  var RE_PHONE = /(?:\+|00)?\(?\d[\d\s.\-/()]{6,}\d/g;
  var RE_DATE = /\d{1,2}[./\-]\d{1,2}[./\-](?:19|20)\d{2}/g;   // 12/10/2026 : pas un numéro
  var RE_KEYWORD = new RegExp(
    '\\b' + KW + '\\b(?:' +
      '\\s*(?::|=)\\s*@?[A-Za-z0-9_.]{2,}' +                              // instagram: marie.d92
      '|\\s*@[A-Za-z0-9_.]{2,}' +                                           // telegram @paulo
      "|\\s+(?:c'est|c’est|cest|est|is)\\s+@?[A-Za-z0-9_.]{2,}" +           // mon insta c'est jean_dupont
      '|\\s+@?(?=[A-Za-z0-9_.]*[0-9_.])[A-Za-z0-9_.]{3,}' +                 // snap jean_92
    ')', 'gi');
  var RE_HANDLE = /(^|[\s(\[])@[A-Za-z0-9_.]{2,}/g;

  /** Remplace toute coordonnée par la mention de masquage. Retourne { text, masked }. */
  function maskSensitive(input) {
    var original = String(input == null ? '' : input);
    var t = original;
    t = t.replace(RE_EMAIL, MASK);
    t = t.replace(RE_EMAIL_OBF, MASK);
    t = t.replace(RE_NUMWORDS, MASK);
    t = t.replace(RE_PHONE, function (m) {
      var digits = m.replace(RE_DATE, '').replace(/\D/g, '');
      return digits.length >= 9 ? MASK : m;
    });
    t = t.replace(RE_KEYWORD, MASK);
    t = t.replace(RE_HANDLE, function (m, p1) { return p1 + MASK; });
    return { text: t, masked: t !== original };
  }

  function countWords(text) {
    var s = String(text == null ? '' : text).trim();
    return s === '' ? 0 : s.split(/\s+/).length;
  }

  window.AupyModeration = { maskSensitive: maskSensitive, countWords: countWords, MASK: MASK };

  /* =====================================================================
   * 2. TEXTES (FR / EN / ES)
   * ===================================================================== */
  var TXT = {
    fr: {
      words: 'mots', left: 'Messages restants', leftToday: "Messages restants aujourd'hui",
      tipTitle: 'Coordonnées masquées', tip: PRIVACY_TIP,
      quotaTitle: 'Tu as utilisé tous tes messages',
      quotaFree: 'Ton compte gratuit inclut 10 messages au total. Passe à un forfait supérieur pour continuer à discuter.',
      quotaDay: "Tu as atteint ta limite de messages pour aujourd'hui (réinitialisée à minuit). Passe en PREMIUM pour écrire sans limite.",
      wordsTitle: 'Message trop long',
      wordsFree: 'Les messages gratuits sont limités à {max} mots (tu en as écrit {n}). Raccourcis ton message ou passe à un forfait supérieur.',
      wordsMax: 'Un message ne peut pas dépasser {max} mots (tu en as écrit {n}).',
      cta: 'Voir les forfaits', later: 'Plus tard'
    },
    en: {
      words: 'words', left: 'Messages left', leftToday: 'Messages left today',
      tipTitle: 'Contact details hidden', tip: "For your safety and privacy, sharing direct contact details isn't allowed on the platform.",
      quotaTitle: "You've used all your messages",
      quotaFree: 'Your free account includes 10 messages in total. Upgrade to keep chatting.',
      quotaDay: "You've reached today's message limit (resets at midnight). Go PREMIUM to write without limits.",
      wordsTitle: 'Message too long',
      wordsFree: 'Free messages are limited to {max} words (you wrote {n}). Shorten your message or upgrade.',
      wordsMax: "A message can't exceed {max} words (you wrote {n}).",
      cta: 'See plans', later: 'Later'
    },
    es: {
      words: 'palabras', left: 'Mensajes restantes', leftToday: 'Mensajes restantes hoy',
      tipTitle: 'Datos de contacto ocultos', tip: 'Por tu seguridad y privacidad, no se permite compartir datos de contacto directos en la plataforma.',
      quotaTitle: 'Has usado todos tus mensajes',
      quotaFree: 'Tu cuenta gratuita incluye 10 mensajes en total. Mejora tu plan para seguir chateando.',
      quotaDay: 'Has alcanzado el límite de mensajes de hoy (se reinicia a medianoche). Pásate a PREMIUM para escribir sin límites.',
      wordsTitle: 'Mensaje demasiado largo',
      wordsFree: 'Los mensajes gratuitos están limitados a {max} palabras (has escrito {n}). Acórtalo o mejora tu plan.',
      wordsMax: 'Un mensaje no puede superar {max} palabras (has escrito {n}).',
      cta: 'Ver planes', later: 'Más tarde'
    }
  };
  function L() {
    var l = '';
    try { l = localStorage.getItem('aupygo_lang') || ''; } catch (e) {}
    l = (l || document.documentElement.lang || 'fr').slice(0, 2).toLowerCase();
    return TXT[l] || TXT.fr;
  }

  /* =====================================================================
   * 3. SOLDE DU COMPTE (RPC get_my_message_quota, sinon repli par défaut)
   * ===================================================================== */
  var quota = null, quotaAt = 0, quotaInflight = null;

  function fallbackQuota() {
    var plan = 'FREE';
    try { plan = String((typeof currentPlan !== 'undefined' && currentPlan) || 'FREE').toUpperCase(); } catch (e) {}
    return {
      plan: plan, staff: false, unlimited: plan === 'PREMIUM',
      max_total: plan === 'FREE' ? 10 : null, max_daily: plan === 'STANDARD' ? 10 : null,
      left: null, max_words: plan === 'FREE' ? 25 : 1000, _fallback: true
    };
  }

  function getQuota(force) {
    if (!force && quota && Date.now() - quotaAt < 4000) return Promise.resolve(quota);
    if (quotaInflight) return quotaInflight;
    var client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
    var user = (typeof currentUser !== 'undefined') ? currentUser : null;
    if (!client || !user) { quota = fallbackQuota(); return Promise.resolve(quota); }
    quotaInflight = client.rpc('get_my_message_quota').then(function (res) {
      quota = (res && res.data && !res.error) ? res.data : fallbackQuota();
      quotaAt = Date.now();
      return quota;
    }).catch(function () { quota = fallbackQuota(); return quota; })
      .then(function (q) { quotaInflight = null; return q; });
    return quotaInflight;
  }

  /* =====================================================================
   * 4. INTERFACE : compteur de mots, solde, infobulle, pop-up
   * ===================================================================== */
  var CSS = [
    '.aupy-chatmeta{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 2px 0;font-size:12px;font-weight:600;color:var(--muted,#777386)}',
    '.aupy-chatmeta .aupy-wc.over{color:#dc2626;font-weight:800}',
    '.aupy-chatmeta .aupy-wc.near{color:#d97706}',
    '.aupy-chatmeta .aupy-credit{margin-left:auto;padding:2px 10px;border-radius:999px;background:rgba(124,58,237,.10);color:var(--primary,#7c3aed)}',
    '.aupy-chatmeta .aupy-credit.empty{background:rgba(220,38,38,.12);color:#dc2626}',
    '.aupy-tip{position:relative;margin:8px 0 0;padding:10px 12px 10px 38px;border-radius:12px;font-size:12.5px;line-height:1.4;font-weight:600;',
    'background:#fff7ed;border:1px solid #fdba74;color:#9a3412;box-shadow:0 6px 20px rgba(0,0,0,.10)}',
    '.aupy-tip:before{content:"🔒";position:absolute;left:12px;top:9px;font-size:16px}',
    '#pfQuotaSticky,#cdcQuotaBar,#messagesQuota{display:none !important}',
    '.aupy-modal-ov{position:fixed;inset:0;z-index:100001;background:rgba(15,13,26,.62);display:flex;align-items:center;justify-content:center;padding:16px}',
    '.aupy-modal{background:var(--white,#fff);color:var(--text,#292638);border:1px solid var(--border,#e8e4ef);border-radius:18px;max-width:380px;width:100%;padding:22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)}',
    '.aupy-modal .ico{font-size:40px;line-height:1;margin-bottom:8px}',
    '.aupy-modal h3{font-size:18px;margin:0 0 8px}',
    '.aupy-modal p{font-size:14px;color:var(--muted,#777386);margin:0 0 16px;line-height:1.5}',
    '.aupy-modal .row{display:flex;gap:8px;flex-direction:column}',
    '.aupy-modal button{border:0;border-radius:12px;padding:12px 16px;font-weight:700;font-size:14px;cursor:pointer}',
    '.aupy-modal .go{background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff}',
    '.aupy-modal .no{background:transparent;color:var(--muted,#777386)}',
    'html[data-theme="dark"] .aupy-tip{background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.45);color:#fcd34d}',
    'html[data-theme="dark"] .aupy-chatmeta .aupy-credit{background:rgba(167,139,250,.16);color:#c4b5fd}',
    'html[data-theme="dark"] .aupy-chatmeta .aupy-wc.over,html[data-theme="dark"] .aupy-chatmeta .aupy-credit.empty{color:#fca5a5}'
  ].join('\n');
  (function injectCss() {
    var st = document.createElement('style');
    st.id = 'aupy-message-rules-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();

  function $(id) { return document.getElementById(id); }

  function ensureMeta() {
    var input = $('messageInput');
    if (!input) return null;
    var meta = $('aupyChatMeta');
    var row = input.parentElement || input;
    if (meta && meta.previousElementSibling === row) return meta;
    if (!meta) {
      meta = document.createElement('div');
      meta.id = 'aupyChatMeta';
      meta.className = 'aupy-chatmeta';
      meta.innerHTML = '<span class="aupy-wc" id="aupyWordCounter" aria-live="polite"></span>' +
                       '<span class="aupy-credit" id="aupyCredit" style="display:none"></span>';
    }
    row.insertAdjacentElement('afterend', meta);
    return meta;
  }

  function render() {
    var meta = ensureMeta();
    if (!meta) return;
    var input = $('messageInput'), btn = $('sendMsgBtn');
    var q = quota || fallbackQuota(), t = L();
    var maxW = q.max_words || 1000;
    var n = countWords(input ? input.value : '');

    // compteur de mots : en direct pour les comptes gratuits (le plafond de 1000 n'est affiché qu'à l'approche)
    var wc = $('aupyWordCounter');
    var showWc = (q.plan === 'FREE' && !q.staff) || n >= maxW * 0.9;
    wc.style.display = showWc ? '' : 'none';
    wc.textContent = n + ' / ' + maxW + ' ' + t.words;
    wc.className = 'aupy-wc' + (n > maxW ? ' over' : (n >= maxW * 0.8 ? ' near' : ''));

    // crédit de messages
    var cr = $('aupyCredit');
    var show = !q.unlimited && q.left !== null && q.left !== undefined;
    cr.style.display = show ? '' : 'none';
    if (show) {
      var max = q.max_total != null ? q.max_total : q.max_daily;
      cr.textContent = (q.max_total != null ? t.left : t.leftToday) + ' : ' + q.left + '/' + max;
      cr.className = 'aupy-credit' + (q.left <= 0 ? ' empty' : '');
    }

    // blocage de l'envoi si trop de mots (le serveur refuse de toute façon)
    if (btn && input && !input.disabled) btn.disabled = n > maxW;

    // infobulle préventive (coordonnée détectée pendant la frappe)
    var det = input && input.value ? maskSensitive(input.value).masked : false;
    showTip(det);
  }

  var tipTimer = null;
  function showTip(on, keepMs) {
    var meta = $('aupyChatMeta');
    if (!meta) return;
    var tip = $('aupyPrivacyTip');
    if (on) {
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'aupyPrivacyTip'; tip.className = 'aupy-tip'; tip.setAttribute('role', 'alert');
        meta.insertAdjacentElement('afterend', tip);
      }
      tip.textContent = L().tip;
      if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
      if (keepMs) tipTimer = setTimeout(function () { var x = $('aupyPrivacyTip'); if (x) x.remove(); }, keepMs);
    } else if (tip && !tipTimer) {
      tip.remove();
    }
  }

  function modal(reason, n, q) {
    var t = L(), old = $('aupyModal'); if (old) old.remove();
    var title, body;
    if (reason === 'quota') {
      title = t.quotaTitle; body = (q && q.plan === 'FREE') ? t.quotaFree : t.quotaDay;
    } else {
      title = t.wordsTitle;
      body = ((q && q.plan === 'FREE') ? t.wordsFree : t.wordsMax).replace('{max}', q.max_words).replace('{n}', n);
    }
    var ov = document.createElement('div');
    ov.id = 'aupyModal'; ov.className = 'aupy-modal-ov';
    ov.innerHTML = '<div class="aupy-modal" role="dialog" aria-modal="true"><div class="ico">' + (reason === 'quota' ? '💬' : '✂️') + '</div>' +
      '<h3></h3><p></p><div class="row"><button class="go"></button><button class="no"></button></div></div>';
    ov.querySelector('h3').textContent = title;
    ov.querySelector('p').textContent = body;
    var btnGo = ov.querySelector('.go'), btnNo = ov.querySelector('.no');
    btnGo.textContent = t.cta; btnNo.textContent = t.later;
    function close() { ov.remove(); }
    btnNo.onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    btnGo.onclick = function () { close(); if (typeof window.go === 'function') window.go('plans'); };
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(ov);
    // Focus différé : si l'envoi vient de la touche Entrée, un focus immédiat sur le bouton l'activerait aussitôt.
    setTimeout(function () { if (document.contains(btnGo)) btnGo.focus(); }, 400);
  }

  /* =====================================================================
   * 5. ENVELOPPE DE sendMessage()
   * ===================================================================== */
  function patchSend() {
    var prev = window.sendMessage;
    if (typeof prev !== 'function' || window._aupyRulesPatched) return false;
    window._aupyRulesPatched = true;

    window.sendMessage = async function () {
      var input = $('messageInput');
      if (!input) return prev.apply(this, arguments);
      var q = await getQuota(true);

      // 1) plus de crédit
      if (!q.unlimited && q.left !== null && q.left !== undefined && q.left <= 0) {
        modal('quota', 0, q); render(); return;
      }
      // 2) trop de mots
      var n = countWords(input.value), maxW = q.max_words || 1000;
      if (n > maxW) { modal('words', n, q); render(); return; }
      // 3) coordonnées → masquées avant l'envoi (le serveur le refait de toute façon)
      if (!q.staff && input.value) {
        var r = maskSensitive(input.value);
        if (r.masked) { input.value = r.text; showTip(true, 7000); }
      }
      var out;
      try { out = await prev.apply(this, arguments); }
      finally {
        getQuota(true).then(function () { render(); });
      }
      return out;
    };

    // Les anciens patchs (priority-fixes, cdc-fixes) fabriquaient 2 compteurs en double : on garde un seul compteur (sous le champ).
    var prevRefresh = window.refreshMessagesQuotaUI;
    window.refreshMessagesQuotaUI = async function () {
      try {
        var q = await getQuota(true);
        render();
        if (q._fallback && typeof prevRefresh === 'function') return prevRefresh.apply(this, arguments);
        var left = q.unlimited ? Infinity : (q.left == null ? Infinity : q.left);
        var max = q.unlimited ? Infinity : (q.max_total != null ? q.max_total : (q.max_daily != null ? q.max_daily : Infinity));
        return { sent: max === Infinity ? 0 : max - left, max: max, left: left, allowed: left > 0 };
      } catch (e) {
        return typeof prevRefresh === 'function' ? prevRefresh.apply(this, arguments) : { allowed: true, max: Infinity, left: Infinity, sent: 0 };
      }
    };
    return true;
  }

  /* =====================================================================
   * 6. DÉMARRAGE
   * ===================================================================== */
  function onInput() { render(); }
  function bindInput() {
    var input = $('messageInput');
    if (input && !input._aupyBound) {
      input._aupyBound = true;
      input.addEventListener('input', onInput);
      input.addEventListener('focus', function () { getQuota(false).then(render); });
    }
  }

  var queued = false;
  function schedule() {
    if (queued) return; queued = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      queued = false; bindInput(); ensureMeta();
    });
  }

  function start() {
    patchSend();
    bindInput();
    getQuota(true).then(render);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    setInterval(function () { getQuota(true).then(render); }, 30000);
  }

  function boot() {
    if (patchSend() || window._aupyRulesPatched) { start(); return; }
    // sendMessage pas encore défini : on réessaie un court instant
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (patchSend() || window._aupyRulesPatched || tries > 50) { clearInterval(iv); start(); }
    }, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

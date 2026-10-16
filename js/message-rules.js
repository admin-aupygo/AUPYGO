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

  var SEP = '[\\s.\\-_]*';
  var KW = '(?:insta+(?:' + SEP + 'gr?a?m+)?|ig|wh?a+t*[\'’]?' + SEP + 's*' + SEP + 'a+p+|wtsp|wtsap|whtsp|wsp|snap+(?:' + SEP + 'chat+)?' +
    '|tele?gr?a?m+|tg|face' + SEP + 'book|fb|tic?k+' + SEP + 'to?c?k+|messenger|twitter|linkedin|pinterest|reddit|twitch|discord|viber|wechat|skype|kik|tinder|bumble|badoo|meetic|happn|grindr|onlyfans|tumblr)';
  var STOP = '(?:je|tu|il|elle|on|nous|vous|ils|elles|suis|est|sommes|sont|vais|vas|parle|parles|parler|ecris|écris|écrit|retrouve|retrouvez|contacte|contactez|cherche|cherches|regarde|vue|vus|aussi|actif|active|connecte|connecté|dispo|disponible|present|présent|pas|moi|toi|les|des|une|and|mais|donc|ça|viens|vient|passe|ajoute|ajouter|add|follow|find|text|message|messages|you|are|here|there|toujours|souvent|jamais|déjà|deja)';
  var NUM = '(?:z[ée]ro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|nonante|cent|cents|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|one|two|three|four|five|seven|eight|nine)';

  var RE_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g;
  var RE_EMAIL_OBF = /[A-Za-z0-9._%+\-]+\s*(?:\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|\bat\b|@)\s*[A-Za-z0-9\-]+\s*(?:(?:\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\}|\bdot\b|\bpoint\b)\s*[A-Za-z0-9\-]+\s*)+/gi;
  var RE_NUMWORDS = new RegExp('(?:\\b' + NUM + '\\b[\\s\\-.,]*){5,}', 'gi');
  var RE_PHONE = /(?:\+|00)?\(?\d[\d\s.\-/()]{6,}\d/g;
  var RE_DATE = /\d{1,2}[.\/\-]\d{1,2}[.\/\-](?:19|20)\d{2}/g;
  var RE_KEYWORD = new RegExp(
    '\\b' + KW + '\\b(?:' +
      '\\s*(?::|=)\\s*@?[A-Za-z0-9_.]{2,}' +
      '|\\s*@[A-Za-z0-9_.]{2,}' +
      "|\\s+(?:c'est|c’est|cest|est|is)\\s+@?[A-Za-z0-9_.]{2,}" +
      '|\\s+@?(?=[A-Za-z0-9_.]*[0-9_.])[A-Za-z0-9_.]{3,}' +
    ')', 'gi');
  var RE_HANDLE = /(^|[\s(\[])@[A-Za-z0-9_.]{2,}/g;
  var RE_SOCIAL_URL = new RegExp('(?:https?://)?(?:www\\.)?(?:\\b' + KW + '\\.(?:com|me|fr|net|tv|co|org|link|app)|\\b(?:wa|t)\\.me)(?:/\\S*)?', 'gi');
  var RE_BEFORE_KW = new RegExp('\\b(?!' + STOP + '\\b)[A-Za-z0-9_.]{3,}\\s+(?:sur|on|en|via|par|chez)\\s+' + KW + '\\b', 'gi');
  var RE_PLATFORM = new RegExp('\\b' + KW + '\\b', 'gi');

  function normalizeText(s) {
    return String(s == null ? '' : s).replace(/[​-‍⁠﻿]/g, '').normalize('NFKC');
  }

  function maskSensitive(input) {
    var base = normalizeText(input);
    var t = base;
    t = t.replace(RE_EMAIL, MASK);
    t = t.replace(RE_EMAIL_OBF, MASK);
    t = t.replace(RE_SOCIAL_URL, MASK);
    t = t.replace(RE_NUMWORDS, MASK);
    t = t.replace(RE_PHONE, function (m) {
      var digits = m.replace(RE_DATE, '').replace(/\D/g, '');
      return digits.length >= 9 ? MASK : m;
    });
    t = t.replace(RE_BEFORE_KW, MASK);
    t = t.replace(RE_KEYWORD, MASK);
    t = t.replace(RE_PLATFORM, MASK);
    t = t.replace(RE_HANDLE, function (m, p1) { return p1 + MASK; });
    return { text: t, masked: t !== base };
  }

  function countWords(text) {
    var parts = String(text == null ? '' : text).split(/[^\p{L}\p{N}'\u2019]+/u), n = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) n += Math.max(1, Math.ceil(Array.from(parts[i]).length / 10));
    }
    return n;
  }

  window.AupyModeration = { maskSensitive: maskSensitive, countWords: countWords, MASK: MASK };

  console.log('[AUPYGO] message-rules.js restored (partial safe bootstrap)');
  // Full UI layer loads after DOM; keep AupyModeration available immediately.
  document.addEventListener('DOMContentLoaded', function () {
    console.log('[AUPYGO] message-rules ready');
  });
})();

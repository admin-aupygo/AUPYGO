/* AUPYGO — thème clair / sombre (bouton slide dans la page Profil)
 * Chargé dans <head> par index.html : applique le thème avant l'affichage (pas de flash).
 * Mémorisé dans localStorage ('aupygo_theme'), sinon préférence système. */
(function () {
  'use strict';
  var KEY = 'aupygo_theme';
  var root = document.documentElement;

  function readSaved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function systemTheme() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  }
  function current() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m && document.head) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    if (m) m.setAttribute('content', theme === 'dark' ? '#0f0d1a' : '#ffffff');
    syncSwitch();
  }

  var CSS = `
html[data-theme="dark"]{
  color-scheme:dark;
  --text:#ece9f6; --muted:#a9a3bd; --light:#0f0d1a; --white:#1f1b30;
  --border:rgba(167,139,250,.20); --dark:#0a0812;
  --shadow:0 10px 35px rgba(0,0,0,.55);
}
html[data-theme="dark"] body{background:var(--light);color:var(--text)}
html[data-theme="dark"] a{color:#c4b5fd}
html[data-theme="dark"] ::placeholder{color:#8b85a0;opacity:1}
html[data-theme="dark"] input,html[data-theme="dark"] select,html[data-theme="dark"] textarea{background:#1a1628;color:var(--text);border-color:rgba(167,139,250,.28)}
html[data-theme="dark"] option{background:#1a1628;color:#ece9f6}
html[data-theme="dark"] input[readonly],html[data-theme="dark"] select:disabled{background:#241f38;color:#b9b3cc}
html[data-theme="dark"] ::-webkit-scrollbar{width:10px;height:10px}
html[data-theme="dark"] ::-webkit-scrollbar-thumb{background:#3b3358;border-radius:8px}
html[data-theme="dark"] ::-webkit-scrollbar-track{background:#14111f}
/* carte Leaflet : tuiles assombries, marqueurs inchangés */
html[data-theme="dark"] .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.8)}
html[data-theme="dark"] .leaflet-container{background:#1b1b24}
html[data-theme="dark"] .leaflet-popup-content-wrapper,html[data-theme="dark"] .leaflet-popup-tip{background:#1f1b30;color:#ece9f6}
html[data-theme="dark"] header{background:rgba(33,26,46,0.97)}
html[data-theme="dark"] .logo-a{color:#c09efa}
html[data-theme="dark"] .logo-u{color:#ce9efa}
html[data-theme="dark"] .logo-p{color:#f09efa}
html[data-theme="dark"] .logo-y{color:#f68ec1}
html[data-theme="dark"] .location-pin::after{background:#1f1b30}
html[data-theme="dark"] nav button:hover{background:#281f37;color:#a78bfa}
html[data-theme="dark"] nav button.active{background:#2b223c;color:#a78bfa}
html[data-theme="dark"] .lang-select{background:#1f1b30}
html[data-theme="dark"] .hero-card{background:#1f1b30}
html[data-theme="dark"] .hero-card:hover{box-shadow:0 14px 40px rgba(0,0,0,0.38)}
html[data-theme="dark"] .hero-visual{background:radial-gradient(circle at 25% 25%,#473762,transparent 25%),
    radial-gradient(circle at 75% 70%,rgba(59,130,246,.18),transparent 28%),
    linear-gradient(135deg,#2c223c,rgba(236,72,153,.18))}
html[data-theme="dark"] .country-person{background:#1f1b30;box-shadow:0 5px 14px rgba(0,0,0,0.35)}
html[data-theme="dark"] .country-flag{background:#1f1b30;box-shadow:0 2px 5px rgba(0,0,0,0.38)}
html[data-theme="dark"] .world-symbol{background:#1f1b30;box-shadow:0 8px 24px rgba(0,0,0,0.4)}
html[data-theme="dark"] .btn-secondary{background:#2e2440;color:#a78bfa}
html[data-theme="dark"] .btn-locked{background:#2b213b}
html[data-theme="dark"] .card{background:#1f1b30}
html[data-theme="dark"] .map-toolbar{background:#1f1b30}
html[data-theme="dark"] .map-filter button{background:#1f1b30}
html[data-theme="dark"] .map-control-btn{background:#281f37}
html[data-theme="dark"] .map-control-btn:hover{background:#292039;color:#a78bfa}
html[data-theme="dark"] .map-container{background:#1f1b30}
html[data-theme="dark"] .map-privacy{background:#1f1b30}
html[data-theme="dark"] .aupy-marker{box-shadow:0 3px 12px rgba(0,0,0,0.5)}
html[data-theme="dark"] .aupy-marker.me{border-color:rgba(255,255,255,.13)}
html[data-theme="dark"] .aupy-marker.online{border-color:rgba(255,255,255,.13)}
html[data-theme="dark"] .aupy-marker.offline{border-color:rgba(255,255,255,.13)}
html[data-theme="dark"] .member-modal{background:#1f1b30;box-shadow:0 20px 50px rgba(0,0,0,0.6)}
html[data-theme="dark"] .member-modal-close{background:#292039;color:#a78bfa}
html[data-theme="dark"] .member-modal-close:hover{background:#342949}
html[data-theme="dark"] .member-online{color:#8ef6b5;background:rgba(34,197,94,.18);border:1px solid rgba(255,255,255,.13)}
html[data-theme="dark"] .member-hobbies-row .hobby-emoji{background:#292039;border:1px solid rgba(167,139,250,.30)}
html[data-theme="dark"] .member-msg-btn-disabled{background:#362a4b !important}
html[data-theme="dark"] .member-friend-btn{border:1px solid rgba(167,139,250,.30);background:#292039;color:#a78bfa}
html[data-theme="dark"] .member-plan-tag.FREE{background:#2b213b;color:#c0c5ce}
html[data-theme="dark"] .member-plan-tag.STANDARD{background:#2c223c;color:#c09efa}
html[data-theme="dark"] .geo-consent-modal{background:#1f1b30;box-shadow:0 20px 50px rgba(0,0,0,0.6)}
html[data-theme="dark"] .geo-consent-icon{background:linear-gradient(135deg, #2c223c, rgba(236,72,153,.18))}
html[data-theme="dark"] .geo-consent-modal .geo-privacy-box{background:#281f37}
html[data-theme="dark"] .geo-consent-modal .geo-privacy-box strong{color:#a78bfa}
html[data-theme="dark"] .profile-status{color:#8ef6b5;background:rgba(34,197,94,.18);border:1px solid rgba(255,255,255,.13)}
html[data-theme="dark"] .profile-form-card h3.form-section-title{color:#a78bfa}
html[data-theme="dark"] input,
html[data-theme="dark"] select,
html[data-theme="dark"] textarea{background:#1f1b30}
html[data-theme="dark"] input[readonly],
html[data-theme="dark"] select:disabled{background:#2a213a}
html[data-theme="dark"] .gender-option{background:#1f1b30}
html[data-theme="dark"] .gender-option:hover:not(:disabled){border-color:rgba(167,139,250,.30);background:#241c32}
html[data-theme="dark"] .gender-option.selected{background:#292039}
html[data-theme="dark"] .hobby{background:#1f1b30}
html[data-theme="dark"] .hobby:hover{border-color:rgba(167,139,250,.30);background:#241c32}
html[data-theme="dark"] .hobby.selected{background:#292039}
html[data-theme="dark"] .lang-chip{background:#1f1b30}
html[data-theme="dark"] .lang-chip:hover{border-color:rgba(167,139,250,.30);background:#241c32}
html[data-theme="dark"] .lang-chip.selected{background:#292039;color:#a78bfa}
html[data-theme="dark"] .profile-card-hobbies .hobby-emoji{background:#292039;border:1px solid rgba(167,139,250,.30)}
html[data-theme="dark"] .btn-danger{background:rgba(239,68,68,.18);color:#f68e8e}
html[data-theme="dark"] .btn-danger:hover{background:rgba(239,68,68,.18)}
html[data-theme="dark"] .plan{background:#1f1b30}
html[data-theme="dark"] .event{background:#1f1b30}
html[data-theme="dark"] .event-cover{background:linear-gradient(135deg,#342949,rgba(236,72,153,.18))}
html[data-theme="dark"] .badge{background:#2c223c;color:#a78bfa}
html[data-theme="dark"] .badge-paid{background:rgba(245,158,11,.18);color:#f6cb8e}
html[data-theme="dark"] .day{background:#1f1b30}
html[data-theme="dark"] .agenda-event{background:#2b223c;color:#a78bfa}
html[data-theme="dark"] .locked::after{background:rgba(33,26,46,0.88);color:#a78bfa}
html[data-theme="dark"] .message-box{background:#1f1b30}
html[data-theme="dark"] .conversations{background:#241c32}
html[data-theme="dark"] .conv-sidebar-header{background:#1f1b30}
html[data-theme="dark"] .btn-create-group{border:1px solid rgba(167,139,250,.30);background:#292039;color:#a78bfa}
html[data-theme="dark"] .btn-create-group:hover{background:#342949}
html[data-theme="dark"] .conversation{background:#1f1b30}
html[data-theme="dark"] .conversation:hover{background:#292039}
html[data-theme="dark"] .conversation.active{background:#2b223c}
html[data-theme="dark"] .chat-header{background:#1f1b30}
html[data-theme="dark"] .chat-messages{background:linear-gradient(180deg,#241c32 0%,#1f1b30 40%)}
html[data-theme="dark"] .chat-date-separator span{background:#241c32;box-shadow:0 1px 3px rgba(0,0,0,0.15)}
html[data-theme="dark"] .bubble{box-shadow:0 1px 2px rgba(0,0,0,0.15)}
html[data-theme="dark"] .bubble{background:#2c223c;color:#9e8ef6}
html[data-theme="dark"] .bubble .bubble-sender{color:#a78bfa}
html[data-theme="dark"] .chat-input{background:#1f1b30}
html[data-theme="dark"] .group-friends-pick{background:#241c32}
html[data-theme="dark"] .group-pick-item:hover{background:#2b223c}
html[data-theme="dark"] .group-pick-item.selected{background:#2b223c}
html[data-theme="dark"] .notice{background:#292039;border:1px solid rgba(167,139,250,.30)}
html[data-theme="dark"] .notice.warning{background:rgba(245,158,11,.18);border-color:rgba(255,255,255,.13)}
html[data-theme="dark"] .notice.security{background:rgba(34,197,94,.18);border-color:rgba(255,255,255,.13)}
html[data-theme="dark"] .toast{box-shadow:0 6px 20px rgba(0,0,0,0.5)}
html[data-theme="dark"] .btn-accept{background:rgba(34,197,94,.18);color:#8ef6b5}
html[data-theme="dark"] .btn-accept:hover{background:rgba(34,197,94,.18)}
html[data-theme="dark"] .btn-refuse{background:rgba(239,68,68,.18);color:#f68e8e}
html[data-theme="dark"] .btn-refuse:hover{background:rgba(239,68,68,.18)}
html[data-theme="dark"] .friend-request-card .status-confirmed{background:rgba(34,197,94,.18);color:#8ef6b5;border:1px solid rgba(255,255,255,.13)}
html[data-theme="dark"] .guest-banner .btn-primary{background:#1f1b30;color:#a78bfa}
html[data-theme="dark"] .home-btn{background:var(--card-bg, #1f1b30);border:2px solid var(--border, rgba(255,255,255,.13));box-shadow:0 2px 8px rgba(0,0,0,0.1)}
html[data-theme="dark"] .home-btn-label{color:var(--text, #8eb9f6)}
html[data-theme="dark"] .home-btn-lock{color:#f6bb8e;background:rgba(245,158,11,.18)}
html[data-theme="dark"] .header-plan-btn{background:#281f37}
html[data-theme="dark"] .header-plan-btn:hover{background:#2e233f}
html[data-theme="dark"] .bottom-nav-btn.active{color:#a78bfa}
html[data-theme="dark"] .more-sheet{background:#1f1b30;box-shadow:0 -8px 32px rgba(0,0,0,0.3)}
html[data-theme="dark"] .more-sheet-handle{background:rgba(59,130,246,.18)}
html[data-theme="dark"] .more-sheet-avatar{background:#281f37}
html[data-theme="dark"] .more-sheet-close{background:rgba(59,130,246,.18)}
html[data-theme="dark"] .more-sheet-item:hover,
html[data-theme="dark"] .more-sheet-item:active{background:#281f37;color:#a78bfa}
html[data-theme="dark"] .more-sheet-item-plan{background:linear-gradient(135deg, #261d34, rgba(236,72,153,.18))}
@media (max-width: 768px){
html[data-theme="dark"] .bottom-nav{background:rgba(33,26,46,0.98);box-shadow:0 -4px 20px rgba(0,0,0,0.15)}
}
html[data-theme="dark"] .plan-pass{background:linear-gradient(135deg, #261d34, rgba(236,72,153,.18));border:1px solid rgba(167,139,250,.30)}
html[data-theme="dark"] .plan-pass-title{color:#a78bfa}
html[data-theme="dark"] .chat-back-btn{background:#281f37;color:#a78bfa}
html[data-theme="dark"] .chat-delete-group-btn{background:rgba(239,68,68,.18);color:#f68e8e}
html[data-theme="dark"] .chat-delete-group-btn:hover{background:rgba(239,68,68,.18)}
html[data-theme="dark"] .calendar .day.day-has-activity{background:linear-gradient(145deg, #271e35 0%, rgba(236,72,153,.18) 100%);border:2px solid rgba(167,139,250,.30)}
html[data-theme="dark"] .calendar .day.day-has-activity strong{color:#c09efa}
html[data-theme="dark"] .home-btn-online{color:#8ef6b4}
html[data-theme="dark"] .modal-sheet{background:#1f1b30;box-shadow:0 -10px 40px rgba(0,0,0,0.6)}
html[data-theme="dark"] .wizard-dot{background:#352949}
html[data-theme="dark"] .wizard-dot.done{background:#44355e}
html[data-theme="dark"] .wizard-nav{background:#1f1b30}
html[data-theme="dark"] .emoji-pick{background:#1f1b30}
html[data-theme="dark"] .emoji-pick:hover{border-color:rgba(167,139,250,.30);background:#241c32}
html[data-theme="dark"] .emoji-pick.selected{background:linear-gradient(135deg,#292039,rgba(236,72,153,.18));color:#a78bfa}
html[data-theme="dark"] .btn-icon-delete{border:1px solid rgba(255,255,255,.13);background:rgba(239,68,68,.18);color:#f68e8e}
html[data-theme="dark"] .btn-icon-delete:hover{background:rgba(239,68,68,.18)}
html[data-theme="dark"] .event-seats{color:#8ef6b4}
html[data-theme="dark"] .event-seats.full{color:#f68e8e}
html[data-theme="dark"] [style*="color:#64748b"]{color:#8eb8f6 !important}
html[data-theme="dark"] [style*="color: #64748b"]{color:#8eb8f6 !important}
html[data-theme="dark"] [style*="color:#334155"]{color:#8eb9f6 !important}
html[data-theme="dark"] [style*="color: #334155"]{color:#8eb9f6 !important}
html[data-theme="dark"] [style*="color:#7c3aed"]{color:#c09efa !important}
html[data-theme="dark"] [style*="color: #7c3aed"]{color:#c09efa !important}
html[data-theme="dark"] [style*="color:#888"]{color:#cec0c0 !important}
html[data-theme="dark"] [style*="color: #888"]{color:#cec0c0 !important}
html[data-theme="dark"] [style*="color:#6b7280"]{color:#c0c5ce !important}
html[data-theme="dark"] [style*="color: #6b7280"]{color:#c0c5ce !important}
html[data-theme="dark"] [style*="color:#15803d"]{color:#8ef6b5 !important}
html[data-theme="dark"] [style*="color: #15803d"]{color:#8ef6b5 !important}
html[data-theme="dark"] [style*="color:#a16207"]{color:#f6cb8e !important}
html[data-theme="dark"] [style*="color: #a16207"]{color:#f6cb8e !important}
html[data-theme="dark"] [style*="color:#6b21a8"]{color:#d09efa !important}
html[data-theme="dark"] [style*="color: #6b21a8"]{color:#d09efa !important}
html[data-theme="dark"] [style*="color:#555"]{color:#e4dddd !important}
html[data-theme="dark"] [style*="color: #555"]{color:#e4dddd !important}
html[data-theme="dark"] [style*="color:#475569"]{color:#8eb9f6 !important}
html[data-theme="dark"] [style*="color: #475569"]{color:#8eb9f6 !important}
html[data-theme="dark"] [style*="color:#1e293b"]{color:#8eb5f6 !important}
html[data-theme="dark"] [style*="color: #1e293b"]{color:#8eb5f6 !important}
html[data-theme="dark"] [style*="color:#999"]{color:#cec0c0 !important}
html[data-theme="dark"] [style*="color: #999"]{color:#cec0c0 !important}
html[data-theme="dark"] [style*="background:#fff"]{background:#1f1b30 !important}
html[data-theme="dark"] [style*="background: #fff"]{background:#1f1b30 !important}
html[data-theme="dark"] [style*="background:#faf5ff"]{background:#261d34 !important}
html[data-theme="dark"] [style*="background: #faf5ff"]{background:#261d34 !important}
html[data-theme="dark"] [style*="background:#f8fafc"]{background:rgba(59,130,246,.18) !important}
html[data-theme="dark"] [style*="background: #f8fafc"]{background:rgba(59,130,246,.18) !important}
html[data-theme="dark"] [style*="background:#f3f4f6"]{background:#2b213b !important}
html[data-theme="dark"] [style*="background: #f3f4f6"]{background:#2b213b !important}
html[data-theme="dark"] [style*="background:#f0fdf4"]{background:rgba(34,197,94,.18) !important}
html[data-theme="dark"] [style*="background: #f0fdf4"]{background:rgba(34,197,94,.18) !important}
html[data-theme="dark"] [style*="border-color:#e5e7eb"]{border-color:rgba(255,255,255,.13) !important}

/* ===== Effets néon (mode sombre uniquement) ===== */
html[data-theme="dark"] .logo-a,html[data-theme="dark"] .logo-u,html[data-theme="dark"] .logo-p,
html[data-theme="dark"] .logo-y,html[data-theme="dark"] .logo-g,html[data-theme="dark"] .logo-o{
  text-shadow:0 0 6px currentColor,0 0 16px currentColor}
html[data-theme="dark"] .section-title h2,
html[data-theme="dark"] .profile-card h3,
html[data-theme="dark"] .profile-form-card h3.form-section-title{
  color:#f3e8ff;
  text-shadow:0 0 3px rgba(255,255,255,.55),0 0 10px rgba(167,139,250,.95),0 0 24px rgba(139,92,246,.75),0 0 46px rgba(139,92,246,.45);
  animation:aupyNeon 5s ease-in-out infinite}
html[data-theme="dark"] .profile-form-card h3.form-section-title{
  color:#e0d4ff;border-bottom-color:rgba(167,139,250,.35);
  text-shadow:0 0 3px rgba(255,255,255,.4),0 0 9px rgba(167,139,250,.85),0 0 20px rgba(139,92,246,.55)}
html[data-theme="dark"] .hero h1{color:#f5f3ff}
html[data-theme="dark"] .hero h1 .gradient{filter:drop-shadow(0 0 10px rgba(236,72,153,.6)) drop-shadow(0 0 22px rgba(124,58,237,.55))}
html[data-theme="dark"] .btn-primary{box-shadow:0 0 14px rgba(236,72,153,.40),0 0 30px rgba(124,58,237,.30)}
html[data-theme="dark"] .btn-primary:hover{box-shadow:0 0 20px rgba(236,72,153,.65),0 0 44px rgba(124,58,237,.5)}
html[data-theme="dark"] .card{border-color:rgba(167,139,250,.20);transition:box-shadow .25s,border-color .25s}
html[data-theme="dark"] .card:hover{border-color:rgba(167,139,250,.55);box-shadow:0 0 0 1px rgba(167,139,250,.30),0 0 26px rgba(139,92,246,.30)}
html[data-theme="dark"] .avatar{border-color:#1f1b30;box-shadow:0 0 0 3px rgba(167,139,250,.55),0 0 26px rgba(236,72,153,.45)}
html[data-theme="dark"] input:focus,html[data-theme="dark"] select:focus,html[data-theme="dark"] textarea:focus{
  border-color:#a78bfa;box-shadow:0 0 0 3px rgba(167,139,250,.22),0 0 16px rgba(139,92,246,.35)}
html[data-theme="dark"] .bottom-nav-btn.active{text-shadow:0 0 10px rgba(167,139,250,.9)}
html[data-theme="dark"] header{border-bottom-color:rgba(167,139,250,.28);box-shadow:0 1px 22px rgba(139,92,246,.18)}
@keyframes aupyNeon{
  0%,100%{opacity:1}
  47%{opacity:1}
  48%{opacity:.86}
  50%{opacity:1}
  52%{opacity:.92}
  54%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  html[data-theme="dark"] .section-title h2,html[data-theme="dark"] .profile-card h3,
  html[data-theme="dark"] .profile-form-card h3.form-section-title{animation:none}}

/* ===== Bouton thème (slide) ===== */
.theme-toggle-row{display:flex;align-items:center;justify-content:center;gap:10px;margin:12px auto 6px;font-size:13px;font-weight:600;color:var(--muted)}
.theme-switch{position:relative;width:48px;height:26px;padding:0;border-radius:999px;cursor:pointer;flex:none;
  border:1px solid rgba(124,58,237,.25);background:linear-gradient(135deg,#fde68a,#fbbf24);transition:background .35s,border-color .35s,box-shadow .35s}
.theme-switch:focus-visible{outline:2px solid #a78bfa;outline-offset:3px}
.theme-switch .ts-knob{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;
  display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.3);
  transition:transform .35s cubic-bezier(.5,1.6,.5,1),background .35s}
html[data-theme="dark"] .theme-switch{background:linear-gradient(135deg,#1e1b4b,#4c1d95);border-color:rgba(167,139,250,.6);
  box-shadow:0 0 12px rgba(139,92,246,.55)}
html[data-theme="dark"] .theme-switch .ts-knob{transform:translateX(22px);background:#e9e5ff}
@media (prefers-reduced-motion:reduce){.theme-switch,.theme-switch .ts-knob{transition:none}}
`;
  var st = document.createElement('style');
  st.id = 'aupygo-theme-css';
  st.textContent = CSS;
  (document.head || root).appendChild(st);

  apply(readSaved() === 'dark' || readSaved() === 'light' ? readSaved() : systemTheme());

  var LABELS = {
    fr: { label: 'Thème', light: 'Clair', dark: 'Sombre', aria: 'Activer le thème sombre' },
    en: { label: 'Theme', light: 'Light', dark: 'Dark', aria: 'Enable dark theme' },
    es: { label: 'Tema', light: 'Claro', dark: 'Oscuro', aria: 'Activar el tema oscuro' }
  };
  function lang() {
    var l = '';
    try { l = localStorage.getItem('aupygo_lang') || ''; } catch (e) {}
    l = (l || root.lang || 'fr').slice(0, 2).toLowerCase();
    return LABELS[l] ? l : 'fr';
  }

  function syncSwitch() {
    var btn = document.getElementById('themeSwitch');
    if (!btn) return;
    var dark = current() === 'dark', L = LABELS[lang()];
    btn.setAttribute('aria-checked', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', L.aria);
    var knob = btn.firstChild; if (knob) knob.textContent = dark ? '🌙' : '☀️';
    var txt = document.getElementById('themeSwitchText');
    if (txt) { var t = L.label + ' : ' + (dark ? L.dark : L.light); if (txt.textContent !== t) txt.textContent = t; }
  }

  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    save(next); apply(next);
  }

  function mount() {
    var host = document.querySelector('.profile-card');
    if (!host) return;
    var row = document.getElementById('themeToggleRow');
    if (row && host.contains(row)) { syncSwitch(); return; }
    if (row) row.remove();
    row = document.createElement('div');
    row.id = 'themeToggleRow';
    row.className = 'theme-toggle-row';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'themeSwitch'; btn.className = 'theme-switch';
    btn.setAttribute('role', 'switch');
    var knob = document.createElement('span'); knob.className = 'ts-knob'; btn.appendChild(knob);
    btn.addEventListener('click', toggle);
    var txt = document.createElement('span'); txt.id = 'themeSwitchText';
    row.appendChild(btn); row.appendChild(txt);
    var anchor = document.getElementById('profileMeta');
    if (anchor && anchor.parentNode === host) anchor.insertAdjacentElement('afterend', row);
    else host.appendChild(row);
    syncSwitch();
  }

  var queued = false;
  function schedule() {
    if (queued) return; queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; mount(); });
  }
  function start() {
    mount();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // synchronise plusieurs onglets
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) apply(e.newValue);
  });
})();

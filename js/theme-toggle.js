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
    if (typeof afterApply === 'function') afterApply(theme);
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

/* ===== Rattrapage automatique des surfaces restées claires (posé par theme-toggle.js) ===== */
html[data-theme="dark"] [data-dk-bg="1"]{background-color:#1f1b30 !important}
html[data-theme="dark"] [data-dk-bg="2"]{background-color:#292243 !important}
html[data-theme="dark"] [data-dk-bg="red"]{background-color:rgba(239,68,68,.18) !important}
html[data-theme="dark"] [data-dk-bg="green"]{background-color:rgba(34,197,94,.15) !important}
html[data-theme="dark"] [data-dk-bg="amber"]{background-color:rgba(245,158,11,.17) !important}
html[data-theme="dark"] [data-dk-bg="blue"]{background-color:rgba(59,130,246,.16) !important}
html[data-theme="dark"] [data-dk-fg="n"]{color:#e8e6f2 !important}
html[data-theme="dark"] [data-dk-fg="red"]{color:#fca5a5 !important}
html[data-theme="dark"] [data-dk-fg="green"]{color:#86efac !important}
html[data-theme="dark"] [data-dk-fg="amber"]{color:#fcd34d !important}
html[data-theme="dark"] [data-dk-fg="blue"]{color:#93c5fd !important}
html[data-theme="dark"] [data-dk-fg="purple"]{color:#c4b5fd !important}
html[data-theme="dark"] [data-dk-bd]{border-color:rgba(167,139,250,.28) !important}
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

  function afterApply(theme) {
    if (!document.body) return;
    if (theme === 'dark') queueScan(document.body); else clearMarks();
  }

  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    save(next); apply(next);
  }


  /* ---------- Rattrapage : toute surface restée claire en mode sombre ---------- */
  var SKIP_TAG = { SCRIPT:1, STYLE:1, NOSCRIPT:1, IMG:1, SVG:1, CANVAS:1, VIDEO:1, OPTION:1, BR:1, HEAD:1, META:1, LINK:1, TITLE:1 };
  function parseRGB(str) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(str || '');
    if (!m) return null;
    var a = m[4] === undefined ? 1 : (m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return [+m[1], +m[2], +m[3], a];
  }
  function lum(c) {
    var v = [c[0], c[1], c[2]].map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function hueOf(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d === 0) return { h: 0, s: 0 };
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    var l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1));
    return { h: h, s: s };
  }
  function family(c, mode) {
    var o = hueOf(c);
    var chroma = (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) / 255;
    // fonds très clairs : la saturation HSL gonfle les gris-bleu (slate) -> seuil plus haut ; textes sombres : on regarde la chroma
    if (mode === 'bg' ? o.s < 0.6 : chroma < 0.2) return 'n';
    var h = o.h;
    if (h < 20 || h >= 340) return 'red';
    if (h < 65) return 'amber';
    if (h < 170) return 'green';
    if (h < 255) return 'blue';
    return 'purple';
  }
  function skipEl(el) {
    return !!(SKIP_TAG[el.tagName] || SKIP_TAG[(el.tagName || '').toLowerCase()] ||
      (el.closest && el.closest('.leaflet-container, .theme-switch, .aupy-marker, [data-dk-skip]')));
  }
  function effBg(el, cache) {
    if (cache.has(el)) return cache.get(el);
    var res;
    var cs = getComputedStyle(el);
    var bg = parseRGB(cs.backgroundColor);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') res = null;
    else if (bg && bg[3] >= 0.9) res = bg;
    else if (el.parentElement) res = effBg(el.parentElement, cache);
    else res = [15, 13, 26, 1];
    cache.set(el, res);
    return res;
  }
  function scanNode(root) {
    if (current() !== 'dark' || !root || root.nodeType !== 1) return;
    var cache = new Map();
    (function walk(el) {
      if (skipEl(el)) return;
      var cs = getComputedStyle(el);
      if (cs.display === 'none') return;
      // 1) fond clair opaque -> sombre
      var bg = parseRGB(cs.backgroundColor);
      if (bg && bg[3] >= 0.9 && (!cs.backgroundImage || cs.backgroundImage === 'none') && lum(bg) > 0.7 && !el.hasAttribute('data-dk-bg')) {
        var f = family(bg, 'bg'), v = '2';
        if (f === 'n') v = lum(bg) > 0.9 && hueOf(bg).s < 0.12 ? '1' : '2';
        else if (f !== 'purple') v = f;
        el.setAttribute('data-dk-bg', v);
        cache.clear();
      }
      // 2) bordure claire -> discrète
      if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') {
        var bc = parseRGB(cs.borderTopColor);
        if (bc && bc[3] >= 0.5 && lum(bc) > 0.75 && !el.hasAttribute('data-dk-bd')) el.setAttribute('data-dk-bd', '1');
      }
      // 3) texte sombre sur fond sombre -> clair
      var hasText = false;
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue.trim()) { hasText = true; break; }
      }
      if (hasText && !el.hasAttribute('data-dk-fg')) {
        var fg = parseRGB(cs.color), eb = effBg(el, cache);
        if (fg && eb && lum(eb) < 0.2 && contrast(fg, eb) < 3.5) el.setAttribute('data-dk-fg', family(fg, 'fg'));
      }
      for (var k = 0; k < el.children.length; k++) walk(el.children[k]);
    })(root);
  }
  function clearMarks() {
    var list = document.querySelectorAll('[data-dk-bg],[data-dk-fg],[data-dk-bd]');
    for (var i = 0; i < list.length; i++) {
      list[i].removeAttribute('data-dk-bg'); list[i].removeAttribute('data-dk-fg'); list[i].removeAttribute('data-dk-bd');
    }
  }
  var pending = new Set(), flushQueued = false;
  function queueScan(node) {
    if (current() !== 'dark' || !node || node.nodeType !== 1) return;
    pending.add(node);
    if (flushQueued) return;
    flushQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      flushQueued = false;
      var roots = Array.from(pending); pending.clear();
      roots.forEach(function (r) {
        // un changement de style/classe peut rendre une marque obsolète : on la retire puis on rescanne
        if (r.querySelectorAll) {
          var old = r.querySelectorAll('[data-dk-bg],[data-dk-fg],[data-dk-bd]');
          for (var i = 0; i < old.length; i++) { old[i].removeAttribute('data-dk-bg'); old[i].removeAttribute('data-dk-fg'); old[i].removeAttribute('data-dk-bd'); }
        }
        r.removeAttribute('data-dk-bg'); r.removeAttribute('data-dk-fg'); r.removeAttribute('data-dk-bd');
        if (document.contains(r)) scanNode(r);
      });
    });
  }
  function startDarkify() {
    if (current() === 'dark') queueScan(document.body);
    new MutationObserver(function (muts) {
      if (current() !== 'dark') return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) { var n = m.addedNodes[j]; if (n.nodeType === 1 && n.id !== 'themeToggleRow') queueScan(n); }
        } else if (m.type === 'attributes' && m.target.nodeType === 1) {
          queueScan(m.target);
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
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
    startDarkify();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // synchronise plusieurs onglets
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) apply(e.newValue);
  });
})();

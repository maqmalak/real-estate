/* OpenConstructionERP — chat widget v4
   Structural rewrite: fixed composer zone, proper layout, /api/inquiry endpoint. */
(function(){
  if(document.getElementById('oce-cw')) return;

  var EMAIL   = 'info@datadrivenconstruction.io';
  var TG      = 'https://t.me/datadrivenconstruction';
  var GH_BUG  = 'https://github.com/datadrivenconstruction/OpenConstructionERP/issues/new?labels=bug';
  var GH_FEAT = 'https://github.com/datadrivenconstruction/OpenConstructionERP/issues/new?labels=enhancement';
  var CONTACT = '/contact.html';
  var DOCS    = '/modules';
  var API     = '/api/inquiry';

  /* ── SVG icons (Lucide-style, 24x24) ────────────────────────────────── */
  var IC = {
    bug:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.88 1.88"/><path d="M14.12 3.88L16 2"/><path d="M9 7.13v-1a3.003 3.003 0 116 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>',
    idea:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
    handshake:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
    help:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    docs:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>',
    users:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    mail:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>',
    github:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 00-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 004 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
    send:     '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
    form:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 113 3L12 15l-4 1 1-4z"/></svg>',
    check:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
    arrow:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>',
    star:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    play:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
    back:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>',
    msg:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    at:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-4 8"/></svg>',
    pen:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
    zap:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
  };

  /* ── styles ─────────────────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = [
    /* reset */
    '#oce-cw{position:fixed;bottom:24px;right:24px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '#oce-cw *{box-sizing:border-box;margin:0;padding:0}',

    /* floating button */
    '#oce-cw-btn{width:56px;height:56px;border-radius:50%;border:none;background:linear-gradient(135deg,#0a84ff 0%,#0055b3 100%);color:#fff;cursor:pointer;box-shadow:0 4px 16px rgba(10,132,255,.35);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;position:relative}',
    '#oce-cw-btn:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(10,132,255,.45)}',
    '#oce-cw-btn svg{width:26px;height:26px}',
    '#oce-cw-btn::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(10,132,255,.3);animation:oce-pulse 2.5s ease-out infinite;pointer-events:none}',
    '#oce-cw-btn.oce-open::after{display:none}',
    '@keyframes oce-pulse{0%{transform:scale(1);opacity:.6}70%{transform:scale(1.3);opacity:0}100%{transform:scale(1.3);opacity:0}}',

    /* popup — flex column, fit viewport */
    '#oce-cw-pop{display:none;position:fixed;bottom:90px;right:24px;width:380px;max-width:calc(100vw - 48px);height:min(520px,calc(100vh - 120px));border-radius:16px;background:#fff;box-shadow:0 16px 48px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);overflow:hidden;flex-direction:column}',
    '#oce-cw-pop.oce-show{display:flex;animation:oce-in .25s ease-out}',
    '@keyframes oce-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',

    /* header — compact, polished */
    '#oce-cw-hdr{background:linear-gradient(135deg,#0a84ff 0%,#0055b3 100%);color:#fff;padding:16px 20px;position:relative;flex-shrink:0}',
    '#oce-cw-hdr-top{display:flex;align-items:center;gap:10px}',
    '#oce-cw-hdr img{width:32px;height:32px;border-radius:8px;border:2px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1)}',
    '#oce-cw-hdr-txt h3{font-size:14px;font-weight:700;letter-spacing:-.2px}',
    '#oce-cw-hdr-txt p{font-size:11px;opacity:.8;margin-top:1px;display:flex;align-items:center;gap:5px}',
    '.oce-dot{width:6px;height:6px;border-radius:50%;background:#34d399;flex-shrink:0}',

    /* close button — 26px */
    '#oce-cw-close{position:absolute;top:12px;right:12px;background:rgba(255,255,255,.12);border:none;color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;transition:background .15s;line-height:1}',
    '#oce-cw-close:hover{background:rgba(255,255,255,.25)}',

    /* body — scrollable message area */
    '#oce-cw-body{padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;scroll-behavior:smooth}',

    /* composer — fixed at bottom */
    '#oce-cw-composer{display:none;border-top:1px solid #edf0f3;padding:12px 16px;flex-shrink:0;gap:8px;align-items:flex-end;background:#fafbfc}',
    '#oce-cw-composer.oce-composer-show{display:flex}',
    '#oce-cw-composer textarea,#oce-cw-composer input[type="email"]{flex:1;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:10px;font-size:13.5px;font-family:inherit;resize:none;outline:none;transition:border-color .2s,box-shadow .2s;background:#fff;min-width:0;line-height:1.5}',
    '#oce-cw-composer textarea:focus,#oce-cw-composer input[type="email"]:focus{border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.1)}',
    '#oce-cw-composer textarea{overflow-y:auto;max-height:72px}',

    /* send button — 36px circle */
    '#oce-cw-composer .oce-send-btn{width:36px;height:36px;min-width:36px;min-height:36px;border-radius:50%;border:none;background:#0a84ff;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,opacity .15s}',
    '#oce-cw-composer .oce-send-btn:hover{transform:scale(1.06)}',
    '#oce-cw-composer .oce-send-btn:disabled{opacity:.4;cursor:default;transform:none}',
    '#oce-cw-composer .oce-send-btn svg{width:18px;height:18px}',

    /* messages */
    '.oce-msg{max-width:88%;padding:11px 15px;font-size:13.5px;line-height:1.55;animation:oce-fi .3s ease-out}',
    '@keyframes oce-fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
    '.oce-msg-bot{background:#f4f6f8;color:#1d1d1f;align-self:flex-start;border-radius:4px 14px 14px 14px}',
    '.oce-msg-usr{background:#0a84ff;color:#fff;align-self:flex-end;border-radius:14px 14px 4px 14px}',
    '.oce-msg a{color:#0060c7;font-weight:600;text-decoration:none;border-bottom:1px solid rgba(0,96,199,.3)}',
    '.oce-msg a:hover{border-color:#0060c7}',
    '.oce-msg-usr a{color:#fff;border-bottom-color:rgba(255,255,255,.5)}',

    /* typing indicator */
    '.oce-typing{align-self:flex-start;padding:12px 18px;background:#f4f6f8;border-radius:4px 14px 14px 14px;display:flex;gap:5px;animation:oce-fi .2s ease-out}',
    '.oce-typing span{width:5px;height:5px;border-radius:50%;background:#9ca3af;animation:oce-dot .6s infinite alternate}',
    '.oce-typing span:nth-child(2){animation-delay:.2s}',
    '.oce-typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes oce-dot{to{opacity:.3;transform:translateY(-3px)}}',

    /* topic cards — 2-column grid */
    '.oce-topics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}',
    '.oce-topic{background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:14px 12px;cursor:pointer;transition:all .2s ease;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}',
    '.oce-topic:hover{border-color:#0a84ff;background:linear-gradient(180deg,#f0f7ff 0%,#fff 100%);box-shadow:0 4px 14px rgba(10,132,255,.12);transform:translateY(-2px)}',
    '.oce-topic:active{transform:translateY(0) scale(.98)}',
    '.oce-topic-icon{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.06)}',
    '.oce-topic-icon svg{width:18px;height:18px}',
    '.oce-topic-icon.tc-red{color:#dc2626;background:#fee2e2}',
    '.oce-topic-icon.tc-amber{color:#d97706;background:#fef3c7}',
    '.oce-topic-icon.tc-blue{color:#2563eb;background:#dbeafe}',
    '.oce-topic-icon.tc-violet{color:#7c3aed;background:#ede9fe}',
    '.oce-topic-icon.tc-emerald{color:#059669;background:#d1fae5}',
    '.oce-topic-icon.tc-cyan{color:#0891b2;background:#cffafe}',
    '.oce-topic-title{font-size:13px;font-weight:600;color:#1d1d1f}',
    '.oce-topic-desc{font-size:11px;color:#6b7280;line-height:1.3}',

    /* action cards — horizontal layout */
    '.oce-actions{display:flex;flex-direction:column;gap:6px;margin-top:4px}',
    '.oce-action{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fafbfc;border:1px solid #e8eaed;border-radius:12px;text-decoration:none;color:#1d1d1f;transition:all .2s ease;cursor:pointer}',
    '.oce-action:hover{border-color:#0a84ff;background:#eff6ff;box-shadow:0 3px 12px rgba(10,132,255,.1);transform:translateX(3px)}',
    '.oce-action-ic{flex-shrink:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#eff6ff;border-radius:10px;color:#2563eb}',
    '.oce-action-ic svg{width:18px;height:18px}',
    '.oce-action-txt{display:flex;flex-direction:column;min-width:0}',
    '.oce-action-t{font-size:13px;font-weight:600}',
    '.oce-action-d{font-size:11px;color:#6b7280}',
    '.oce-action-arr{margin-left:auto;color:#cbd5e1;flex-shrink:0;opacity:.6}',
    '.oce-action:hover .oce-action-arr{color:#0a84ff;opacity:1}',
    '.oce-action-arr svg{width:14px;height:14px}',

    /* quick reply buttons — pill shape */
    '.oce-qr{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}',
    '.oce-qr button{background:#fff;border:1px solid #d1d5db;border-radius:20px;padding:8px 16px;font-size:12.5px;cursor:pointer;transition:all .2s ease;color:#374151;font-weight:500;display:inline-flex;align-items:center;gap:6px;line-height:1}',
    '.oce-qr button:hover{border-color:#0a84ff;color:#0a84ff;background:#eff6ff}',
    '.oce-qr button svg{width:14px;height:14px;flex-shrink:0}',

    /* success state */
    '.oce-success{display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px 16px;text-align:center;animation:oce-fi .35s ease-out}',
    '.oce-success-ic{width:40px;height:40px;border-radius:50%;background:#ecfdf5;color:#10b981;display:flex;align-items:center;justify-content:center}',
    '.oce-success-ic svg{width:22px;height:22px}',
    '.oce-success h4{font-size:15px;font-weight:700;color:#1d1d1f}',
    '.oce-success p{font-size:13px;color:#6b7280;line-height:1.5}',

    /* mobile */
    '@media(max-width:480px){#oce-cw-pop{right:8px;left:8px;bottom:80px;width:auto;height:auto;max-height:calc(100vh - 100px)}#oce-cw{bottom:16px;right:16px}.oce-topics{grid-template-columns:1fr 1fr}}'
  ].join('\n');
  document.head.appendChild(css);

  /* ── DOM ─────────────────────────────────────────────────────────────── */
  var root = document.createElement('div');
  root.id = 'oce-cw';
  root.innerHTML = [
    '<div id="oce-cw-pop">',
      '<div id="oce-cw-hdr">',
        '<div id="oce-cw-hdr-top">',
          '<img src="/assets/logo-icon-512.webp" alt="OCE" onerror="this.style.display=\'none\'">',
          '<div id="oce-cw-hdr-txt">',
            '<h3>OpenConstructionERP</h3>',
            '<p><span class="oce-dot"></span>We usually reply within a few hours</p>',
          '</div>',
        '</div>',
        '<button id="oce-cw-close" onclick="oceToggle()">\u00D7</button>',
      '</div>',
      '<div id="oce-cw-body"></div>',
      '<div id="oce-cw-composer"></div>',
    '</div>',
    '<button id="oce-cw-btn" onclick="oceToggle()">' + IC.msg + '</button>'
  ].join('');
  document.body.appendChild(root);

  var body     = document.getElementById('oce-cw-body');
  var popup    = document.getElementById('oce-cw-pop');
  var composer = document.getElementById('oce-cw-composer');
  var btn      = document.getElementById('oce-cw-btn');
  var isOpen   = false;
  var started  = false;
  var collected = {};

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function scroll(){
    setTimeout(function(){ body.scrollTop = body.scrollHeight; }, 50);
  }

  function hideComposer(){
    composer.classList.remove('oce-composer-show');
    composer.innerHTML = '';
  }

  function showComposer(){
    composer.classList.add('oce-composer-show');
  }

  function addBot(html, delay){
    return new Promise(function(ok){
      var dots = document.createElement('div');
      dots.className = 'oce-typing';
      dots.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(dots);
      scroll();
      setTimeout(function(){
        dots.remove();
        var d = document.createElement('div');
        d.className = 'oce-msg oce-msg-bot';
        d.innerHTML = html;
        body.appendChild(d);
        scroll();
        ok();
      }, delay || 500);
    });
  }

  function addUsr(txt){
    var d = document.createElement('div');
    d.className = 'oce-msg oce-msg-usr';
    d.textContent = txt;
    body.appendChild(d);
    scroll();
  }

  function addTopics(){
    var topics = [
      {icon:IC.bug,       tc:'tc-red',     title:'Report a Problem',     desc:'Bug, error, or crash',     key:'bug'},
      {icon:IC.idea,      tc:'tc-amber',   title:'Suggest a Feature',    desc:'Share your idea with us',  key:'feature'},
      {icon:IC.star,      tc:'tc-blue',    title:'Share Feedback',       desc:'Tell us what you think',   key:'feedback'},
      {icon:IC.help,      tc:'tc-violet',  title:'Ask a Question',       desc:'Get help from the team',   key:'question'},
      {icon:IC.handshake, tc:'tc-emerald', title:'Partnership & Sales',  desc:'Enterprise & licensing',   key:'partner'},
      {icon:IC.docs,      tc:'tc-cyan',    title:'Explore Platform',     desc:'Modules, demo & docs',     key:'docs'}
    ];
    var g = document.createElement('div');
    g.className = 'oce-topics';
    topics.forEach(function(t){
      var c = document.createElement('div');
      c.className = 'oce-topic';
      c.innerHTML = '<span class="oce-topic-icon ' + t.tc + '">' + t.icon + '</span><span class="oce-topic-title">' + t.title + '</span><span class="oce-topic-desc">' + t.desc + '</span>';
      c.onclick = function(){ g.remove(); handle(t.key, t.title); };
      g.appendChild(c);
    });
    body.appendChild(g);
    scroll();
  }

  function addActions(arr){
    var w = document.createElement('div');
    w.className = 'oce-actions';
    arr.forEach(function(a){
      var el = document.createElement(a.href ? 'a' : 'div');
      el.className = 'oce-action';
      if(a.href){ el.href = a.href; el.target = a.href.indexOf('mailto:') === 0 ? '_self' : '_blank'; }
      if(a.onclick) el.onclick = a.onclick;
      el.innerHTML = '<span class="oce-action-ic">' + a.icon + '</span><span class="oce-action-txt"><span class="oce-action-t">' + a.title + '</span><span class="oce-action-d">' + a.desc + '</span></span><span class="oce-action-arr">' + IC.arrow + '</span>';
      w.appendChild(el);
    });
    body.appendChild(w);
    scroll();
  }

  /* ── Composer inputs ────────────────────────────────────────────────── */
  function addTextInput(placeholder, onSubmit){
    composer.innerHTML = '';
    var ta = document.createElement('textarea');
    ta.placeholder = placeholder;
    ta.rows = 1;
    var sb = document.createElement('button');
    sb.className = 'oce-send-btn';
    sb.innerHTML = IC.send;
    sb.disabled = true;

    ta.oninput = function(){
      sb.disabled = !ta.value.trim();
      /* auto-grow: reset then measure */
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 72) + 'px';
    };
    ta.onkeydown = function(e){
      if(e.key === 'Enter' && !e.shiftKey && ta.value.trim()){
        e.preventDefault();
        go();
      }
    };
    sb.onclick = go;

    function go(){
      var v = ta.value.trim();
      if(!v) return;
      hideComposer();
      addUsr(v);
      onSubmit(v);
    }

    composer.appendChild(ta);
    composer.appendChild(sb);
    showComposer();
    setTimeout(function(){ ta.focus(); }, 80);
  }

  function addEmailInput(onSubmit){
    composer.innerHTML = '';
    var inp = document.createElement('input');
    inp.type = 'email';
    inp.placeholder = 'your@email.com';
    var sb = document.createElement('button');
    sb.className = 'oce-send-btn';
    sb.innerHTML = IC.send;
    sb.disabled = true;

    inp.oninput = function(){
      sb.disabled = !inp.value.trim() || !inp.validity.valid;
    };
    inp.onkeydown = function(e){
      if(e.key === 'Enter' && inp.value.trim() && inp.validity.valid){
        e.preventDefault();
        go();
      }
    };
    sb.onclick = go;

    function go(){
      var v = inp.value.trim();
      if(!v || !inp.validity.valid) return;
      hideComposer();
      addUsr(v);
      onSubmit(v);
    }

    composer.appendChild(inp);
    composer.appendChild(sb);
    showComposer();
    setTimeout(function(){ inp.focus(); }, 80);
  }

  function addSkipBtn(text, onClick){
    var w = document.createElement('div');
    w.className = 'oce-qr';
    var b = document.createElement('button');
    b.textContent = text;
    b.onclick = function(){
      w.remove();
      hideComposer();
      onClick();
    };
    w.appendChild(b);
    body.appendChild(w);
    scroll();
  }

  function showSuccess(title, msg){
    var d = document.createElement('div');
    d.className = 'oce-success';
    d.innerHTML = '<span class="oce-success-ic">' + IC.check + '</span><h4>' + title + '</h4><p>' + msg + '</p>';
    body.appendChild(d);
    scroll();
    setTimeout(endOptions, 800);
  }

  function endOptions(){
    var w = document.createElement('div');
    w.className = 'oce-qr';
    var b1 = document.createElement('button');
    b1.innerHTML = IC.back + ' Back to menu';
    b1.onclick = function(){ startChat(); };
    w.appendChild(b1);
    body.appendChild(w);
    scroll();
  }

  /* ── API submission with mailto fallback ────────────────────────────── */
  function trySend(data){
    try {
      var x = new XMLHttpRequest();
      x.open('POST', API, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.onload = function(){
        if(x.status < 200 || x.status >= 300){
          mailtoFallback(data);
        }
      };
      x.onerror = function(){
        mailtoFallback(data);
      };
      x.send(JSON.stringify(data));
    } catch(e) {
      mailtoFallback(data);
    }
    collected = {};
  }

  function mailtoFallback(data){
    var subj = encodeURIComponent('[OCE Widget] ' + (data.type || 'Inquiry'));
    var lines = [];
    Object.keys(data).forEach(function(k){
      if(data[k]) lines.push(k + ': ' + data[k]);
    });
    var msgBody = encodeURIComponent(lines.join('\n'));
    window.open('mailto:' + EMAIL + '?subject=' + subj + '&body=' + msgBody, '_self');
  }

  /* ── flows ──────────────────────────────────────────────────────────── */
  function startChat(){
    body.innerHTML = '';
    hideComposer();
    collected = {};
    addBot('Hi there! \ud83d\udc4b I\u2019m here to help with <b>OpenConstructionERP</b>. Pick a topic below or type a message.').then(function(){
      setTimeout(addTopics, 200);
    });
  }

  function handle(key, title){
    addUsr(title);
    collected.topic = key;

    if(key === 'bug')      flowBug();
    else if(key === 'feature')  flowFeature();
    else if(key === 'feedback') flowFeedback();
    else if(key === 'question') flowQuestion();
    else if(key === 'partner')  flowPartner();
    else if(key === 'docs')     flowDocs();
  }

  /* ── Bug ─────────────────────────────────────────────────────────────── */
  function flowBug(){
    addBot('Sorry to hear that! Please describe the issue \u2014 what happened and what you expected.', 600).then(function(){
      addTextInput('Describe the bug: what happened, steps to reproduce...', function(msg){
        collected.message = msg;
        addBot('Got it. Which area is affected?', 500).then(function(){
          setTimeout(function(){
            addActions([
              {icon:IC.docs, title:'Cost Estimation / BOQ', desc:'Pricing, quantities, estimates', onclick:function(){ bugArea('Cost Estimation'); }},
              {icon:IC.form, title:'Project Management',    desc:'Tasks, documents, schedules',    onclick:function(){ bugArea('Project Management'); }},
              {icon:IC.zap,  title:'Integrations / Import', desc:'CAD, IFC, CSV, API',             onclick:function(){ bugArea('Integrations'); }},
              {icon:IC.help, title:'Other / Not Sure',      desc:'Login, UI, performance',         onclick:function(){ bugArea('Other'); }}
            ]);
          }, 200);
        });
      });
    });
  }

  function bugArea(area){
    collected.area = area;
    addUsr(area);
    askEmail(function(){
      trySend({type:'bug', area:collected.area, message:collected.message, email:collected.email});
      showSuccess('Bug Report Received', 'We\u2019ll investigate this. You can also track it on <a href="' + GH_BUG + '" target="_blank">GitHub</a>.');
    });
  }

  /* ── Feature ────────────────────────────────────────────────────────── */
  function flowFeature(){
    addBot('Great \u2014 we love new ideas! Describe the feature you\u2019d like to see.', 600).then(function(){
      addTextInput('What feature would help you? Describe the use case...', function(msg){
        collected.message = msg;
        addBot('How important is this for your workflow?', 500).then(function(){
          setTimeout(function(){
            addActions([
              {icon:IC.zap,  title:'Critical',      desc:'Blocking my work',          onclick:function(){ featPrio('Critical'); }},
              {icon:IC.star, title:'Nice to Have',   desc:'Would improve my workflow', onclick:function(){ featPrio('Nice to Have'); }},
              {icon:IC.idea, title:'Just an Idea',   desc:'For future consideration',  onclick:function(){ featPrio('Just an Idea'); }}
            ]);
          }, 200);
        });
      });
    });
  }

  function featPrio(prio){
    collected.priority = prio;
    addUsr(prio);
    askEmail(function(){
      trySend({type:'feature', priority:collected.priority, message:collected.message, email:collected.email});
      showSuccess('Feature Request Saved', 'Your idea is noted! Vote and discuss on <a href="' + GH_FEAT + '" target="_blank">GitHub</a>.');
    });
  }

  /* ── Feedback ───────────────────────────────────────────────────────── */
  function flowFeedback(){
    addBot('We\u2019d love to hear your thoughts! How would you rate OpenConstructionERP so far?', 600).then(function(){
      setTimeout(function(){
        addActions([
          {icon:IC.star,  title:'Excellent',         desc:'Exactly what I needed',       onclick:function(){ fbRating('Excellent'); }},
          {icon:IC.check, title:'Good',              desc:'Works well, minor issues',    onclick:function(){ fbRating('Good'); }},
          {icon:IC.help,  title:'Could Be Better',   desc:'Has potential but needs work', onclick:function(){ fbRating('Could Be Better'); }},
          {icon:IC.bug,   title:'Needs Improvement',  desc:'Significant issues',          onclick:function(){ fbRating('Needs Improvement'); }}
        ]);
      }, 200);
    });
  }

  function fbRating(rating){
    collected.rating = rating;
    addUsr(rating);
    var prompt = (rating === 'Excellent' || rating === 'Good')
      ? 'Thank you! What do you like most? Anything we should keep doing?'
      : 'Thanks for your honesty. What should we improve first?';
    addBot(prompt, 500).then(function(){
      addTextInput('Share your thoughts...', function(msg){
        collected.message = msg;
        askEmail(function(){
          trySend({type:'feedback', rating:collected.rating, message:collected.message, email:collected.email});
          showSuccess('Feedback Received', 'Your opinion matters to us \u2014 thank you for helping us improve!');
        });
      });
    });
  }

  /* ── Question ───────────────────────────────────────────────────────── */
  function flowQuestion(){
    addBot('Sure \u2014 type your question and we\u2019ll make sure the right person sees it.', 600).then(function(){
      addTextInput('Type your question here...', function(msg){
        collected.message = msg;
        addBot('Thanks! Where would you like to get the answer?', 500).then(function(){
          setTimeout(function(){
            addActions([
              {icon:IC.mail,     title:'Reply by Email',     desc:'We\u2019ll respond within 24h', onclick:function(){ qReply('email'); }},
              {icon:IC.telegram, title:'Discuss in Telegram', desc:'Get help from 870+ members',  href:TG},
              {icon:IC.github,   title:'Ask on GitHub',       desc:'For technical deep-dives',     href:'https://github.com/datadrivenconstruction/OpenConstructionERP/discussions'}
            ]);
            addSkipBtn('Skip \u2014 just send it', function(){
              askEmail(function(){
                trySend({type:'question', message:collected.message, email:collected.email});
                showSuccess('Question Sent', 'We\u2019ll get back to you as soon as possible!');
              });
            });
          }, 200);
        });
      });
    });
  }

  function qReply(via){
    addUsr('Reply by email');
    askEmail(function(){
      trySend({type:'question', message:collected.message, email:collected.email, replyVia:via});
      showSuccess('Question Sent', 'We\u2019ll reply to <b>' + collected.email + '</b> within 24 hours.');
    });
  }

  /* ── Partner ────────────────────────────────────────────────────────── */
  function flowPartner(){
    addBot('Glad you\u2019re interested! What type of inquiry is this?', 600).then(function(){
      setTimeout(function(){
        addActions([
          {icon:IC.handshake, title:'Partnership',        desc:'Integration, reselling, co-development', onclick:function(){ partType('Partnership'); }},
          {icon:IC.docs,      title:'Enterprise License', desc:'On-premise deployment & support',        onclick:function(){ partType('Enterprise License'); }},
          {icon:IC.zap,       title:'Custom Development', desc:'Tailored modules & workflows',           onclick:function(){ partType('Custom Development'); }},
          {icon:IC.help,      title:'Something Else',     desc:'Other business inquiry',                 onclick:function(){ partType('Other'); }}
        ]);
      }, 200);
    });
  }

  function partType(type){
    collected.partnerType = type;
    addUsr(type);
    addBot('Please briefly describe your organization and what you\u2019re looking for.', 500).then(function(){
      addTextInput('Company name, your role, and what you need...', function(msg){
        collected.message = msg;
        addBot('Perfect. What\u2019s the best email to reach you?', 400).then(function(){
          addEmailInput(function(email){
            collected.email = email;
            trySend({type:'partner', partnerType:collected.partnerType, message:collected.message, email:collected.email});
            showSuccess('Inquiry Received', 'We\u2019ll contact you at <b>' + email + '</b> within 24 hours.<br>For urgent matters: <a href="mailto:' + EMAIL + '">' + EMAIL + '</a>');
          });
        });
      });
    });
  }

  /* ── Docs ────────────────────────────────────────────────────────────── */
  function flowDocs(){
    addBot('Here\u2019s how to explore the platform:', 500).then(function(){
      setTimeout(function(){
        addActions([
          {icon:IC.docs,   title:'Platform Modules', desc:'Full feature overview',      href:DOCS},
          {icon:IC.play,   title:'Try Live Demo',    desc:'No signup required',         href:'/demo'},
          {icon:IC.github, title:'GitHub Repository', desc:'Source code & self-hosting', href:'https://github.com/datadrivenconstruction/OpenConstructionERP'},
          {icon:IC.users,  title:'Join Community',    desc:'870+ members on Telegram',  href:TG}
        ]);
        setTimeout(endOptions, 400);
      }, 200);
    });
  }

  /* ── email collector ────────────────────────────────────────────────── */
  function askEmail(then){
    addBot('Could you share your email so we can follow up?', 500).then(function(){
      addEmailInput(function(email){
        collected.email = email;
        then();
      });
      addSkipBtn('Skip', function(){
        collected.email = '(not provided)';
        then();
      });
    });
  }

  /* ── toggle ─────────────────────────────────────────────────────────── */
  window.oceToggle = function(){
    if(!isOpen){
      popup.classList.add('oce-show');
      btn.classList.add('oce-open');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      if(!started){ startChat(); started = true; }
      isOpen = true;
    } else {
      popup.classList.remove('oce-show');
      btn.classList.remove('oce-open');
      btn.innerHTML = IC.msg;
      isOpen = false;
    }
  };
})();

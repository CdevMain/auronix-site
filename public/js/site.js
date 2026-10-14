// Site: carregamento, menu lateral, barra de compra no celular, conversa animada e consentimento de cookies.
(function () {
  var d = document;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- tela de carregamento ----------
  var loader = d.getElementById('loader');
  if (loader) {
    var start = Date.now();
    var min = loader.classList.contains('is-fast') || reduce ? 250 : 1100;
    var hide = function () {
      var wait = Math.max(0, min - (Date.now() - start));
      setTimeout(function () {
        loader.classList.add('is-done');
        d.documentElement.classList.add('is-ready');
        setTimeout(function () { loader.remove(); }, 600);
      }, wait);
    };
    if (d.readyState === 'complete') hide();
    else window.addEventListener('load', hide, { once: true });
    setTimeout(hide, 2600); // nunca prende a página
  } else {
    requestAnimationFrame(function () { d.documentElement.classList.add('is-ready'); });
  }

  // ---------- menu lateral (celular) ----------
  var toggle = d.querySelector('.nav__toggle');
  var drawer = d.getElementById('menu');
  if (toggle && drawer) {
    var lastFocus = null;
    var open = function () {
      lastFocus = d.activeElement;
      drawer.hidden = false;
      requestAnimationFrame(function () { drawer.classList.add('is-open'); });
      toggle.setAttribute('aria-expanded', 'true');
      d.body.classList.add('no-scroll');
      var first = drawer.querySelector('a, button');
      if (first) first.focus();
    };
    var close = function () {
      drawer.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      d.body.classList.remove('no-scroll');
      setTimeout(function () { drawer.hidden = true; }, reduce ? 0 : 250);
      if (lastFocus) lastFocus.focus();
    };
    toggle.addEventListener('click', open);
    drawer.addEventListener('click', function (e) { if (e.target.closest('[data-close-menu]')) close(); });
    d.addEventListener('keydown', function (e) {
      if (drawer.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        var items = drawer.querySelectorAll('a, button');
        var f = items[0], l = items[items.length - 1];
        if (e.shiftKey && d.activeElement === f) { e.preventDefault(); l.focus(); }
        else if (!e.shiftKey && d.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    });
    window.addEventListener('resize', function () { if (!drawer.hidden && window.innerWidth > 760) close(); });
  }

  // ---------- conversa do topo: toca uma vez quando aparece ----------
  var chat = d.querySelector('.chat');
  if (chat) {
    var play = function () { chat.classList.add('is-playing'); };
    if (!('IntersectionObserver' in window)) play();
    else {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { setTimeout(play, 400); io.disconnect(); }
      }, { threshold: 0.35 });
      io.observe(chat);
    }
  }


  // ---------- demonstrações dos passos: tocam em loop enquanto estão na tela ----------
  // Cada passo: [espera em ms, ação, seletor]. Ações: on, off, type (digita o texto), count (conta até data-count), end.
  var SCRIPTS = {
    plano: [[700, 'on', '.dplan[data-k="1"]'], [900, 'off', '.dplan[data-k="1"]'], [0, 'on', '.dplan[data-k="2"]'], [900, 'on', '.dbtn'], [2600, 'end']],
    onboarding: [[600, 'type', '[data-type]'], [450, 'on', '.dchip[data-k="2"]'], [380, 'on', '.dchip[data-k="3"]'], [380, 'on', '.dchip[data-k="4"]'], [350, 'on', '.dprogress'], [1000, 'on', '.dsent'], [2600, 'end']],
    aprovar: [[600, 'on', '.dmsg--in'], [700, 'on', '.dmsg--out'], [100, 'type', '.dmsg--out [data-type]'], [700, 'on', '.dbtn--ok'], [500, 'on', '.dstamp'], [2600, 'end']],
    noar: [[700, 'on', '.dswitch'], [150, 'on', '.dlive'], [400, 'on', '.dbars'], [0, 'count', '[data-count]'], [900, 'on', '.dlast'], [3000, 'end']],
  };
  var demos = d.querySelectorAll('.demo[data-demo]');
  if (demos.length && !reduce && 'IntersectionObserver' in window) {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    Array.prototype.forEach.call(demos, function (el, n) {
      var script = SCRIPTS[el.getAttribute('data-demo')];
      if (!script) return;
      var typed = Array.prototype.map.call(el.querySelectorAll('[data-type]'), function (t) { return [t, t.textContent]; });
      var counters = Array.prototype.map.call(el.querySelectorAll('[data-count]'), function (t) { return [t, Number(t.getAttribute('data-count')) || 0]; });
      var finals = Array.prototype.slice.call(el.querySelectorAll('.is-on'));
      var visible = false, running = false;
      var card = el.closest('.flow__card');
      var reset = function () {
        Array.prototype.forEach.call(el.querySelectorAll('.is-on'), function (x) { x.classList.remove('is-on'); });
        typed.forEach(function (t) { t[0].textContent = ''; });
        counters.forEach(function (c) { c[0].textContent = '0'; });
      };
      var finish = function () {
        reset();
        finals.forEach(function (x) { x.classList.add('is-on'); });
        typed.forEach(function (t) { t[0].textContent = t[1]; });
        counters.forEach(function (c) { c[0].textContent = String(c[1]); });
      };
      var type = function (sel) {
        var item = typed.filter(function (t) { return t[0].matches(sel); })[0];
        if (!item) return Promise.resolve();
        var i = 0, text = item[1];
        return new Promise(function (done) {
          (function step() {
            i++;
            item[0].textContent = text.slice(0, i);
            if (i >= text.length) return done();
            setTimeout(step, 28 + Math.random() * 45);
          })();
        });
      };
      var count = function (sel) {
        var item = counters.filter(function (c) { return c[0].matches(sel); })[0];
        if (!item) return Promise.resolve();
        var t0 = performance.now(), dur = 1100, to = item[1];
        return new Promise(function (done) {
          (function frame(now) {
            var k = Math.min(1, (now - t0) / dur);
            item[0].textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
            if (k < 1) requestAnimationFrame(frame); else done();
          })(t0);
        });
      };
      var run = async function () {
        if (running) return;
        running = true;
        el.classList.add('is-anim');
        await sleep(n * 350);
        while (visible) {
          reset();
          if (card) card.classList.add('is-active');
          for (var i = 0; i < script.length && visible; i++) {
            var st = script[i];
            await sleep(st[0]);
            var target = st[2] ? el.querySelector(st[2]) : null;
            if (st[1] === 'on' && target) target.classList.add('is-on');
            else if (st[1] === 'off' && target) target.classList.remove('is-on');
            else if (st[1] === 'type') await type(st[2]);
            else if (st[1] === 'count') await count(st[2]);
          }
          if (card) card.classList.remove('is-active');
        }
        finish();
        running = false;
      };
      new IntersectionObserver(function (entries) {
        visible = entries.some(function (e) { return e.isIntersecting; });
        if (visible) run();
      }, { threshold: 0.4 }).observe(el);
    });
  }

  // ---------- barra de compra no celular: aparece depois do topo e some perto dos planos ----------
  var bar = d.getElementById('mcta');
  if (bar && 'IntersectionObserver' in window) {
    var hero = d.querySelector('.hero, .page__head, .error');
    var plans = d.getElementById('planos');
    var footer = d.querySelector('.footer');
    var state = { past: false, near: false };
    var render = function () { bar.hidden = !(state.past && !state.near); };
    if (hero) new IntersectionObserver(function (e) { state.past = !e[0].isIntersecting; render(); }).observe(hero);
    var nearIo = new IntersectionObserver(function (entries) {
      state.near = entries.some(function (e) { return e.isIntersecting; }); render();
    }, { rootMargin: '0px 0px -20% 0px' });
    if (plans) nearIo.observe(plans);
    if (footer) nearIo.observe(footer);
  }

  // ---------- cookies: Google Analytics e Microsoft Clarity só depois do aceite ----------
  var cfgEl = d.getElementById('aux-config');
  if (!cfgEl) return;
  var ids = {};
  try { ids = JSON.parse(cfgEl.textContent); } catch (e) {}
  var KEY = 'aux_consent';
  var read = function () {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  };
  var write = function (analytics) {
    var v = { v: 1, analytics: !!analytics, at: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    d.cookie = 'aux_consent=' + (analytics ? '1' : '0') + '; Path=/; Max-Age=' + 60 * 60 * 24 * 365 + '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    return v;
  };
  var loaded = false;
  var loadAnalytics = function () {
    if (loaded) return;
    loaded = true;
    if (ids.ga) {
      var s = d.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ids.ga);
      d.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', ids.ga);
    }
    if (ids.clarity) {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, d, 'clarity', 'script', ids.clarity);
      window.clarity('consent');
    }
  };
  // Ao recusar depois de ter aceito: apaga os cookies de medição e recarrega sem eles
  var clearAnalytics = function () {
    var names = d.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); });
    var host = location.hostname, parts = host.split('.');
    var domains = ['', host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-3).join('.'), '.' + parts.slice(-2).join('.'));
    names.filter(function (n) { return /^(_ga|_gid|_gat|_clck|_clsk|CLID|ANONCHK|MR|MUID|SM)/.test(n); }).forEach(function (n) {
      domains.forEach(function (dm) { d.cookie = n + '=; Path=/; Max-Age=0' + (dm ? '; Domain=' + dm : ''); });
    });
  };

  var banner = d.getElementById('cookie-banner');
  var dialog = d.getElementById('cookie-dialog');
  var box = d.getElementById('ck-analytics');
  var current = read();
  if (current && current.analytics) loadAnalytics();
  else if (!current && banner) banner.hidden = false;

  var decide = function (analytics) {
    var was = read();
    write(analytics);
    if (banner) banner.hidden = true;
    if (analytics) loadAnalytics();
    else if (was && was.analytics) { clearAnalytics(); location.reload(); }
  };
  d.addEventListener('click', function (e) {
    var c = e.target.closest('[data-consent]');
    if (c) decide(c.getAttribute('data-consent') === 'accept');
    if (e.target.closest('[data-cookie-prefs]') && dialog) {
      var now = read();
      if (box) box.checked = !!(now && now.analytics);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    }
  });
  if (dialog) {
    dialog.addEventListener('close', function () {
      if (dialog.returnValue === 'save') decide(box && box.checked);
      else if (dialog.returnValue === 'reject') decide(false);
    });
  }
})();

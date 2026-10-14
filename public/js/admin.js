// Painel: confirmações, copiar, seleção em massa, avisos temporários, formulários sem recarregar e foto do cliente.
(function () {
  // ---------- avisos temporários (toasts) ----------
  var region = document.querySelector('[data-toasts]');
  function dismiss(el) {
    if (!el || el.dataset.leaving) return;
    el.dataset.leaving = '1';
    el.classList.add('is-leaving');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
  }
  function arm(el) {
    var bad = el.classList.contains('toast--bad');
    var timer = setTimeout(function () { dismiss(el); }, bad ? 9000 : 4500);
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', function () { timer = setTimeout(function () { dismiss(el); }, 2500); });
  }
  function toast(text, bad) {
    if (!region) return;
    var el = document.createElement('div');
    el.className = 'toast' + (bad ? ' toast--bad' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('data-toast', '');
    var p = document.createElement('p');
    p.textContent = text;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Fechar aviso');
    close.setAttribute('data-toast-close', '');
    close.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    el.appendChild(p);
    el.appendChild(close);
    region.appendChild(el);
    arm(el);
  }
  window.auxToast = toast;
  Array.prototype.forEach.call(document.querySelectorAll('[data-toast]'), arm);

  // O aviso veio pela URL (?ok=...): tira da barra de endereço para não aparecer de novo ao recarregar
  if (window.history && window.history.replaceState && /[?&]ok=/.test(location.search)) {
    var params = new URLSearchParams(location.search);
    params.delete('ok');
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  // ---------- cliques ----------
  document.addEventListener('click', function (e) {
    var closeBtn = e.target.closest('[data-toast-close]');
    if (closeBtn) { dismiss(closeBtn.closest('[data-toast]')); return; }

    if (e.target.closest('[data-print]')) { window.print(); return; }

    var btn = e.target.closest('[data-confirm]');
    if (btn && !window.confirm(btn.getAttribute('data-confirm'))) { e.preventDefault(); return; }

    var copy = e.target.closest('[data-copy], [data-copy-text]');
    if (copy) {
      var input = copy.hasAttribute('data-copy') ? document.querySelector(copy.getAttribute('data-copy')) : null;
      var text = input ? input.value : copy.getAttribute('data-copy-text');
      if (!text) return;
      var done = function () {
        if (copy.dataset.busy) return;
        copy.dataset.busy = '1';
        var old = copy.textContent;
        copy.textContent = 'Copiado';
        setTimeout(function () { copy.textContent = old; delete copy.dataset.busy; }, 1600);
      };
      var fallback = function () {
        var t = document.createElement('textarea');
        t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (err) {}
        document.body.removeChild(t);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    }
  });

  // ---------- formulários sem recarregar (data-ajax) ----------
  // O servidor responde {ok, message, html, replace} quando o pedido aceita JSON.
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-ajax]');
    if (!form || !window.fetch) return;
    e.preventDefault();
    if (form.dataset.busy) return;
    form.dataset.busy = '1';
    var submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(new FormData(form)).toString(),
      credentials: 'same-origin',
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Resposta inesperada do servidor.' }; }); })
      .then(function (data) {
        if (data.message) toast(data.message, !data.ok);
        if (!data.ok) return;
        if (data.prepend && data.html) {
          var list = document.querySelector(data.prepend);
          if (list) {
            var empty = list.querySelector('[data-empty]');
            if (empty) empty.parentNode.removeChild(empty);
            list.insertAdjacentHTML('afterbegin', data.html);
          }
        }
        if (data.replace && data.html) {
          var target = document.querySelector(data.replace);
          if (target) target.outerHTML = data.html;
        }
        if (form.hasAttribute('data-reset')) form.reset();
      })
      .catch(function () { toast('Não foi possível salvar. Confira a conexão e tente de novo.', true); })
      .then(function () {
        delete form.dataset.busy;
        if (submit) submit.disabled = false;
      });
  });

  // Troca de perfil do agente: salva na hora
  document.addEventListener('change', function (e) {
    var auto = e.target.closest('[data-autosubmit]');
    if (auto && auto.form) auto.form.requestSubmit ? auto.form.requestSubmit() : auto.form.submit();
  });

  // ---------- foto do cliente: reduz para 256 px no navegador e envia ----------
  document.addEventListener('change', function (e) {
    var input = e.target.closest('input[data-photo-upload]');
    if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0];
    if (!/^image\//.test(file.type)) { toast('Escolha um arquivo de imagem (JPG, PNG ou WebP).', true); input.value = ''; return; }
    if (file.size > 15 * 1024 * 1024) { toast('A imagem é grande demais (máximo 15 MB).', true); input.value = ''; return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var size = 256;
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      // Corta no centro, em quadrado
      var s = Math.min(img.naturalWidth, img.naturalHeight);
      var sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      var data = c.toDataURL('image/jpeg', 0.88);
      fetch(input.getAttribute('data-photo-upload'), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data }),
        credentials: 'same-origin',
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          toast(res.message || (res.ok ? 'Foto salva.' : 'Não foi possível salvar a foto.'), !res.ok);
          if (res.ok && res.src) {
            Array.prototype.forEach.call(document.querySelectorAll('[data-avatar]'), function (el) {
              el.innerHTML = '';
              var i = document.createElement('img');
              i.src = res.src; i.alt = ''; i.width = 256; i.height = 256;
              el.appendChild(i);
              el.classList.add('has-photo');
            });
            var rm = document.querySelector('[data-photo-remove]');
            if (rm) rm.hidden = false;
          }
        })
        .catch(function () { toast('Não foi possível enviar a foto.', true); })
        .then(function () { input.value = ''; });
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('Não deu para ler essa imagem. Tente outro arquivo.', true); input.value = ''; };
    img.src = url;
  });

  // ---------- seleção em massa ----------
  var all = document.querySelector('[data-check-all]');
  var counter = document.querySelector('[data-selected-count]');
  var boxes = function () { return Array.prototype.slice.call(document.querySelectorAll('input[name="ids"]')); };
  var update = function () {
    if (!counter) return;
    var n = boxes().filter(function (b) { return b.checked; }).length;
    counter.textContent = n === 0 ? 'Nenhum selecionado' : n === 1 ? '1 selecionado' : n + ' selecionados';
  };
  if (all) all.addEventListener('change', function () { boxes().forEach(function (b) { b.checked = all.checked; }); update(); });
  document.addEventListener('change', function (e) { if (e.target.name === 'ids') update(); });
  update();
})();

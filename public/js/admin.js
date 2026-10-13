// Painel: confirmação antes de apagar, copiar link e selecionar vários clientes.
(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-confirm]');
    if (btn && !window.confirm(btn.getAttribute('data-confirm'))) e.preventDefault();

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

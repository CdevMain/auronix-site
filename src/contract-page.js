// Página do contrato para o cliente: ler, aceitar e consultar o comprovante.
const { esc, page } = require('./html');
const C = require('./contract');

function fmt(d) {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(String(d).replace(' ', 'T') + (String(d).includes('T') ? '' : 'Z'));
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'medium' });
}

function proof(c) {
  return `<section class="proof" aria-labelledby="t-proof">
  <h2 id="t-proof">Comprovante de aceite eletrônico</h2>
  <dl>
    <div><dt>Aceito por</dt><dd>${esc(c.accepted_name)}</dd></div>
    <div><dt>CPF ou CNPJ</dt><dd>${esc(c.accepted_doc)}</dd></div>
    <div><dt>E-mail</dt><dd>${esc(c.accepted_email)}</dd></div>
    <div><dt>Data e hora</dt><dd>${esc(fmt(c.accepted_at))} (horário de Brasília)</dd></div>
    <div><dt>Endereço IP</dt><dd class="mono">${esc(c.accepted_ip)}</dd></div>
    <div><dt>Versão do contrato</dt><dd>${esc(c.version)}</dd></div>
    <div><dt>Código de verificação (SHA-256)</dt><dd class="mono">${esc(c.body_hash)}</dd></div>
  </dl>
</section>`;
}

function renderContractPage(c, { errors = [], values = {} } = {}) {
  const v = (k) => esc(values[k] || '');
  const accepted = c.status === 'aceito';
  const canceled = c.status === 'cancelado';
  const top = accepted
    ? `<div class="notice notice--ok" role="status"><strong>Contrato aceito em ${esc(fmt(c.accepted_at))}.</strong> O comprovante está no fim da página. Você pode imprimir ou salvar em PDF.</div>`
    : canceled
    ? '<div class="notice notice--solid" role="alert"><strong>Este contrato foi cancelado.</strong> Se precisar de um novo, fale com a gente.</div>'
    : '<p class="lede">Leia com calma. No fim da página, informe seus dados e confirme o aceite. Leva 2 minutos.</p>';

  const form = !accepted && !canceled
    ? `<section class="accept" aria-labelledby="t-accept">
  <h2 id="t-accept">Aceitar o contrato</h2>
  ${errors.length ? `<div class="notice notice--solid" role="alert" tabindex="-1" id="erros">${errors.map((e) => `<p>${esc(e)}</p>`).join('')}</div>` : ''}
  <form class="form form--compact" method="post">
    <div class="field"><label for="a-nome">Nome completo ou razão social</label><input type="text" id="a-nome" name="nome" value="${v('nome')}" autocomplete="name" required></div>
    <div class="two">
      <div class="field"><label for="a-doc">CPF ou CNPJ</label><input type="text" id="a-doc" name="documento" value="${v('documento')}" inputmode="numeric" autocomplete="off" required placeholder="Só números ou com pontos"></div>
      <div class="field"><label for="a-email">E-mail</label><input type="email" id="a-email" name="email" value="${v('email')}" autocomplete="email" required></div>
    </div>
    <label class="check check--plain"><input type="checkbox" name="aceite" value="sim" required${values.aceite === 'sim' ? ' checked' : ''}><span>Li e aceito o contrato acima, na versão ${esc(c.version)}.</span></label>
    <p class="hint">Ao aceitar, registramos seu nome, documento, e-mail, data, hora, IP e navegador como comprovante. Você recebe uma cópia por e-mail.</p>
    <div class="form__submit"><button class="btn btn--accent" type="submit">Aceitar contrato</button></div>
  </form>
</section>`
    : '';

  return page({
    title: `${C.TITLE} | Auronix`,
    bodyClass: 'contract-page',
    body: `${top}
<div class="page__actions no-print"><button class="btn btn--outline btn--small" type="button" onclick="window.print()">Imprimir ou salvar PDF</button></div>
<article class="contract">${c.body_html}</article>
${form}
${accepted ? proof(c) : ''}
${errors.length ? '<script>document.getElementById("erros").focus()</script>' : ''}`,
  });
}

module.exports = { renderContractPage };

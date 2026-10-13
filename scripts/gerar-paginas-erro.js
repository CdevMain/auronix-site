// Gera public/erros/<código>.html para o Nginx mostrar quando o Node estiver parado ou reiniciando.
// Uso: node scripts/gerar-paginas-erro.js   (rode de novo se mudar o visual do site)
const fs = require('node:fs');
const path = require('node:path');
process.env.DATA_DIR = process.env.DATA_DIR || require('node:os').tmpdir();
// Não conecta ao banco: só precisa do endereço para carregar os módulos
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://gerador@localhost/gerador';
const { errorPage } = require('../src/html');

const dir = path.join(__dirname, '..', 'public', 'erros');
fs.mkdirSync(dir, { recursive: true });
for (const code of [500, 502, 503, 504]) {
  fs.writeFileSync(path.join(dir, `${code}.html`), errorPage(code));
  console.log(`public/erros/${code}.html`);
}

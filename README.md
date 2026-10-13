# Auronix: site de vendas

Landing page com os 3 planos, webhook da Cakto, onboarding por link único, e-mails pelo Resend e um painel de gestão com login.
Node 22.9+ e Express, atrás do Nginx no VPS Wepwawet, em **auronix.cdev.com.br**. Os dados ficam no **Supabase** (projeto CDEV Site, esquema `auronix`) e o login do painel usa o **Supabase Auth**.

## Como funciona

1. O cliente escolhe um plano no site e paga no checkout da Cakto.
2. A Cakto chama `POST /webhooks/cakto`. O site confere a chave secreta, cria o cliente e envia pelo Resend o **link pessoal de onboarding**.
3. O cliente preenche o formulário. Ele recebe um e-mail de confirmação e o cliente passa para a etapa "Onboarding recebido".
4. Você recebe um aviso por e-mail e acompanha tudo no painel.
5. Reembolso, chargeback, cancelamento e pausa bloqueiam o link e mudam o status.

| Endereço | O que é |
|---|---|
| `/` | Landing page |
| `/contato` | Formulário de contato (as mensagens aparecem no painel) |
| `/privacidade`, `/termos` | Política de privacidade e termos de uso (preencha [RAZÃO SOCIAL] e [CNPJ]) |
| `/obrigado` | Página pós-compra, com reenvio do link |
| `/onboarding/<token>` | Formulário do cliente |
| `ADMIN_PATH` | Painel (endereço secreto, com login). `/admin` não existe |
| `/webhooks/cakto` | Webhook da Cakto |

## Banco de dados (Supabase)

- Projeto **CDEV Site**, esquema separado **`auronix`** (9 tabelas). Não mistura com as tabelas do CDEV Site.
- O esquema não fica exposto na API do Supabase: RLS ligado, sem políticas, e nada liberado para `anon`/`authenticated`. Só o servidor do site acessa, pela conexão Postgres.
- A estrutura está em `db/schema.sql`. O site roda esse arquivo ao iniciar (só cria o que falta). Para desligar: `DB_AUTO_MIGRATE=0`.
- Você vê e edita os dados no painel do Supabase: **Table Editor**, troque o esquema de `public` para `auronix`.
- Backup: o Supabase faz backup diário. Para guardar uma cópia sua: `pg_dump "$DATABASE_URL" -n auronix > auronix-backup.sql`.

**Conexão (`DATABASE_URL`):** o site usa um usuário de banco próprio, `auronix_app`, criado por `db/app-role.sql`. Ele só lê e grava no esquema `auronix` e não enxerga as tabelas do CDEV Site. A URI é a do **Session pooler** (porta 5432) com o usuário `auronix_app.qfjvfmfhlmyxlcilhbhn`. A linha pronta está no `local.env` do seu PC; copie a mesma para o `.env` da VPS. Para trocar a senha: Supabase › SQL Editor › `ALTER ROLE auronix_app PASSWORD 'nova-senha';` e atualize os dois arquivos.

**Login do painel:** e-mail e senha da sua conta no Supabase Auth do CDEV Site (`cdev.main@gmail.com`). Só entram os e-mails listados em `ADMIN_EMAILS`. Para trocar a senha, use o painel do Supabase (Authentication).

## Painel

- **Visão geral:** receita, custo e lucro por mês, margem, lucro por plano e uma lista do que precisa de atenção.
- **Clientes:** busca, filtros, exportar CSV, cadastrar cliente à mão, editar plano/status/etapa/pagamento/custo, notas e histórico, apagar um, vários ou todos os testes.
- **Pedidos:** tudo que a Cakto enviou, e a caixa "Confirmar se alguém comprou" (por e-mail ou número do pedido).
- **Mensagens:** o que chega pela página de contato.
- **E-mails:** registro de cada envio (enviado ou falhou, com o motivo) e envio de teste.
- **Configurações:** custo mensal de cada plano (Start R$ 97, Pro R$ 127, Business R$ 202) e "sair de todos os aparelhos".

Vendas do simulador, do botão de teste da Cakto e de e-mails `@example.com` entram como **teste**: não contam no lucro e saem todas no botão "Apagar todos os testes".

O endereço do painel vem de `ADMIN_PATH` no `.env`. Se ficar vazio, o site gera um, grava em `data/admin-path.txt` e mostra no log ao iniciar.

## 1. DNS

No DNS de `cdev.com.br`, crie um registro **A** `auronix` apontando para o IP do Wepwawet (o mesmo do `cdev.com.br`).

## 2. Instalar no VPS

```bash
# Node 22.13 ou mais novo (confira com: node -v)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

sudo mkdir -p /var/www/auronix && sudo chown $USER: /var/www/auronix
git clone git@github.com:CdevMain/auronix-site.git /var/www/auronix   # ou envie a pasta por scp
cd /var/www/auronix
npm ci --omit=dev

cp .env.example .env && nano .env      # chave do webhook, ADMIN_PATH, senha do painel e RESEND_API_KEY
mkdir -p data && sudo chown -R www-data: data   # guarda só o endereço do painel gerado automaticamente
sudo chmod 640 .env && sudo chown $USER:www-data .env

sudo cp deploy/auronix.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now auronix
curl http://127.0.0.1:3100/health      # {"ok":true}

sudo cp deploy/nginx-auronix.conf /etc/nginx/sites-available/auronix.cdev.com.br
sudo ln -s /etc/nginx/sites-available/auronix.cdev.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d auronix.cdev.com.br
```

As páginas `public/erros/50x.html` aparecem quando o Node está parado. Se mudar o visual, gere de novo com `node scripts/gerar-paginas-erro.js`.

Se o `node` não estiver em `/usr/bin/node` (confira com `which node`), ajuste o `ExecStart` no `auronix.service`.

Para atualizar depois: `bash deploy/atualizar.sh`.

## 3. Configurar a Cakto

1. **Planos:** crie o produto de assinatura com uma oferta para cada plano (Essencial, Pro, Empresa).
2. **Links de checkout:** em `plans.json`, troque `checkoutUrl` pelo link de cada oferta e preencha `price`, `features` etc. Depois rode `sudo systemctl restart auronix`.
3. **Página de obrigado:** em cada oferta, defina o redirecionamento pós-compra para `https://auronix.cdev.com.br/obrigado`.
4. **Webhook:** em *Integrações > Webhooks*, crie um webhook com:
   - URL: `https://auronix.cdev.com.br/webhooks/cakto`
   - Produtos: os três planos Auronix
   - Eventos: compra aprovada, reembolso, chargeback, assinatura cancelada, renovada, pausada, retomada, atrasada, recuperada, renovação recusada e reembolso solicitado
   - A Cakto gera uma **chave secreta** para o webhook. Copie para `CAKTO_WEBHOOK_SECRET` no `.env` e reinicie o serviço.

   | Evento | O que o site faz |
   |---|---|
   | `purchase_approved`, `subscription_renewed` | Ativa o cliente; na primeira compra, envia o link do onboarding |
   | `refund`, `chargeback`, `subscription_canceled`, `subscription_paused` | Bloqueia o onboarding e avisa você |
   | `subscription_late` | Marca como atrasado (o onboarding continua liberado) e avisa você |
   | `subscription_resumed`, `subscription_late_recovered` | Volta para ativo (só quem estava pausado ou atrasado) |
   | `subscription_renewal_refused`, `refund_requested` | Só avisa você |
   | Outros | Só registra |

   Não é preciso API key no site: o webhook já entrega tudo.
5. **Ligar oferta ao plano:** use o botão de teste da Cakto ou faça uma compra real. No painel, aba **Pedidos**, abra o evento e veja o `offer.id`. Cole em `caktoOfferIds` do plano certo, no `plans.json`. Até fazer isso, o site reconhece o plano pelo nome da oferta ou do produto (ex.: "Auronix Pro").

## 4. E-mail (Resend)

O domínio `auronix.cdev.com.br` já está verificado no Resend para envio.

1. Em resend.com/api-keys, crie uma chave com permissão **Sending access**.
2. No `.env`: `RESEND_API_KEY=re_...`, `MAIL_FROM="Auronix <contato@auronix.cdev.com.br>"`, `REPLY_TO=` seu Gmail e `ADMIN_NOTIFY_EMAIL=` seu Gmail.
3. No painel, aba **E-mails**, use **Enviar e-mail de teste**. Cada envio fica registrado ali, com o motivo se falhar.

O recebimento não está ligado em `auronix.cdev.com.br`, então respostas para `contato@auronix…` não chegam a lugar nenhum. Por isso as respostas vão para `REPLY_TO`. Para receber em `contato@`, ative o recebimento desse domínio no Resend (ele pede um registro MX).

Sem `RESEND_API_KEY` nem SMTP, nenhum e-mail sai: os links aparecem no log e na página do cliente, onde dá para copiar.

## Testar no seu PC

`local.env` tem a configuração de teste. A `DATABASE_URL` dele já aponta para o Supabase. O PC usa o mesmo banco do Supabase que o site no ar, então os testes aparecem lá marcados como teste.

```bash
npm install
npm run local            # http://localhost:3100 (reinicia sozinho ao salvar .js)
# em outro terminal:
node --env-file=local.env scripts/simular-webhook.js purchase_approved voce@exemplo.com pro
node --env-file=local.env scripts/simular-webhook.js refund voce@exemplo.com pro
```

Vendas do simulador entram como teste. Apague todas no painel com "Apagar todos os testes".

## Segurança

- O webhook só aceita chamadas com a chave secreta correta (comparação em tempo constante). Eventos repetidos são ignorados.
- A chave, CPF, cartão e endereço nunca são gravados no banco.
- O painel fica num endereço secreto, exige login com usuário e senha, bloqueia o IP por 15 minutos depois de 5 senhas erradas e recusa formulários enviados de outros sites. A sessão usa cookie HttpOnly, SameSite=Strict e Secure (em HTTPS), e o banco guarda só o hash dela.
- O link de onboarding é um token aleatório de 192 bits.
- O reenvio do link e o formulário de contato têm limite por IP; o contato tem um campo escondido contra robôs.
- Backup: além do backup diário do Supabase, `pg_dump "$DATABASE_URL" -n auronix > auronix-backup.sql` gera uma cópia sua.

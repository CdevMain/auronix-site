# Auronix: site de vendas

Landing page com os 3 planos, webhook da Cakto, onboarding por link único e painel admin.
Node 22 + Express + SQLite, atrás do Nginx no VPS Wepwawet, em **auronix.cdev.com.br**.

## Como funciona

1. O cliente escolhe um plano no site e paga no checkout da Cakto.
2. A Cakto chama `POST /webhooks/cakto`. O site confere a chave secreta, cria o cliente e envia por e-mail um **link pessoal de onboarding** (`/onboarding/<token>`).
3. O cliente preenche o formulário (empresa, número, produtos, FAQ, tom de voz, limites, integrações). Ele pode voltar no mesmo link para editar.
4. Você recebe um aviso por e-mail e vê tudo em `/admin`.
5. Se vier `refund`, `chargeback` ou `subscription_canceled`, o link deixa de funcionar e o status muda no painel. `subscription_renewed` mantém o cliente ativo.

| Endereço | O que é |
|---|---|
| `/` | Landing page |
| `/obrigado` | Página pós-compra, com reenvio do link por e-mail |
| `/onboarding/<token>` | Formulário do cliente |
| `/admin` | Painel (login HTTP Basic com `ADMIN_USER`/`ADMIN_PASS`) |
| `/webhooks/cakto` | Webhook da Cakto |
| `/health` | Verificação de saúde |

## 1. DNS

No DNS de `cdev.com.br`, crie um registro **A** `auronix` apontando para o IP do Wepwawet (o mesmo do `cdev.com.br`).

## 2. Instalar no VPS

```bash
# Node 22 (se ainda não tiver):  node -v
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

sudo mkdir -p /var/www/auronix && sudo chown $USER: /var/www/auronix
git clone git@github.com:CdevMain/auronix-site.git /var/www/auronix   # ou envie a pasta por scp
cd /var/www/auronix
npm ci --omit=dev

cp .env.example .env && nano .env      # preencha a chave do webhook, a senha do admin e o SMTP
mkdir -p data && sudo chown -R www-data: data
sudo chmod 640 .env && sudo chown $USER:www-data .env

sudo cp deploy/auronix.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now auronix
curl http://127.0.0.1:3100/health      # {"ok":true}

sudo cp deploy/nginx-auronix.conf /etc/nginx/sites-available/auronix.cdev.com.br
sudo ln -s /etc/nginx/sites-available/auronix.cdev.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d auronix.cdev.com.br
```

Se o `node` não estiver em `/usr/bin/node` (confira com `which node`), ajuste o `ExecStart` no `auronix.service`.

Para atualizar depois: `bash deploy/atualizar.sh`.

## 3. Configurar a Cakto

1. **Planos:** crie o produto de assinatura com uma oferta para cada plano (Essencial, Pro, Empresa).
2. **Links de checkout:** em `plans.json`, troque `checkoutUrl` pelo link de cada oferta e preencha `price`, `features` etc. Depois rode `sudo systemctl restart auronix`.
3. **Página de obrigado:** em cada oferta, defina o redirecionamento pós-compra para `https://auronix.cdev.com.br/obrigado`.
4. **Webhook:** em *Integrações > Webhooks*, crie um webhook com:
   - URL: `https://auronix.cdev.com.br/webhooks/cakto`
   - Chave secreta: o mesmo valor de `CAKTO_WEBHOOK_SECRET` do `.env`
   - Eventos: `purchase_approved`, `refund`, `chargeback`, `subscription_canceled`, `subscription_renewed` (os outros são aceitos e só registrados)
5. **Ligar oferta ao plano:** use o botão de teste da Cakto ou faça uma compra real. Em `/admin`, abra o cliente e copie o **ID da oferta**. Cole em `caktoOfferIds` do plano certo, no `plans.json`. Até fazer isso, o site tenta reconhecer o plano pelo nome da oferta (ex.: uma oferta chamada "Auronix Pro" vira o plano Pro).

## 4. E-mail

Sem SMTP, nenhum e-mail sai: os links aparecem no log (`journalctl -u auronix -f`) e na página do cliente em `/admin`, onde você pode copiá-los.

Com Gmail: ative a verificação em duas etapas e crie uma **senha de app** (Conta Google > Segurança > Senhas de app). Use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` = seu Gmail e `SMTP_PASS` = a senha de app. Para enviar como `contato@auronix…`, use um provedor com o domínio verificado (Brevo, Resend, Amazon SES, Zoho).

## Testar localmente

```bash
npm install
cp .env.example .env     # PUBLIC_URL=http://127.0.0.1:3100
npm run dev
# em outro terminal:
node --env-file=.env scripts/simular-webhook.js purchase_approved voce@exemplo.com
node --env-file=.env scripts/simular-webhook.js refund voce@exemplo.com
```

Para testar em produção, passe a URL como terceiro argumento:
`node --env-file=.env scripts/simular-webhook.js purchase_approved voce@exemplo.com https://auronix.cdev.com.br/webhooks/cakto`

## Segurança

- O webhook só aceita chamadas com a chave secreta correta (comparação em tempo constante). Eventos repetidos são ignorados.
- A chave nunca é gravada no banco. O payload de cada evento fica salvo em `webhook_events` para auditoria.
- O link de onboarding é um token aleatório de 192 bits. A página usa `Referrer-Policy: no-referrer` para o token não vazar.
- O reenvio do link responde sempre igual (não revela quem é cliente) e tem limite de 5 pedidos por IP a cada 15 minutos.
- O painel admin usa HTTP Basic sobre HTTPS e bloqueia POST vindo de outros sites.
- Backup: copie `data/auronix.db` (por exemplo, um cron diário com `sqlite3 data/auronix.db ".backup backup.db"`).

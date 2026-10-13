#!/usr/bin/env bash
# Atualiza o site no VPS:  bash /var/www/auronix/deploy/atualizar.sh
set -euo pipefail
# Usa o Node 22 próprio do site, se existir (o Node do sistema fica para os outros apps)
[ -x /opt/node22/bin/node ] && export PATH=/opt/node22/bin:$PATH
cd /var/www/auronix
git pull --ff-only
npm ci --omit=dev
sudo systemctl restart auronix
sleep 1
curl -fsS http://127.0.0.1:3100/health && echo " ok"

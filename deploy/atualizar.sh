#!/usr/bin/env bash
# Atualiza o site no VPS:  bash /var/www/auronix/deploy/atualizar.sh
set -euo pipefail
cd /var/www/auronix
git pull --ff-only
npm ci --omit=dev
sudo systemctl restart auronix
sleep 1
curl -fsS http://127.0.0.1:3100/health && echo " ok"

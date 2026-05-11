#!/bin/sh
# Deploy public/ to the router.
# Usage: ./deploy.sh [router-ip]
# Password read from .env (ROUTER_PASS=...) or ROUTER_PASS env var.

set -eu

if [ -f ./.env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi

ROUTER="${1:-192.168.42.1}"
STORE="/usr/local/share/mini-ui"

: "${ROUTER_PASS:?set ROUTER_PASS in .env or environment}"

# On NixOS sshpass is not in PATH — transparently re-run inside nix-shell.
if ! command -v sshpass > /dev/null 2>&1; then
  exec nix-shell -p sshpass --run \
    "ROUTER_PASS='${ROUTER_PASS}' sh '$(realpath "$0")' '${ROUTER}'"
fi

SSH="sshpass -p ${ROUTER_PASS} ssh -o StrictHostKeyChecking=no root@${ROUTER}"
SCP="sshpass -p ${ROUTER_PASS} scp -o StrictHostKeyChecking=no"

echo "==> Uploading public/ to ${ROUTER}:${STORE}"
$SSH "mkdir -p ${STORE}"
$SCP -r public/. "root@${ROUTER}:${STORE}/"

echo "==> Installing init script"
$SCP scripts/mini-ui.init "root@${ROUTER}:/etc/init.d/mini-ui"
$SSH "chmod +x /etc/init.d/mini-ui && /etc/init.d/mini-ui enable"

echo "==> Syncing to /www/mini"
$SSH "/etc/init.d/mini-ui start"

echo "==> Verifying"
RESULT=$(curl -sk "https://${ROUTER}/mini/" 2>/dev/null | head -c 100 || true)
if echo "$RESULT" | grep -q "RUTX11"; then
  echo "OK: https://${ROUTER}/mini/ is live"
else
  echo "Deployed. Open https://${ROUTER}/mini/ to verify."
fi

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ est requis." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ est requis. Version détectée: $(node -v)" >&2
  exit 1
fi

if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
fi

if grep -q '^JWT_SECRET=replace-with-' server/.env || grep -q '^JWT_SECRET=$' server/.env; then
  SECRET="$(node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))")"
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$SECRET#" server/.env
fi

npm --prefix server install
npm --prefix client install

if [ "${RESET_DEMO_DATA:-false}" = "true" ]; then
  rm -rf server/data server/storage
  echo "Données de démonstration réinitialisées."
fi
npm --prefix client run build

printf '\nInstallation et build terminés.\n'
printf 'Lancer en production locale : npm start\n'
printf 'Lancer en développement     : npm --prefix server run dev + npm --prefix client run dev\n'
printf 'Test API                    : http://localhost:4000/api/health\n'
printf 'Application                 : http://localhost:4000\n\n'

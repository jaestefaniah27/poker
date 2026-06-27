#!/bin/bash
set -e
cd ~/poker_repo

git fetch origin
git checkout dev
git pull origin dev

# Build server
cd server
npm install
npx tsc
PORT=3002 pm2 restart poker-staging 2>/dev/null || PORT=3002 pm2 start dist/index.js --name poker-staging --env production

# Build client con base /staging/ y socket path /staging-socket/socket.io
cd ../client
npm install
VITE_BASE=/staging/ VITE_SOCKET_PATH=/staging-socket/socket.io npm run build

# Copiar a /var/www/poker-staging/
sudo mkdir -p /var/www/poker-staging
sudo rm -rf /var/www/poker-staging/*
sudo cp -r dist/* /var/www/poker-staging/

echo "Staging desplegado en https://pokerpoke.duckdns.org/staging/"

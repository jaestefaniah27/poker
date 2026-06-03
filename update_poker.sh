#!/bin/bash
cd ~/poker_repo
git pull origin main
cd server
npm install
npx tsc
pm2 restart poker-server || pm2 start dist/index.js --name poker-server
cd ../client
npm install
npm run build
# Copiar build a la carpeta de nginx
sudo rm -rf /var/www/poker/*
sudo cp -r dist/* /var/www/poker/

#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/jxc}"
APP_NAME="${APP_NAME:-jxc}"

cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Please edit $APP_DIR/.env and set DATABASE_URL, then rerun this script."
  exit 1
fi

npm ci
npm run db:migrate
npm run db:seed || true
npm run build

if command -v pm2 >/dev/null 2>&1; then
  pm2 describe "$APP_NAME" >/dev/null 2>&1 && pm2 restart "$APP_NAME" || pm2 start npm --name "$APP_NAME" -- start
  pm2 save
else
  echo "PM2 is not installed. Install it with: npm install -g pm2"
  exit 1
fi

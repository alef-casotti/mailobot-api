#!/bin/bash
# Script de deploy para execução manual no servidor
# Uso: ./scripts/deploy.sh [branch]

set -e
BRANCH="${1:-main}"
APP_PATH="${DEPLOY_PATH:-$(pwd)}"

echo ">>> Deploying Mailobot from branch: $BRANCH"
cd "$APP_PATH"

echo ">>> Pulling latest changes..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo ">>> Installing dependencies..."
npm ci --omit=dev

echo ">>> Installing Playwright Chromium (if needed)..."
npx playwright install chromium 2>/dev/null || true

echo ">>> Running migrations..."
npm run migrate

echo ">>> Restarting PM2 processes..."
pm2 reload ecosystem.config.js --update-env
pm2 save

echo ">>> Deploy completed successfully!"
pm2 status

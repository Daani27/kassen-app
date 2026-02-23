#!/bin/bash
# Frontend deploy: Git pull, Build, Kopieren nach /var/www/html/kasse mit Rechten.
# Auf dem Server ausführen:
#   cd /var/www/kassen-app && bash scripts/deploy-frontend.sh
# Vorher: .env im Projektroot mit VITE_API_URL und VITE_VAPID_PUBLIC_KEY anlegen.

set -e
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
TARGET_DIR="${TARGET_DIR:-/var/www/html/kasse}"

cd "$PROJECT_DIR"
echo ">>> Git pull in $PROJECT_DIR"
git pull

echo ">>> npm install"
npm install

echo ">>> npm run build"
npm run build

echo ">>> Kopiere dist/ nach $TARGET_DIR (mit sudo)"
sudo mkdir -p "$TARGET_DIR"
sudo cp -r dist/* "$TARGET_DIR"
sudo chown -R www-data:www-data "$TARGET_DIR"

echo ">>> Fertig. Frontend ist unter $TARGET_DIR bereitgestellt."

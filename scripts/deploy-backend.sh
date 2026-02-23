#!/bin/bash
# Backend deploy: Git pull, npm install im server/, API-Service neu starten.
# Auf dem Server ausführen:
#   cd /var/www/kassen-app && bash scripts/deploy-backend.sh
# Vorher: server/.env mit DATABASE_URL, JWT_SECRET, VAPID-Keys usw. anlegen.
# Der systemd-Service heißt standardmäßig kasse-api (siehe docs/DEPLOY_SERVER.md).

set -e
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-kasse-api}"

cd "$PROJECT_DIR"
REPO_DIR=$(pwd)
# Bei Ausführung als root (z. B. auf dem Server) sonst "dubious ownership"
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true
# Lokale Änderungen verwerfen, damit pull nicht mit "would be overwritten" abbricht
git reset --hard HEAD
git pull
echo ">>> Git pull in $PROJECT_DIR – fertig"

echo ">>> npm install im server/"
cd server
npm install
cd ..

echo ">>> Starte API-Service neu: $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo ">>> Status $SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager || true

echo ">>> Fertig. Backend wurde aktualisiert und neu gestartet."

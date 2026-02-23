#!/bin/bash
#
# Kassen-App: Vollständige Server-Installation auf einem frischen Debian (12/13).
# Installiert: PostgreSQL, Node.js 20, Nginx, Certbot, legt DB an, baut App, konfiguriert Nginx + systemd.
#
# Aufruf (auf dem Server als root oder mit sudo):
#   sudo bash scripts/install-server.sh
#
# Optional vorher setzen (sonst fragt das Script):
#   export KASSE_DOMAIN=kasse.example.de
#   export KASSE_DB_PASSWORD=geheimes_db_passwort
#   export KASSE_JWT_SECRET=min-32-zeichen-jwt-secret-string
#   export KASSE_VAPID_PUBLIC=  (leer = wird erzeugt)
#   export KASSE_VAPID_PRIVATE=
#   export KASSE_VAPID_SUBJECT=mailto:admin@example.com
#   export KASSE_GIT_REPO=https://github.com/Daani27/kassen-app.git
#   export KASSE_INSTALL_HTTPS=1   (1 = Certbot für HTTPS ausführen)
#
set -e

# --- Konfiguration (kann per ENV überschrieben werden) ---
DOMAIN="${KASSE_DOMAIN:-}"
DB_PASSWORD="${KASSE_DB_PASSWORD:-}"
JWT_SECRET="${KASSE_JWT_SECRET:-}"
VAPID_PUBLIC="${KASSE_VAPID_PUBLIC:-}"
VAPID_PRIVATE="${KASSE_VAPID_PRIVATE:-}"
VAPID_SUBJECT="${KASSE_VAPID_SUBJECT:-mailto:admin@example.com}"
GIT_REPO="${KASSE_GIT_REPO:-https://github.com/Daani27/kassen-app.git}"
INSTALL_HTTPS="${KASSE_INSTALL_HTTPS:-0}"
PROJECT_DIR="${KASSE_PROJECT_DIR:-/var/www/kassen-app}"
NGINX_ROOT="${KASSE_NGINX_ROOT:-/var/www/html}"
SERVICE_NAME="kasse-api"
DB_USER="kasse_app"
DB_NAME="kasse_db"
API_PORT="3001"

# --- Prüfungen ---
if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root ausführen oder: sudo bash $0"
  exit 1
fi

if [ ! -f /etc/debian_version ]; then
  echo "Dieses Script ist für Debian (und Ubuntu) ausgelegt. /etc/debian_version nicht gefunden."
  exit 1
fi

echo "=== Kassen-App Server-Installation (Debian) ==="

# --- Abfragen, was fehlt ---
if [ -z "$DOMAIN" ]; then
  read -p "Domain für die Kassen-App (z. B. kasse.example.de): " DOMAIN
  [ -z "$DOMAIN" ] && { echo "Domain erforderlich."; exit 1; }
fi
if [ -z "$DB_PASSWORD" ]; then
  read -sp "PostgreSQL-Passwort für Benutzer $DB_USER: " DB_PASSWORD
  echo
  [ -z "$DB_PASSWORD" ] && { echo "DB-Passwort erforderlich."; exit 1; }
fi
if [ -z "$JWT_SECRET" ]; then
  read -sp "JWT-Secret (mind. 32 Zeichen): " JWT_SECRET
  echo
  [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ] && { echo "JWT-Secret mit mind. 32 Zeichen erforderlich."; exit 1; }
fi

# --- 1) System aktualisieren und Abhängigkeiten installieren ---
echo ""
echo ">>> System aktualisieren und Pakete installieren..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg postgresql postgresql-client nginx certbot python3-certbot-nginx

# Node.js 20 (NodeSource)
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo ">>> Node.js 20 installieren (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "    Node: $(node -v) – npm: $(npm -v)"

# --- 2) PostgreSQL: User, Datenbank, Schema, Rechte ---
echo ""
echo ">>> PostgreSQL einrichten..."
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -d "$DB_NAME" << EOF
GRANT USAGE ON SCHEMA public TO $DB_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_USER;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $DB_USER;
EOF
echo "    PostgreSQL bereit."

# --- 3) Projekt klonen (falls noch nicht vorhanden) ---
echo ""
if [ ! -d "$PROJECT_DIR" ]; then
  echo ">>> Projekt klonen nach $PROJECT_DIR..."
  mkdir -p "$(dirname "$PROJECT_DIR")"
  git clone "$GIT_REPO" "$PROJECT_DIR"
else
  echo ">>> Projektordner existiert bereits: $PROJECT_DIR"
  (cd "$PROJECT_DIR" && git pull -q 2>/dev/null || true)
fi

# Schema ausführen (Tabellen anlegen)
if [ -f "$PROJECT_DIR/server/schema.sql" ]; then
  echo "    Datenbank-Schema ausführen..."
  sudo -u postgres psql -d "$DB_NAME" -f "$PROJECT_DIR/server/schema.sql" || true
  sudo -u postgres psql -d "$DB_NAME" << EOF
GRANT USAGE ON SCHEMA public TO $DB_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_USER;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $DB_USER;
EOF
fi

# --- 4) VAPID-Keys erzeugen (wenn nicht gesetzt) ---
if [ -z "$VAPID_PUBLIC" ] || [ -z "$VAPID_PRIVATE" ]; then
  echo ">>> VAPID-Keys für Web-Push erzeugen..."
  VAPID_OUTPUT=$(cd "$PROJECT_DIR" && npx --yes web-push generate-vapid-keys 2>/dev/null)
  VAPID_PUBLIC=$(echo "$VAPID_OUTPUT" | grep "Public Key" | sed 's/.*: //')
  VAPID_PRIVATE=$(echo "$VAPID_OUTPUT" | grep "Private Key" | sed 's/.*: //')
  [ -z "$VAPID_PUBLIC" ] && { echo "VAPID-Erzeugung fehlgeschlagen."; exit 1; }
  echo "    VAPID-Keys erzeugt."
fi
# web-push erwartet URL-safe Base64 ohne "="-Padding
VAPID_PUBLIC=$(echo "$VAPID_PUBLIC" | tr -d '=\n\r\t ')
VAPID_PRIVATE=$(echo "$VAPID_PRIVATE" | tr -d '=\n\r\t ')

# --- 5) Backend: server/.env und npm install ---
echo ""
echo ">>> Backend einrichten..."
SERVER_ENV="$PROJECT_DIR/server/.env"
cat > "$SERVER_ENV" << ENV
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_SUBJECT=${VAPID_SUBJECT}
PORT=${API_PORT}
NODE_ENV=production
ENV
chmod 640 "$SERVER_ENV"
chown root:www-data "$SERVER_ENV"

(cd "$PROJECT_DIR/server" && npm install --production)
echo "    Backend-Abhängigkeiten installiert."

# --- 6) systemd-Service ---
NODE_PATH=$(which node)
cat > /etc/systemd/system/${SERVICE_NAME}.service << UNIT
[Unit]
Description=Kassen App API (Node)
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=$PROJECT_DIR/server
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_DIR/server/.env
ExecStart=$NODE_PATH index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
chown -R www-data:www-data "$PROJECT_DIR"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"
echo "    Service $SERVICE_NAME aktiviert und gestartet."

echo "    Prüfe, ob Backend antwortet..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/api/branding" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "401" ]; then
  echo ""
  echo "*** Backend antwortet nicht (HTTP $HTTP_CODE). Logs:***"
  journalctl -u "$SERVICE_NAME" -n 40 --no-pager
  echo ""
  echo "Hinweis: Prüfe server/.env (DATABASE_URL, JWT_SECRET). Sonderzeichen in Passwörtern können Probleme machen."
  exit 1
fi
echo "    Backend OK (HTTP $HTTP_CODE)."

# --- 7) Frontend: Root-.env, Build, Kopieren ---
echo ""
echo ">>> Frontend bauen..."
# Gleiche Domain → leeres VITE_API_URL (relative Pfade)
ROOT_ENV="$PROJECT_DIR/.env"
cat > "$ROOT_ENV" << ROOT
VITE_API_URL=
VITE_VAPID_PUBLIC_KEY=$VAPID_PUBLIC
ROOT
chown www-data:www-data "$ROOT_ENV"

(cd "$PROJECT_DIR" && npm install)
(cd "$PROJECT_DIR" && npm run build)
mkdir -p "$NGINX_ROOT"
cp -r "$PROJECT_DIR/dist"/* "$NGINX_ROOT/"
chown -R www-data:www-data "$NGINX_ROOT"
echo "    Frontend gebaut und nach $NGINX_ROOT kopiert."

# --- 8) Nginx-Konfiguration ---
echo ""
echo ">>> Nginx konfigurieren..."
NGINX_SITE="/etc/nginx/sites-available/kasse"
cat > "$NGINX_SITE" << NGX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $NGINX_ROOT;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files \$uri =404;
    }
    location = /index.html {
        add_header Cache-Control "no-cache, max-age=0";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGX
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/kasse
nginx -t && systemctl reload nginx
echo "    Nginx-Site kasse aktiviert."

# --- 9) Optional: HTTPS mit Certbot ---
if [ "$INSTALL_HTTPS" = "1" ]; then
  echo ""
  echo ">>> HTTPS mit Let's Encrypt einrichten..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || true
fi

# --- Ende ---
echo ""
echo "=== Installation abgeschlossen ==="
echo "  App-URL:  http://$DOMAIN"
[ "$INSTALL_HTTPS" = "1" ] && echo "  (HTTPS wurde eingerichtet: https://$DOMAIN)"
echo "  Backend:  systemctl status $SERVICE_NAME"
echo "  Logs:     journalctl -u $SERVICE_NAME -f"
echo ""
echo "Nächste Schritte:"
echo "  1. In der App registrieren (erster Nutzer wird angelegt)."
echo "  2. In der Datenbank den ersten Nutzer zum Admin machen (siehe docs/DEPLOY_SERVER.md)."
echo "  3. Optional: HTTPS mit 'sudo certbot --nginx -d $DOMAIN' nachrüsten."
echo ""

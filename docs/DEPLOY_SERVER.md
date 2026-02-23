# Anleitung: Kassen App auf eigenem Server deployen

Diese Anleitung beschreibt das Deployment von **Frontend (PWA)** und **Backend (Node/Express + PostgreSQL)** der **Kassen App** auf einem eigenen Server (z. B. VPS mit Ubuntu/Debian, Nginx).

**Repository:** [https://github.com/Daani27/kassen-app](https://github.com/Daani27/kassen-app)  
**Projektordner:** In den Beispielen wird durchgehend `/var/www/kassen-app` verwendet. Du kannst stattdessen jeden anderen Pfad oder Klon-Namen nutzen (z. B. `feuerwehr-kasse-eigene-sb`); die Befehle dann entsprechend anpassen.

---

## Voraussetzungen

- Server mit **SSH-Zugang**
- **Node.js** (z. B. v18 oder v20) und **npm**
- **PostgreSQL** (z. B. 14 oder 15)
- **Nginx** (als Reverse Proxy und für statische Dateien)
- Optional: **Certbot** für HTTPS (Let’s Encrypt)
- Eine **Domain** (z. B. `kasse.example.de`), die auf die Server-IP zeigt

---

## Übersicht

| Komponente      | Aufgabe |
|-----------------|--------|
| **PostgreSQL** | Datenbank (Nutzer, Transaktionen, Mahlzeiten, Branding, Push-Abonnements) |
| **Backend**    | Node-API auf Port 3001 (Auth, CRUD, Push-Versand) |
| **Frontend**   | Gebauter Ordner `dist/` – wird von Nginx ausgeliefert |
| **Nginx**      | Liefert die PWA aus, leitet `/api` an das Backend weiter, optional SSL |

---

## 1. PostgreSQL einrichten

### 1.1 Datenbank und Benutzer anlegen

```bash
sudo -u postgres psql
```

In der `psql`-Konsole:

```sql
CREATE USER kasse_app WITH PASSWORD 'dein_sicheres_passwort';
CREATE DATABASE kasse_db OWNER kasse_app;
\q
```

### 1.2 Schema ausführen

Entweder die Datei vom Rechner auf den Server kopieren (z. B. per `scp`) oder den Inhalt von `server/schema.sql` auf dem Server anlegen und ausführen:

```bash
# Auf dem Server (Pfad = dein Projektordner)
psql -U kasse_app -d kasse_db -f /var/www/kassen-app/server/schema.sql
```

Falls `psql` nur als `postgres` läuft:

```bash
sudo -u postgres psql -d kasse_db -f /var/www/kassen-app/server/schema.sql
```

### 1.3 Rechte für den App-User (kasse_app)

Die Tabellen werden oft als User `postgres` angelegt. Damit die API mit `kasse_app` (oder dem User aus `DATABASE_URL`) lesen und schreiben kann, Rechte setzen:

```bash
sudo -u postgres psql -d kasse_db << 'EOF'
GRANT USAGE ON SCHEMA public TO kasse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kasse_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kasse_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kasse_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kasse_app;
EOF
```

Falls du einen anderen DB-User nutzt, `kasse_app` in den Befehlen durch diesen ersetzen.

---

## 2. Backend (Node-API) einrichten

### 2.1 Dateien auf den Server bringen

Projekt per Git klonen oder per `rsync`/`scp` hochladen, z. B.:

```bash
# Auf deinem Rechner (Projektordner-Name anpassen, falls anders)
rsync -avz --exclude node_modules --exclude dist ./kassen-app user@dein-server:/var/www/
```

Oder auf dem Server:

```bash
cd /var/www
git clone https://github.com/Daani27/kassen-app.git kassen-app
cd kassen-app
```

### 2.2 Abhängigkeiten und Umgebung

```bash
cd /var/www/kassen-app/server
cp .env.example .env
nano .env   # oder vim/vi
```

**.env** mindestens so ausfüllen:

```env
DATABASE_URL=postgresql://kasse_app:dein_sicheres_passwort@localhost:5432/kasse_db
JWT_SECRET=mindestens-32-zeichen-zufaelliger-string-fuer-jwt
VAPID_PUBLIC_KEY=dein_öffentlicher_vapid_key
VAPID_PRIVATE_KEY=dein_privater_vapid_key
VAPID_SUBJECT=mailto:admin@example.com
PORT=3001
```

**VAPID-Keys** erzeugen (einmalig, z. B. auf deinem Rechner):

```bash
npx web-push generate-vapid-keys
```

Beide Keys in `.env` eintragen; den **öffentlichen** Key brauchst du zusätzlich beim Frontend-Build (siehe Schritt 4).

### 2.3 Backend starten (Test)

```bash
cd /var/www/kassen-app/server
npm install
npm start
```

Wenn „Kassen App API läuft auf Port 3001“ erscheint und keine Fehler kommen, Backend mit `Ctrl+C` beenden und im nächsten Schritt dauerhaft starten.

---

## 3. Backend dauerhaft betreiben (systemd)

Damit die API nach Neustart und bei Abstürzen automatisch läuft:

### 3.1 systemd-Service anlegen

```bash
sudo nano /etc/systemd/system/kasse-api.service
```

Inhalt (Pfade anpassen):

```ini
[Unit]
Description=Kassen App API (Node)
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/kassen-app/server
Environment=NODE_ENV=production
EnvironmentFile=/var/www/kassen-app/server/.env
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Hinweis:** Pfade an deinen Projektordner anpassen (z. B. `/var/www/kassen-app`). Wenn `node` woanders liegt, Pfad mit `which node` ermitteln. `User` kann z. B. `www-data` oder ein eigener User sein; dann muss dieser User die Rechte auf den Ordner `server/` und auf `.env` haben.

### 3.2 Service aktivieren und starten

```bash
sudo systemctl daemon-reload
sudo systemctl enable kasse-api
sudo systemctl start kasse-api
sudo systemctl status kasse-api
```

Logs ansehen: `sudo journalctl -u kasse-api -f`

---

## 4. Frontend bauen

Das Frontend muss mit der **Produktions-URL der API** gebaut werden (weil `VITE_API_URL` beim Build eingebaut wird).

### 4.1 Auf dem Server (oder auf deinem Rechner)

**Auf dem Server:**

```bash
cd /var/www/kassen-app
npm install
```

**.env** im **Projektroot** (nicht in `server/`) anlegen oder anpassen:

```env
VITE_API_URL=https://kasse.example.de
VITE_VAPID_PUBLIC_KEY=derselbe_öffentliche_vapid_key_wie_im_backend
```

- Statt `https://kasse.example.de` deine echte Domain eintragen (ohne abschließenden Slash).
- **Wenn Frontend und API auf derselben Domain laufen** (Nginx leitet `/api` an das Backend weiter): `VITE_API_URL` kann **leer** gelassen werden; die App nutzt dann relative Pfade (`/api/...`) und alles geht an dieselbe Domain.
- Wenn die API woanders liegt (z. B. `https://api.example.de`), hier die komplette API-URL angeben.

### 4.2 Build ausführen

```bash
npm run build
```

Es entsteht der Ordner **`dist/`** mit `index.html`, `assets/`, `sw.js` usw.

---

## 5. Statische Dateien für Nginx bereitstellen

Build-Ausgabe dorthin kopieren, von wo Nginx sie ausliefern soll (z. B. `/var/www/html/kasse` oder direkt `/var/www/html`):

```bash
sudo mkdir -p /var/www/html/kasse
sudo cp -r /var/www/kassen-app/dist/* /var/www/html/kasse/
sudo chown -R www-data:www-data /var/www/html/kasse
```

Wenn die Kassen App im **Document Root** laufen soll (z. B. nur `https://kasse.example.de` ohne Unterordner):

```bash
sudo cp -r /var/www/kassen-app/dist/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html
```

---

## 6. Nginx konfigurieren

Nginx soll:

1. Die **PWA (statische Dateien)** ausliefern,
2. Anfragen an **`/api`** an das Backend (localhost:3001) weiterleiten,
3. Für **PWA-Updates**: `sw.js` und `index.html` nicht cachen.

### 6.1 Konfiguration für Domain im Document Root

Datei anlegen/zum Bearbeiten öffnen:

```bash
sudo nano /etc/nginx/sites-available/kasse
```

Beispiel **ohne** SSL (Port 80; SSL in 6.3):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name kasse.example.de;

    root /var/www/html;
    index index.html;

    # API an Backend weiterleiten
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # PWA: Service Worker und index.html nicht cachen (Auto-Update)
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files $uri =404;
    }
    location = /index.html {
        add_header Cache-Control "no-cache, max-age=0";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Wenn die Kassen App in einem **Unterordner** liegt (z. B. `/var/www/html/kasse`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name kasse.example.de;

    root /var/www/html;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /kasse {
        alias /var/www/html/kasse;
        try_files $uri $uri/ /kasse/index.html;
    }
    location = /kasse/sw.js {
        alias /var/www/html/kasse/sw.js;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
    location = /kasse/index.html {
        alias /var/www/html/kasse/index.html;
        add_header Cache-Control "no-cache, max-age=0";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
}
```

**Wichtig:** Wenn du die Kassen App unter `/kasse` betreibst, muss **`VITE_API_URL`** beim Build die **gleiche Domain** verwenden; die API liegt trotzdem unter `https://kasse.example.de/api` (nicht unter `/kasse/api`), weil Nginx `/api` global an das Backend weiterleitet. Bei anderem Setup (z. B. API unter `https://api.example.de`) `VITE_API_URL=https://api.example.de` setzen und in Nginx nur die PWA ausliefern.

### 6.2 Konfiguration aktivieren

```bash
sudo ln -s /etc/nginx/sites-available/kasse /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.3 HTTPS mit Let’s Encrypt (Certbot)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d kasse.example.de
```

Certbot passt die Nginx-Konfiguration an und richtet SSL ein. Automatische Verlängerung ist standardmäßig aktiv.

---

## 7. Kurz-Checkliste

- [ ] PostgreSQL: DB + User angelegt, **schema.sql** ausgeführt  
- [ ] **server/.env**: `DATABASE_URL`, `JWT_SECRET`, `VAPID_*`, `PORT=3001`  
- [ ] Backend: `npm install`, `npm start` getestet, **systemd**-Service läuft  
- [ ] **Root-.env**: `VITE_API_URL` und `VITE_VAPID_PUBLIC_KEY` (für Build)  
- [ ] Frontend: `npm run build`, **dist/** nach `/var/www/html/...` kopiert  
- [ ] Nginx: Site aktiv, **/api/** → Backend, **sw.js** / **index.html** ohne Cache  
- [ ] Optional: Certbot für HTTPS  
- [ ] Ersten Admin-Account anlegen (Registrierung in der Kassen App), danach ggf. Branding unter Admin anpassen  

---

## 7.1 Fehler: 502 Bad Gateway

**Ursache:** Nginx leitet Anfragen (z. B. `/api/...`) an das Backend weiter, aber das Backend antwortet nicht.

**Prüfen (auf dem Server):**

1. **Backend läuft?**
   ```bash
   sudo systemctl status kasse-api
   ```
   Wenn „inactive“ oder „failed“: Service starten und Logs ansehen:
   ```bash
   sudo systemctl start kasse-api
   sudo journalctl -u kasse-api -n 50 --no-pager
   ```

2. **Backend hört auf Port 3001?**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/branding
   # Erwartung: 200 oder 401 (nicht „Connection refused“). Alternativ:
   ss -tlnp | grep 3001
   ```
   Wenn nichts auf 3001 hört: Backend-Start prüfen (`.env`, `DATABASE_URL`, `JWT_SECRET` in Produktion gesetzt).

3. **Nginx-Konfiguration:** `proxy_pass` muss auf dasselbe Backend zeigen:
   ```nginx
   location /api/ {
       proxy_pass http://127.0.0.1:3001/api/;
       ...
   }
   ```
   Danach: `sudo nginx -t` und `sudo systemctl reload nginx`.

4. **Rechte:** Der User des systemd-Services (z. B. `www-data`) braucht Lese-/Ausführungsrechte auf `/var/www/kassen-app/server` und Leserecht auf `server/.env`.

---

## 8. Updates deployen

1. **Code aktualisieren** (z. B. `git pull` im Projektordner).
2. **Backend:**  
   ```bash
   cd /var/www/kassen-app/server
   npm install
   sudo systemctl restart kasse-api
   ```
3. **Frontend:**  
   - Sicherstellen, dass **.env** im Root z. B. weiterhin `VITE_API_URL=https://kasse.example.de` (oder leer für gleiche Domain) enthält.  
   - `npm run build`  
   - `dist/*` wieder nach `/var/www/html/` (oder `/var/www/html/kasse/`) kopieren, z. B.:  
     ```bash
     sudo cp -r /var/www/kassen-app/dist/* /var/www/html/
     sudo chown -R www-data:www-data /var/www/html
     ```
4. **Datenbank:** Nur bei neuen Migrationen (neue Tabellen/Spalten) die entsprechenden SQL-Skripte ausführen (z. B. aus `server/schema.sql` oder separaten Migrationsdateien).

---

**Hinweis:** Alle Pfade mit `/var/www/kassen-app` an deinen tatsächlichen Projektordner anpassen (z. B. wenn du das Repo unter einem anderen Namen geklont hast).

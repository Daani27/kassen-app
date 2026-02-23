# Kassen App

PWA für Kassenführung, Mahlzeiten, Frühstücksbestellung und Push-Benachrichtigungen (z. B. Verein, Feuerwehr).  
**Generisch nutzbar:** App-Name und Branding (Untertitel, Bug-Report-Link, Push-Titel) können von Admins unter **Einstellungen → Admin → App-Name & Branding** angepasst werden.

- **Frontend:** React, Vite, PWA (Workbox)
- **Backend:** eigener Node/Express-Server mit PostgreSQL (siehe `server/`)

---

## Schnellstart (lokal)

**Backend (eigene Datenbank):**

```bash
cd server
cp .env.example .env   # DATABASE_URL, JWT_SECRET, VAPID_* eintragen
psql -U user -d deine_db -f schema.sql
npm install && npm start
```

**Frontend:**

```bash
# im Projektroot
npm install
# .env: VITE_API_URL=http://localhost:3001, VITE_VAPID_PUBLIC_KEY=…
npm run dev
```

App läuft z. B. unter http://localhost:5173. Der Tab-/PWA-Name ist standardmäßig „Kasse“ und kann vom Admin geändert werden.

---

## Branding (vom Admin anpassbar)

Nach dem ersten Login als Admin: **Einstellungen → Admin** → Karte **„App-Name & Branding“**.

- **App-Name:** z. B. „Kasse WA I“ – erscheint auf dem Login-Bildschirm, im Footer und als Seitentitel.
- **Untertitel:** z. B. „Wachabteilung I • Lippstadt“ – unter dem App-Namen auf dem Login.
- **Link „Bug melden“:** optional, URL für den Footer-Link (leer = Link wird ausgeblendet).
- **Standard-Titel für Push:** Fallback-Titel für Benachrichtigungen, wenn beim Senden kein Titel angegeben wird.

---

## Build & Deploy

```bash
npm run build
```

Ausgabe in `dist/`. Backend getrennt deployen (z. B. `server/` auf Node-Host, PostgreSQL bereitstellen).  
PWA- und Nginx-Beispiele: siehe `docs/` und ggf. `nginx-default-server.conf`.

---

## Produktionsreif / GitHub

- **`.env` nie committen** – steht in `.gitignore`. Nach dem Klonen `.env` aus `.env.example` (Root) und `server/.env.example` (Backend) anlegen und mit echten Werten füllen.
- **Produktion (Backend):** `NODE_ENV=production` setzen und **`JWT_SECRET`** in `server/.env` setzen (mind. 32 Zeichen). Ohne gesetztes `JWT_SECRET` startet die API in Produktion nicht.
- **Secrets:** Datenbank-URL, JWT-Secret und VAPID-Keys nur in `.env` (lokal/Server), nie ins Repo.
- **CORS:** Das Backend akzeptiert standardmäßig alle Origins (`origin: true`). Für striktere Produktion kann ein Reverse Proxy (Nginx) vor dem Backend stehen; dann kommt nur deine Domain.

---

## Dokumentation

| Datei | Inhalt |
|-------|--------|
| **docs/DEPLOY_SERVER.md** | **Deployment auf eigenem Server** (PostgreSQL, Backend, Nginx, systemd, HTTPS) |
| **server/README.md** | Backend-Setup, Schema, Push (VAPID) |
| **docs/ANLEITUNG_USER.md** | Anleitung für Nutzer |
| **docs/ANLEITUNG_ADMIN.md** | Anleitung für Admins (inkl. Branding) |
| **docs/PUSH_SETUP.md** | Web-Push einrichten |
| **CHANGELOG.md** | Versionsliste |

---

## Unterstützung

Wenn dir die App nützt, freue ich mich über einen Kaffee: **[ko-fi.com/daani27](https://ko-fi.com/daani27)**

---

*Kassen App • PWA für Kasse, Mahlzeiten und Push – Branding vom Admin anpassbar*

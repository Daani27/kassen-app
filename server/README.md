# Kassen App – Backend (eigene Datenbank)

Express-API mit PostgreSQL. Auth per JWT, Web-Push über `web-push`.

## Setup

1. **PostgreSQL**: Datenbank anlegen und Schema ausführen:
   ```bash
   psql -U user -d feuerwehr_kasse -f schema.sql
   ```

2. **Umgebung**: `cp .env.example .env` und Werte setzen (insbesondere `DATABASE_URL`, `JWT_SECRET`, `VAPID_*`). **Produktion:** `NODE_ENV=production` setzen und `JWT_SECRET` mit mind. 32 Zeichen – sonst startet die API nicht.

3. **Abhängigkeiten**: `npm install`

4. **Start**: `npm start` (Produktion) oder `npm run dev` (mit Watch)

## Push-Benachrichtigungen

- VAPID-Keys erzeugen: `npx web-push generate-vapid-keys`
- `VAPID_PUBLIC_KEY` auch im Frontend als `VITE_VAPID_PUBLIC_KEY` setzen (gleiches Key-Paar).
- Unter iOS: App vom Home-Bildschirm öffnen; `VAPID_SUBJECT` mit gültiger E-Mail (z. B. `mailto:admin@example.com`) setzen.

## Frontend

Im Frontend `.env` die API-URL setzen:
`VITE_API_URL=http://localhost:3001` (oder die URL deines gehosteten Servers).

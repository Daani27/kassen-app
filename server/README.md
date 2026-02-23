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

## Import aus Supabase

Alle Tabellen und Logins aus einem Supabase-Projekt in die eigene Datenbank übernehmen:

1. **Schema** der Zieldatenbank ist angelegt (`psql … -f schema.sql`).
2. In **Supabase**: Project Settings → Database → **Connection string** (URI) kopieren – z. B. „Session mode“ oder „Direct“.
3. In **server/.env** eintragen:
   - `DATABASE_URL` = deine Zieldatenbank (eigene PostgreSQL-URL)
   - `SUPABASE_DATABASE_URL` = die kopierte Supabase-Postgres-URL (mit Passwort)
4. Ausführen:
   ```bash
   cd server && node scripts/import-from-supabase.js
   ```

Es werden importiert: **auth.users** → **public.users** (E-Mail/Passwort-Hashes) und alle **public**-Tabellen (profiles, push_subscriptions, transactions, meals, …) in der richtigen Reihenfolge. Supabase-Profile mit Spalte `full_name` werden als `username` übernommen.

## Frontend

Im Frontend `.env` die API-URL setzen:
`VITE_API_URL=http://localhost:3001` (oder die URL deines gehosteten Servers).

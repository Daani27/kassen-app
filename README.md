# WA I Kasse

PWA für Kassenführung, Mahlzeiten, Frühstücksbestellung und Push-Benachrichtigungen (z. B. Feuerwehr / Verein).  
React, Vite, Supabase (Auth, DB, Edge Functions).

**Dieses Repository ist für den privaten Gebrauch.** Keine echten Zugangsdaten oder Keys committen (siehe unten).

---

## Schnellstart (lokal)

```bash
git clone https://github.com/DEIN-USER/feuerwehr-kasse.git
cd feuerwehr-kasse
npm install
```

**Umgebungsvariablen:** Kopie von `.env.example` anlegen und mit echten Werten füllen:

```bash
cp .env.example .env
```

In `.env` eintragen:

- `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` aus dem [Supabase-Dashboard](https://supabase.com/dashboard) (Project Settings → API)
- `VITE_VAPID_PUBLIC_KEY` – öffentlicher VAPID-Key für Web-Push (z. B. mit `npx web-push generate-vapid-keys` erzeugen)

Danach:

```bash
npm run dev
```

App läuft lokal (z. B. http://localhost:5173).

---

## Build & Deploy

```bash
npm run build
```

Ausgabe in `dist/`. Den Ordner auf deinen Webserver (z. B. Nginx) deployen.  
PWA- und Nginx-Beispiele: siehe `docs/` und `nginx-default-server.conf`.

Supabase:

- Datenbank: Migrationen unter `supabase/migrations/` im Dashboard ausführen oder mit Supabase CLI anwenden.
- Edge Function **send-push** (Web-Push): `npx supabase functions deploy send-push`.  
  Secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ggf. VAPID_SUBJECT) im Dashboard unter Project Settings → Edge Functions → Secrets setzen.  
  Ausführlich: **docs/PUSH_SETUP.md**.

---

## Dokumentation (im Repo)

| Datei | Inhalt |
|-------|--------|
| **docs/ANLEITUNG_USER.md** | Anleitung für normale Nutzer |
| **docs/ANLEITUNG_ADMIN.md** | Anleitung für Admins |
| **docs/PUSH_SETUP.md** | Web-Push einrichten (VAPID, Edge Function) |
| **CHANGELOG.md** | Versionsliste und Änderungen |

---

## Wichtig für GitHub (privates Repo)

- **`.env`** enthält Zugangsdaten und wird von Git **ignoriert** (steht in `.gitignore`).  
  Nach dem Klonen immer eine eigene `.env` aus `.env.example` anlegen und mit echten Werten füllen.
- **Supabase-Secrets** (VAPID_PRIVATE_KEY etc.) nur im Supabase-Dashboard setzen, **nie** in eine Datei im Repo schreiben.
- Keine Ordner/Dateien wie `dmarkert.dm@gmail.com`, `react-javascript@1.0.0` oder andere Ablage-Müll ins Repo committen – nur Quellcode, Konfiguration ohne Secrets und Doku.

---

## Technik

- **Frontend:** React, Vite, React Router, PWA (Workbox)
- **Backend:** Supabase (Auth, PostgreSQL, Edge Functions)
- **Push:** Web Push API, VAPID, Edge Function `send-push`

---

*WA I Kasse • PWA für Kasse, Mahlzeiten und Push*

# Push-Benachrichtigungen (Ersatz für Telegram)

Die WA I KASSE nutzt **Web Push** statt Telegram. Nutzer aktivieren Push in den Einstellungen; Admins senden Ankündigungen wie bisher (Mahlzeiten, Kasse offen).

## 1. VAPID-Keys erzeugen

```bash
npx web-push generate-vapid-keys
```

Du erhältst einen **öffentlichen** und einen **privaten** Key (Base64-URL).

## 2. Frontend (.env)

- `VITE_VAPID_PUBLIC_KEY` = der **öffentliche** VAPID-Key  
- `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` wie bisher

Die alten Telegram-Variablen (`VITE_TELEGRAM_BOT_TOKEN`, `VITE_TELEGRAM_CHAT_ID`, `VITE_TELEGRAM_CHANNEL_LINK`) werden nicht mehr benötigt.

## 3. Supabase: Tabelle anlegen

Im **SQL Editor** deines Supabase-Projekts die Migration ausführen:

```sql
-- Datei: supabase/migrations/20250215000000_push_subscriptions.sql
```

(Oder den Inhalt von `supabase/migrations/20250215000000_push_subscriptions.sql` kopieren und ausführen.)

## 4. Edge Function deployen

Supabase CLI **nicht** global mit npm installieren (wird nicht mehr unterstützt). Stattdessen:

**Option A – im Projekt (empfohlen):**
```bash
npm i supabase --save-dev
npx supabase login   # einmalig: öffnet Browser, du meldest dich bei Supabase an
npx supabase link --project-ref DEIN_PROJECT_REF   # Projekt-ID aus Dashboard: Project Settings → General → Reference ID
npx supabase functions deploy send-push
```

**Option B – Systemweit (Manjaro/Arch):**  
Release von [github.com/supabase/cli/releases](https://github.com/supabase/cli/releases) herunterladen (`.pkg.tar.zst`) und z. B. mit `sudo pacman -U supabase-*.pkg.tar.zst` installieren. Oder mit Homebrew: `brew install supabase/tap/supabase`.

**VAPID-Secrets in Supabase setzen (wichtig – sonst „Push nicht konfiguriert“):**

1. Keys erzeugen (falls noch nicht): `npx web-push generate-vapid-keys`
2. **Per CLI:**
   ```bash
   npx supabase secrets set VAPID_PUBLIC_KEY="dein-öffentlicher-key"
   npx supabase secrets set VAPID_PRIVATE_KEY="dein-privater-key"
   ```
3. **Oder im Dashboard:** [Supabase](https://supabase.com/dashboard) → dein Projekt → **Project Settings** (Zahnrad) → **Edge Functions** → **Secrets**. Dort zwei Secrets anlegen:
   - **Name:** `VAPID_PUBLIC_KEY`  → **Value:** der öffentliche Key (derselbe wie in der App `.env` unter `VITE_VAPID_PUBLIC_KEY`)
   - **Name:** `VAPID_PRIVATE_KEY` → **Value:** der private Key (nur hier, nie im Frontend)
   - **Name:** `VAPID_SUBJECT` (optional, für **iOS/Safari** empfohlen): `mailto:deine-email@domain.de` – ein gültiges mailto mit echter Domain (kein `@localhost`). Ohne dieses Secret verwendet die Function `mailto:noreply@example.com`; Apple kann bei ungültigem Subject mit **403 BadJwtToken** antworten.

Nach dem Setzen der Secrets die Edge Function **nicht** neu deployen – die Secrets werden automatisch eingebunden. „Kasse ist offen“ erneut testen.

## 5. Ablauf

- **Nutzer:** Einstellungen → „Push-Benachrichtigungen“ → „Aktivieren“. Browser fragt nach Berechtigung; Subscription wird in `push_subscriptions` gespeichert.
- **Admin:** Wie bisher „Kasse ist offen“, „Essen fertig“ usw. klicken → Frontend ruft die Edge Function `send-push` mit Titel und Text auf → alle gespeicherten Abos erhalten die Push-Nachricht.

## Fehlersuche („Kasse ist offen“ sendet, aber keine Push-Nachricht)

Nach dem Klick auf „Kasse ist offen“ zeigt die App jetzt eine Meldung:

- **„Push an X Gerät(e) gesendet“** – Versand war erfolgreich. Wenn trotzdem keine Benachrichtigung erscheint: Browser-Berechtigung für Benachrichtigungen prüfen (Seiteneinstellungen / Site-Einstellungen), App einmal im Hintergrund lassen oder Tab minimieren (manche Browser zeigen Push nur dann).
- **„Keine Geräte mit aktivierten Push-Benachrichtigungen“** – In der Tabelle `push_subscriptions` sind keine Einträge. Nutzer müssen in den **Einstellungen** → „Push-Benachrichtigungen“ → **Aktivieren** und die Browser-Abfrage bestätigen.
- **„Push fehlgeschlagen: Push nicht konfiguriert (VAPID-Secrets prüfen)“** – Edge Function kann nicht senden. Im Supabase-Dashboard unter **Project Settings → Edge Functions → Secrets** prüfen: `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` müssen gesetzt sein – und **dasselbe Key-Paar** wie in der App (`.env`: `VITE_VAPID_PUBLIC_KEY` = derselbe Wert wie `VAPID_PUBLIC_KEY`). Keys mit `npx web-push generate-vapid-keys` nur **einmal** erzeugen und öffentlichen Key in .env, beide in Supabase Secrets eintragen.
- **„401 Invalid JWT“ / „Push fehlgeschlagen: Unauthorized“** – Die App ruft die Edge Function jetzt mit dem **Anon-Key** im Header auf und schickt den User-JWT im Body; die Function prüft den User-JWT intern. So vermeidest du 401 vom Supabase-Gateway. Nach der Änderung die Edge Function neu deployen: `npx supabase functions deploy send-push`.
- **403 BadJwtToken (nur bei Apple/Safari, z. B. web.push.apple.com)** – Apple lehnt das VAPID-JWT ab. **Subject:** In Supabase **Secrets** `VAPID_SUBJECT` = `mailto:deine-email@deine-domain.de` (kein Leerzeichen nach `:`, Domain mit Punkt). In den Logs prüfen: „VAPID subject = mailto:***@***“ = dein Secret wird genutzt; „mailto:noreply@example.com“ = Fallback (Secret fehlt oder falsches Format). **Key-Paar:** `VAPID_PUBLIC_KEY` in Supabase muss **exakt** dem Wert von `VITE_VAPID_PUBLIC_KEY` in der App (.env) entsprechen (dasselbe Key-Paar, einmal erzeugen). In den Logs steht ein Key-Präfix – mit .env abgleichen. Wenn du die Keys jemals geändert hast: Auf dem iPhone Push in den Einstellungen **deaktivieren**, dann wieder **aktivieren** (damit ein neues Abo mit dem richtigen Key angelegt wird). **Wenn Subject und Key stimmen, trotzdem 403:** Edge Function einmal neu deployen: `npx supabase functions deploy send-push` – damit werden die aktuellen Secrets zuverlässig geladen.
- **„Push fehlgeschlagen: Netzwerkfehler“** – Edge Function nicht erreichbar (z. B. nicht deployt oder falsche `VITE_SUPABASE_URL`). Im Dashboard unter **Edge Functions** prüfen, ob `send-push` existiert und ob die Logs Fehler anzeigen.

## Hinweis zu Deno und web-push

Die Edge Function nutzt `npm:web-push`. Falls es unter Deno zu Crypto-Fehlern kommt, kannst du alternativ eine kleine Node.js-Funktion (z. B. auf Vercel/Railway) bereitstellen, die dieselbe API (`POST` mit `title`/`body` und Auth-Header) anbietet und mit dem Paket `web-push` sendet.

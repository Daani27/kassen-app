# Versionsliste – WA I Kasse

Alle nennenswerten Änderungen werden hier dokumentiert.

---

## [2.1.8] – 2026-02-17

### Push (iOS/Safari)
- **iOS-Push:** Nach Neudeploy der Edge Function `send-push` funktionieren Push-Benachrichtigungen auch auf Apple-Geräten (VAPID_SUBJECT und Keys waren korrekt; das Redeploy lädt die Secrets zuverlässig).
- **Dokumentation:** In PUSH_SETUP.md ergänzt: Wenn bei iOS trotz richtiger Konfiguration 403 BadJwtToken bleibt, einmal `npx supabase functions deploy send-push` ausführen.

---

## [2.1.7] – 2026-02-17

### PWA / Auto-Update
- **Update-Banner:** Erscheint nur noch, wenn die Version in der Script-URL des wartenden Service Workers sich von der aktiven unterscheidet (vermeidet Anzeige ohne echte neue Version).

### Push (iOS/Safari)
- **Diagnose in den Logs:** Beim Versand an Apple werden Subject und VAPID-Public-Key-Präfix als `console.warn` ausgegeben (in Supabase sichtbar); bei 403 BadJwtToken erscheint die gleiche Diagnose direkt beim Fehler. Hinweis in der App um Key-Paar-Prüfung und „Push deaktivieren → wieder aktivieren“ ergänzt.

---

## [2.1.6] – 2025-02-15

### PWA / Auto-Update
- **Aktualisieren-Button (🔄) auf der Startseite:** Prüft beim Klick zusätzlich auf App-Updates (Service Worker); bei neuer Version erscheint das Banner „Neue Version verfügbar. Jetzt aktualisieren“.
- **Keine Reload-Schleife mehr:** `skipWaiting()` wurde aus dem Service-Worker-**install**-Event entfernt. Die neue Version übernimmt erst nach Klick auf „Jetzt aktualisieren“ (Nachricht `SKIP_WAITING`), sodass die App nicht mehr dauerhaft neu lädt, sobald das Banner angezeigt wird.

---

## [2.1.5] – 2025-02-15

### PWA / Auto-Update
- **Update-Banner:** Banner „Neue Version verfügbar“ erscheint nicht mehr direkt nach einem Reload (15-Sekunden-Cooldown nach „Jetzt aktualisieren“).
- **Banner nur bei echter neuer Version:** Anzeige nur, wenn der wartende Service Worker eine andere Script-URL hat als der aktive.
- **Update-Check:** Automatischer Check alle 5 Minuten (zuvor 1 Minute), um ständige Banner-Anzeige zu vermeiden.

---

## [2.1.4] – 2025-02-15

### Push (iOS/Safari)
- **VAPID_SUBJECT für Apple:** Neues optionales Secret `VAPID_SUBJECT` (z. B. `mailto:admin@domain.de`) in Supabase, damit Apple das VAPID-JWT akzeptiert (vermeidet 403 BadJwtToken).
- **Hinweis bei 403:** Wenn ein iOS-Gerät 403 BadJwtToken erhält, liefert die Edge Function einen `hint` mit Anleitung; die App zeigt ihn nach „Kasse ist offen“ an.
- **Logs:** Beim Senden an Apple wird das verwendete VAPID-Subject (maskiert) in den Supabase-Logs ausgegeben.
- **Subject-Normalisierung:** Leerzeichen nach `mailto:` werden entfernt; ungültiges Format führt zu Fallback und Warnung im Log.

### PWA / Auto-Update
- **„Neue Version verfügbar“-Banner:** Wenn ein neuer Service Worker bereitsteht, erscheint ein Banner mit Button „Jetzt aktualisieren“; Klick lädt die Seite mit der neuen Version.
- **Update-Check:** Beim Wechsel zurück in die App (nach >2 s im Hintergrund) und alle 60 s wird auf Updates geprüft (für iOS).

### Service Worker
- **Push-Handler:** Kein `icon`/`badge` mehr in `showNotification` (iOS-kompatibel); robusteres Parsen und `.catch`, damit keine unbehandelten Fehler entstehen.

### Edge Function send-push
- **TTL:** Option `TTL: 86400` für Web-Push ergänzt.
- **Fehler-Logging:** Vollständige Fehlermeldung wird bei fehlgeschlagenem Versand geloggt.

### Dokumentation
- **PUSH_SETUP.md:** Abschnitt zu `VAPID_SUBJECT`, Fehlersuche 403 BadJwtToken mit Hinweis auf Supabase-Logs.

---

## [2.1.3]

- **Versionsnummer** in `package.json` und Service Worker (`SW_VERSION`) auf 2.1.3.
- PWA-Update und Service-Worker-Cache-Verhalten (skipWaiting, clientsClaim, keine Cache-Header für `sw.js`/`index.html` in Nginx) wie in 2.1.2.

---

## [2.1.2]

- **PWA-Update:** `registerType: 'autoUpdate'`, Service Worker mit `skipWaiting`/`clientsClaim`; kein automatischer Reload bei `controllerchange`/`updatefound` (vermeidet Reload beim Tastatur-Schließen).
- **Nginx:** `sw.js` und `index.html` mit `Cache-Control: no-cache` bzw. no-store, damit Updates zuverlässig ankommen.
- **Login:** E-Mail/Passwort als uncontrolled Inputs mit Refs, damit die Tastatur beim Tippen nicht schließt; visibilitychange-Update-Check nur nach >2 s unsichtbar.

---

## [2.1.1]

- **Frühstück (Brötchen):** Debounce 500 ms und Lock gegen Race Condition beim Speichern; bei Fehler Reload vom Server.
- **Push (iOS):** Prüfung auf iOS, Standalone-Modus, `pushManager` und Controller; Hinweis „App vom Home-Bildschirm öffnen“; vor neuem Subscribe auf iOS alte Subscription kündigen; `getLastPushError()` für Fehlermeldungen in der UI.
- **Gäste:** Abendessen Ja/Nein, Brötchen-Stepper, Block „Was es gibt“; Gast-Link/QR ins AdminPanel verschoben; Namenssuche mit Vorschlägen; „Invalid Date“ behoben (formatMealDate); Betrag entfernt, Name nach oben.
- **RLS/Suche:** Anon darf `profiles` für Gästesuche lesen; vereinfachte Suchfunktion (ILIKE).

---

## Ältere Versionen

Vor 2.1.x: Basis-Funktionen (Kasse, Mahlzeiten, Frühstück, Gäste, Login, Dashboard, Admin, Push-Ankündigungen, PWA-Grundaufbau).

---

*Format: [Version] – Datum (falls bekannt).*

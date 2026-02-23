# Versionsliste – Kassen App

Alle nennenswerten Änderungen werden hier dokumentiert.

---

## [2.1.10]

### Mahlzeiten / Abendessen
- **Preis-Anzeige ohne Abrechnung:** Neuer Button „Anzeige aktualisieren“ neben dem Einkaufsfeld – aktualisiert nur die Anzeige „Kosten p.P.“ (z. B. im Dashboard), ohne die Mahlzeit abzurechnen. Automatische Berechnung aus den Abendessen-Ausgaben bleibt unverändert; gespeicherter Gesamtpreis hat Vorrang beim Laden.
- **Buttons „Anzeige aktualisieren“ und „Abschließen“** etwas größer (mehr Padding, Schrift 0.95rem).

### Admin
- **Ruf-Funktionen ins Admin-Menü:** „⏳ Fast fertig“ und „🔔 Essen fertig!“ aus dem Mahlzeiten-Tab entfernt und ins Admin-Panel verschoben – dort immer verfügbar, unabhängig von einer offenen Mahlzeit. Bei offener Mahlzeit wird deren Titel in der Push-Nachricht verwendet, sonst „Essen“. Dashboard übergibt `session` an AdminPanel.

### Kasse (FinancePanel)
- **Ausgabe für Person:** Neue Sektion „Ausgabe für Person“ – Person wählen, Betrag und optionale Beschreibung (z. B. Zigaretten mitgebracht). Bucht vom Konto der gewählten Person (Transaktion) und vom Barbestand (global_expense, Kategorie `ausgabe_person`).
- **Transaktionsliste:** Anzeige verbessert: „Von → Zu“ (z. B. Bar/Kasse → Konto, Konto → Ausgabe), bei Kassenbuchungen „Veranlasst von: [Name]“, Datum inkl. Uhrzeit.
- **Einnahme vs. Ausgabe:** Kassen-Einnahmen (z. B. Korrektur mit positivem Betrag) werden nicht mehr als Ausgabe angezeigt – klare Kennzeichnung „📥 Einnahme“ bzw. „📤 Ausgabe“ und passende Von/Zu-Beschriftung.
- **Eingabefelder kompakter:** Karten, Inputs und Buttons im Kassentab verkleinert (weniger Padding, Schrift 0.9rem, kleinere Abstände).

### Push-Benachrichtigungen
- **Status beim Start:** Beim Öffnen der Einstellungen wird der aktuelle Push-Status ermittelt (Berechtigung + Subscription). Wenn Push bereits aktiv ist, werden „✓ Push aktiv“ sowie die Buttons „Aktualisieren“ und „Deaktivieren“ angezeigt – nicht mehr fälschlich „Aktivieren“.
- **Deaktivieren kündigt im Browser:** Beim Klick auf „Deaktivieren“ wird die Subscription zusätzlich zur Löschung in Supabase auch im Browser gekündigt (`unsubscribe()`), damit beim nächsten App-Start wieder „Aktivieren“ erscheint.
- **Nach App-Update:** Push muss nicht nach jedem Update neu aktiviert werden; die Subscription bleibt in der Regel erhalten. Geht sie nach einem Update verloren (z. B. manchmal unter iOS), reicht ein Tipp auf „Aktivieren“ zum erneuten Abonnieren.

### PWA / Auto-Update (iOS & Android)
- **Robustere Update-Erkennung (iOS):** Banner „Neue Version verfügbar“ nur, wenn **beide** Service-Worker-URLs (aktiv und wartend) einen Versions-Parameter haben und sich unterscheiden. Verhindert Falschanzeige, wenn auf iOS die aktive SW-URL ohne `?v=` geliefert wird. „Banner bereits gezeigt“ in `localStorage` (statt sessionStorage), damit keine Doppelanzeige nach App-Neustart.
- **Robustere Update-Erkennung (Android):** Semver-Vergleich – Banner nur, wenn die **wartende** Version **neuere** ist als die aktive (vermeidet Anzeige bei älterem gecachten SW). URL-Normalisierung für Vergleich (Pfad ohne Query), „Banner gezeigt“ wird anhand der **Version** gespeichert (nicht der kompletten URL), damit unterschiedliche URL-Varianten auf Android nicht zu mehrfacher Anzeige führen.

---

## [2.1.9]

### Login
- **Passwort anzeigen/verbergen:** Button (👁️/🙈) im Passwortfeld – Klick schaltet die Sichtbarkeit der Eingabe um.

### Frühstück
- **Zeitfenster:** Sperre für Brötchenbestellungen jetzt ab **7:50 Uhr** (zuvor 10:00 Uhr). Anzeige „BIS 7:50“.
- **Race Condition (iOS):** Speichern beim schnellen Tippen auf dem iPhone robuster: synchrone Lock per Ref (`savingRef`), längerer Debounce auf iOS (900 ms), Nachspeichern falls sich der Stand während des Speicherns geändert hat. Anleitung (ANLEITUNG_USER.md) auf 7:50 aktualisiert.

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

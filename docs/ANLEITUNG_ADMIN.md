# Kassen App – Anleitung für Admins

Diese Anleitung beschreibt alle Funktionen für **Administratoren**. Zusätzlich zu den Nutzer-Funktionen (siehe **ANLEITUNG_USER.md**) haben Admins Zugriff auf Kasse, Statistiken, Personalverwaltung und das Admin-Panel.

---

## Übersicht der Tabs (nur für Admins sichtbar)

| Tab    | Symbol | Inhalt |
|--------|--------|--------|
| Home   | 🏠     | Startseite mit Guthaben, Strichliste, Frühstück, Mahlzeiten |
| Einstellungen | 👤 | Push, Anzeigename, Passwort, Abmelden |
| Kasse  | 💰     | Kassenführung, Push „Kasse ist offen“, Buchungen |
| Statistiken | 📊 | Zeitraum-Auswertung, PDF-Export |
| Personal | 👥  | Nutzer verwalten, Admin-Rechte, Löschen |
| Admin  | ⚙️     | Gäste anlegen, Frühstücks-Übersicht, Registrierung, Salden, Transaktionen |

---

## Kasse (💰)

### „Kasse ist offen“ (Push)
- Button **„📢 Kasse ist offen“** sendet eine **Push-Nachricht** an alle Geräte mit aktivierten Benachrichtigungen.
- Text: „Wer sein Konto aufladen möchte: Die Kasse ist jetzt besetzt. Kommt vorbei!“
- Voraussetzung: Nutzer haben in den Einstellungen Push **aktiviert**.

### Abendessen & Ausgaben
- **Abendessen** – Betrag eintragen und buchen (wird der offenen Mahlzeit zugeordnet).
- **Allgemein** – Sonstige Kassenausgabe (z. B. Einkauf).

### Saldo anpassen
- **„Saldo anpassen“** – Manuelle Korrektur (z. B. Einmalige Gutschrift oder Berichtigung). Nur bei Bedarf nutzen.

### Buchungsverlauf
- Liste der letzten Buchungen (Einzahlungen, Verzehr, Ausgaben).
- **🔄** bei einer Zeile = Buchung ist **storniert** (grau).
- **🚫** tippen = Buchung **stornieren** (oder wieder reaktivieren).

---

## Mahlzeiten (🍴) – Admin-Funktionen

Wenn du eingeloggt bist und eine **offene Mahlzeit** existiert, siehst du zusätzlich:

### Ruf-Funktionen
- **„⏳ Fast fertig“** – Push an alle: Essen ist bald fertig.
- **„🔔 Essen fertig!“** – Push: Essen ist fertig.

### Abrechnung & Zuschuss
- **Wer gibt was dazu?** – Nutzer wählen, der einen Zuschuss gibt; **Zuschuss €** eintragen.
- **Einkauf €** – Einkaufspreis für die Mahlzeit.
- **„Abschließen“** – Mahlzeit abschließen (Kosten werden verteilt, Liste geschlossen).

### Teilnehmer manuell
- **Kamerad…** – Nutzer auswählen und mit **+** als Teilnehmer hinzufügen (z. B. wenn jemand nicht selbst buchen konnte).

Außerdem: **Neu** (neue Mahlzeit anlegen), **🗑️** (aktive Mahlzeit löschen), **Teilnehmer** (Liste mit Gästen einsehen).

---

## Strichliste & Frühstück – Admin-Option

- **Strichliste:** Dropdown **„🎯 Buchung für:“** – Du kannst Snacks/Getränke **für einen anderen Nutzer** buchen (z. B. wenn jemand bar bezahlt hat).
- **Frühstück:** **„🎯 Bestellung für:“** – Brötchenbestellung **für einen anderen Nutzer** eintragen.

---

## Statistiken (📊)

- **Zeitraum** wählen (Von / Bis).
- Anzeige: **Einnahmen**, **Ausgaben**, **Anfangs- und Endbestand**, **Transaktionen** im Zeitraum.
- **„PDF exportieren“** – Erzeugt eine PDF-Datei mit der Auswertung zum Herunterladen.

---

## Personal (👥)

- Liste aller **registrierten Nutzer** mit Suchfeld.
- **Admin** (Checkbox) – An/Aus: Nutzer Admin-Rechte geben oder entziehen.
- **🗑️** – Nutzer **löschen**.  
  **Hinweis:** Löschen schlägt fehl, wenn der Nutzer noch Buchungen/Transaktionen hat (Integritätsschutz).

---

## Admin-Panel (⚙️)

### Gast anlegen
- **Name** eintragen (z. B. „Max Mustermann“) → **„Anlegen“**.
- Es wird ein Profil **„Gast: Max Mustermann“** erstellt (ohne Login). Du kannst diesen Gast z. B. in der Strichliste oder bei Mahlzeiten verwenden.

### Einkaufsliste Heute (Frühstück)
- Übersicht: **Normal** und **Körner** – Summe der heutigen Brötchenbestellungen aller Nutzer (für den Einkauf).

### Registrierung
- **Sperren** / **Freigeben** – Steuert, ob sich **neue Nutzer** registrieren können. Bei „gesperrt“ können nur bestehende Nutzer sich anmelden.

### Salden-Übersicht
- Tabelle: **Name** und **Saldo** aller Nutzer.
- **„💶 Cash“** – Einzahlung für diesen Nutzer buchen (Betrag eingeben).

### Letzte Buchungen
- Die zuletzt angelegten/geänderten **Transaktionen** (Einzahlungen, Verzehr, Ausgaben).
- **🚫** = Buchung **stornieren**, **🔄** = wieder **reaktivieren**.

---

## Checkliste für Admins

| Aufgabe | Wo |
|--------|-----|
| Push „Kasse ist offen“ senden | Kasse (💰) → „📢 Kasse ist offen“ |
| Abendessen-Kosten buchen | Kasse → Abendessen / Mahlzeiten → Abschließen |
| Essen fertig melden | Mahlzeiten (🍴) → „🔔 Essen fertig!“ |
| Neue Mahlzeit anlegen | Mahlzeiten → „Neu“ |
| Gast ohne Account anlegen | Admin (⚙️) → Gast anlegen |
| Frühstücks-Einkauf prüfen | Admin → Einkaufsliste Heute |
| Registrierung sperren/freigeben | Admin → Registrierung |
| Nutzer Admin-Rechte geben | Personal (👥) → Admin-Checkbox |
| Salden einsehen / Cash buchen | Admin → Salden-Übersicht / „💶 Cash“ |
| Buchung stornieren | Kasse (Buchungsverlauf) oder Admin (Letzte Buchungen) |
| Statistik & PDF | Statistiken (📊) |

---

## Technik-Hinweise (für Betreiber)

- **App-Updates:** Nutzer sehen ein Banner „Neue Version verfügbar“, wenn ein neuer Build ausgerollt ist. Der **🔄-Button** auf der Startseite löst den Update-Check aus.
- **Push (iOS):** Damit Push auf dem iPhone funktioniert, muss die App **vom Home-Bildschirm** geöffnet werden. Setup von VAPID und Edge Function siehe **PUSH_SETUP.md**.

---

*Version der Anleitung: Stand App v2.1.x*

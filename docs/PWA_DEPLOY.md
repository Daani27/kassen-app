# PWA & Auto-Update beim Deploy

Damit die App auf dem Gerät automatisch aktualisiert wird (ohne manuelles Cache-Löschen), muss der **Server** zwei Dateien **nicht** lange cachen:

## Wichtig für Auto-Update

1. **`sw.js`** (Service Worker)  
   - **Cache-Control:** `no-cache` oder `max-age=0`  
   - Der Browser muss bei jedem Update-Check die aktuelle Version laden.  
   - Wenn `sw.js` gecacht wird, erkennt der Browser keine neue Version.

2. **`index.html`** (Einstiegsseite)  
   - Besser **nicht** lange cachen (z. B. `max-age=60` oder `no-cache`).  
   - Beim nächsten Öffnen der App wird dann die neue `index.html` geladen, die auf die neuen JS/CSS-Dateien verweist.

## Beispiel-Konfigurationen

### Nginx
Im Projekt liegt **`nginx-pwa.conf`** – Inhalt in deinen `server { }` Block einfügen oder per `include nginx-pwa.conf;` einbinden.

```nginx
location = /sw.js {
  add_header Cache-Control "no-cache, no-store, must-revalidate";
  add_header Pragma "no-cache";
  add_header Expires "0";
  try_files $uri $uri/ =404;
}
location = /index.html {
  add_header Cache-Control "no-cache, max-age=0";
  add_header Pragma "no-cache";
  add_header Expires "0";
  try_files $uri =404;
}
```

Wenn die App in einem Unterordner läuft (z. B. `https://domain.de/kasse/`), die `location`-Pfade anpassen: z. B. `location = /kasse/sw.js` und `location = /kasse/index.html`.

### Apache (.htaccess)
Siehe Netlify/Vercel oder eigene .htaccess mit `Header set Cache-Control` für `sw.js` und `index.html`.

### Netlify / Vercel / Static Hosting
- In den Einstellungen für **Headers** oder **Cache** für `sw.js` und `index.html` „Disable caching“ oder `Cache-Control: no-cache` setzen.

## Ablauf auf dem Gerät

1. App wird geöffnet (oder aus dem Hintergrund in den Vordergrund geholt).
2. Der Client ruft `registration.update()` auf → Browser prüft `sw.js`.
3. Wenn der Server die **neue** `sw.js` ausliefert (weil nicht gecacht), wird der neue Service Worker installiert.
4. Der neue Worker übernimmt sofort (`skipWaiting` / `clientsClaim`), die Seite lädt einmal neu.
5. Danach läuft die neue App-Version.

Ohne die richtigen Cache-Header für `sw.js` bleibt der alte Worker aktiv und das Auto-Update funktioniert nicht zuverlässig.

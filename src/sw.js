/* eslint-env serviceworker */
/**
 * Custom Service Worker: Precaching + Web-Push.
 * Wird von vite-plugin-pwa per injectManifest gebaut; __WB_MANIFEST wird injiziert.
 * skipWaiting nur auf Nachricht SKIP_WAITING (Klick auf "Jetzt aktualisieren"), sonst Reload-Schleife.
 * SW_VERSION wird beim Build aus package.json ersetzt.
 */
const SW_VERSION = '__SW_VERSION__'
import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('install', (_event) => {
  // Kein skipWaiting() hier – neue Version bleibt "waiting", bis Nutzer auf "Jetzt aktualisieren" tippt (SKIP_WAITING).
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('push', (event) => {
  let title = 'Kasse'
  let body = ''
  if (event.data) {
    try {
      const data = event.data.json()
      title = (data.title || title).slice(0, 100)
      body = (data.body || '').slice(0, 500)
    } catch (_) {
      try {
        body = event.data.text() || ''
      } catch (_) {}
    }
  }
  const options = {
    body: body || ' ',
    tag: 'kasse-push',
    renotify: true
  }
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => {})
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0 && clientList[0].focus) clientList[0].focus()
      else if (self.clients.openWindow) self.clients.openWindow(self.location.origin)
    })
  )
})

/**
 * Web-Push-Benachrichtigungen für WA I KASSE.
 * Ersetzt Telegram: Abos werden in Supabase gespeichert, Versand über Edge Function.
 */
import { supabase } from './supabaseClient'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Erkennt iOS/iPadOS (Safari oder in-App).
 */
export function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Steht die App im Standalone-Modus? (PWA vom Home-Bildschirm / display-mode: standalone)
 * Auf iOS funktioniert Web Push NUR in diesem Modus.
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.navigator?.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
}

/**
 * Prüft, ob Push unterstützt wird (HTTPS, Service Worker, Notifications).
 * Auf iOS: Nur true, wenn die App vom Home-Bildschirm geöffnet wurde (Standalone).
 */
export function isPushSupported() {
  if (typeof window === 'undefined') return false
  const hasApis =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC &&
    !!SUPABASE_URL
  if (!hasApis) return false
  if (isIos() && !isStandalone()) return false
  return true
}

let lastPushError = ''

/**
 * Letzte Fehlermeldung beim Push-Abonnement (für Anzeige in der UI).
 */
export function getLastPushError() {
  return lastPushError
}

/**
 * Fordert Berechtigung an und erstellt eine Push-Subscription.
 * Speichert die Subscription in Supabase (push_subscriptions).
 *
 * WICHTIG (v. a. iOS 16.4+): Nur aus expliziter User-Interaktion (z. B. Klick)
 * aufrufen – Notification.requestPermission() wird sofort gestartet (gleicher
 * Event-Loop-Tick), damit die Berechtigungsabfrage nicht blockiert wird.
 *
 * @param {string} userId - Supabase auth user id
 * @returns {Promise<'granted'|'denied'|'unsupported'|'error'>}
 */
export async function requestPermissionAndSubscribe(userId) {
  lastPushError = ''
  if (!userId) {
    lastPushError = 'Nicht angemeldet'
    return 'error'
  }
  // Auf iOS nur im Standalone-Modus unterstützt
  if (isIos() && !isStandalone()) {
    lastPushError = 'App muss vom Home-Bildschirm geöffnet sein'
    return 'unsupported'
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !VAPID_PUBLIC || !SUPABASE_URL) {
    lastPushError = 'Push wird in dieser Umgebung nicht unterstützt'
    return 'unsupported'
  }

  try {
    const permissionPromise = Notification.requestPermission()
    const permission = await permissionPromise
    if (permission !== 'granted') return 'denied'

    let reg = await navigator.serviceWorker.ready
    if (!reg.pushManager) {
      lastPushError = 'Push auf diesem Gerät nicht verfügbar (Safari/iOS-Einschränkung). Bitte iOS und die App aktualisieren.'
      console.warn('Push: ServiceWorkerRegistration.pushManager fehlt (bekannt bei einigen iOS-Versionen)')
      return 'unsupported'
    }

    if (!navigator.serviceWorker.controller) {
      await waitForController(3000)
      if (!navigator.serviceWorker.controller) {
        lastPushError = 'Service Worker nicht bereit. Bitte App vollständig schließen, vom Home-Bildschirm neu öffnen und erneut versuchen.'
        return 'error'
      }
      reg = await navigator.serviceWorker.ready
    }

    if (isIos()) {
      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
    })

    await saveSubscription(userId, sub)
    return 'granted'
  } catch (e) {
    console.error('Push subscribe error:', e)
    lastPushError = e?.message || 'Unbekannter Fehler'
    return 'error'
  }
}

function waitForController(maxMs) {
  return new Promise((resolve) => {
    if (navigator.serviceWorker.controller) return resolve()
    const start = Date.now()
    const t = setInterval(() => {
      if (navigator.serviceWorker.controller || Date.now() - start >= maxMs) {
        clearInterval(t)
        resolve()
      }
    }, 100)
  })
}

/**
 * Speichert oder aktualisiert die Push-Subscription für den User in Supabase.
 * RLS: User darf nur eigene Zeilen schreiben.
 */
async function saveSubscription(userId, subscription) {
  const payload = subscription.toJSON()
  const { endpoint, keys } = payload
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error('Invalid subscription')

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  )
  if (error) throw error
}

/**
 * Entfernt die Push-Subscription des Users (z. B. in Einstellungen "Deaktivieren").
 */
export async function unsubscribe(userId) {
  if (!userId) return
  await supabase.from('push_subscriptions').delete().eq('user_id', userId)
}

/**
 * Sendet eine Push-Nachricht an alle Abonnenten.
 * Ruft die Supabase Edge Function "send-push" auf.
 * @param {string} title - Titel der Benachrichtigung
 * @param {string} body - Text der Benachrichtigung
 * @param {object} session - supabase.auth.getSession() -> data.session
 * @returns {Promise<{ ok: boolean, sent?: number, failed?: number, error?: string }>}
 */
export async function sendPushToAll(title, body, session) {
  if (!SUPABASE_URL || !title) return { ok: false, error: 'Push nicht konfiguriert' }
  const accessToken = session?.access_token
  if (!accessToken) {
    console.warn('Push: Kein Auth-Token.')
    return { ok: false, error: 'Nicht angemeldet' }
  }

  // Anon-Key im Header (Gateway akzeptiert ihn), User-JWT im Body – vermeidet 401 Invalid JWT am Gateway
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY || ''}`
      },
      body: JSON.stringify({ title, body: body || '', access_token: accessToken })
    })
    const text = await res.text()
    if (!res.ok) {
      console.error('Push Edge Function error:', res.status, text)
      return { ok: false, error: res.status === 503 ? 'Push nicht konfiguriert: VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY in Supabase setzen (Dashboard → Project Settings → Edge Functions → Secrets).' : text || `Fehler ${res.status}` }
    }
    let data = { sent: 0, failed: 0, hint: null, vapid_debug: null }
    try {
      data = JSON.parse(text)
    } catch (_) {}
    return { ok: true, sent: data.sent ?? 0, failed: data.failed ?? 0, hint: data.hint || null, vapid_debug: data.vapid_debug || null }
  } catch (e) {
    console.error('Push send error:', e)
    return { ok: false, error: e.message || 'Netzwerkfehler' }
  }
}

/** VAPID Public Key ist Base64-URL-encoded; PushManager braucht Uint8Array. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}

/**
 * Web-Push-Benachrichtigungen.
 * Abos werden über die eigene API gespeichert, Versand über Backend /api/send-push.
 */
import { apiPushSubscribe, apiPushUnsubscribe, apiSendPush } from './api'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY
const API_URL = import.meta.env.VITE_API_URL

export function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.navigator?.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
}

export function isPushSupported() {
  if (typeof window === 'undefined') return false
  const hasApis =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC &&
    !!API_URL
  if (!hasApis) return false
  if (isIos() && !isStandalone()) return false
  return true
}

let lastPushError = ''

export function getLastPushError() {
  return lastPushError
}

export async function getCurrentPushState() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null
  if (isIos() && !isStandalone()) return null
  const permission = Notification.permission
  if (permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    if (!reg?.pushManager) return null
    const sub = await reg.pushManager.getSubscription()
    if (sub && permission === 'granted') return 'granted'
  } catch (_) {}
  return null
}

export async function requestPermissionAndSubscribe(userId) {
  lastPushError = ''
  if (!userId) {
    lastPushError = 'Nicht angemeldet'
    return 'error'
  }
  if (isIos() && !isStandalone()) {
    lastPushError = 'App muss vom Home-Bildschirm geöffnet sein'
    return 'unsupported'
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !VAPID_PUBLIC || !API_URL) {
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

    await apiPushSubscribe(sub)
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

export async function unsubscribe(userId) {
  if (!userId) return
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      const reg = await navigator.serviceWorker.ready
      if (reg.pushManager) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
      }
    }
  } catch (_) {}
  await apiPushUnsubscribe()
}

/**
 * Sendet eine Push-Nachricht an alle Abonnenten über die eigene API.
 * Token wird aus dem API-Client (Session) gelesen.
 */
export async function sendPushToAll(title, body, _session) {
  if (!API_URL || !title) return { ok: false, error: 'Push nicht konfiguriert' }
  try {
    const data = await apiSendPush(title, body)
    return { ok: true, sent: data.sent ?? 0, failed: data.failed ?? 0, hint: data.hint || null, vapid_debug: data.vapid_debug || null }
  } catch (e) {
    console.error('Push send error:', e)
    return { ok: false, error: e.data?.error || e.message || 'Netzwerkfehler' }
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}

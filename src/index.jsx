import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { BrandingProvider } from './BrandingContext'
import App from './App'

const SW_VERSION = typeof import.meta.env?.PACKAGE_VERSION === 'string' ? import.meta.env.PACKAGE_VERSION : ''

const PWA_UPDATE_RELOAD_KEY = 'pwa-update-reload-at'
const PWA_BANNER_SHOWN_FOR_KEY = 'pwa-banner-shown-for'

function getVersionFromScriptUrl(url) {
  if (!url) return null
  const m = String(url).match(/[?&]v=([^&]+)/)
  return m ? m[1] : null
}

/** Einfacher Semver-Vergleich (z. B. "2.1.11" > "2.1.10"). Returns 1 if a>b, -1 if a<b, 0 if equal or unparseable. */
function compareVersions(a, b) {
  if (!a || !b) return 0
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

/** Normale URL für Vergleich (Android kann volle URLs mit unterschiedlichen Pfaden liefern). */
function normalizeScriptUrl(url) {
  if (!url) return ''
  try {
    const u = String(url)
    const idx = u.indexOf('?')
    const path = idx >= 0 ? u.slice(0, idx) : u
    return path.replace(/\/+$/, '').toLowerCase()
  } catch (_) {
    return String(url)
  }
}

/** Nur true, wenn ein echtes Update vorliegt (robust für iOS und Android). */
function hasRealUpdate(reg) {
  if (!reg.active || !reg.waiting) return false
  const activeUrl = reg.active.scriptURL || ''
  const waitingUrl = reg.waiting.scriptURL || ''
  // Android: gleicher Pfad, nur Query unterschiedlich → nur Versionsvergleich zählt
  if (normalizeScriptUrl(activeUrl) === normalizeScriptUrl(waitingUrl)) {
    const activeVer = getVersionFromScriptUrl(activeUrl)
    const waitingVer = getVersionFromScriptUrl(waitingUrl)
    if (!activeVer || !waitingVer) return false
    return compareVersions(waitingVer, activeVer) > 0
  }
  if (activeUrl === waitingUrl) return false
  const activeVer = getVersionFromScriptUrl(activeUrl)
  const waitingVer = getVersionFromScriptUrl(waitingUrl)
  // iOS: active oft ohne ?v= → activeVer null → kein Banner
  if (!activeVer || !waitingVer) return false
  // Nur anzeigen, wenn waiting wirklich neuer ist (vermeidet "älterer" SW aus Cache auf Android)
  return compareVersions(waitingVer, activeVer) > 0
}

function showUpdateBanner(reg) {
  if (!reg.waiting || document.getElementById('pwa-update-banner')) return
  if (!hasRealUpdate(reg)) return
  const reloadedAt = sessionStorage.getItem(PWA_UPDATE_RELOAD_KEY)
  if (reloadedAt && Date.now() - Number(reloadedAt) < 60000) return
  const waitingVer = getVersionFromScriptUrl(reg.waiting.scriptURL)
  try {
    if (localStorage.getItem(PWA_BANNER_SHOWN_FOR_KEY) === waitingVer) return
  } catch (_) {}
  try {
    localStorage.setItem(PWA_BANNER_SHOWN_FOR_KEY, waitingVer || reg.waiting.scriptURL)
  } catch (_) {}
  const banner = document.createElement('div')
  banner.id = 'pwa-update-banner'
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#111827;color:#f3f4f6;padding:10px 16px;text-align:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);'
  const text = document.createElement('span')
  text.textContent = 'Neue Version verfügbar. '
  const btn = document.createElement('button')
  btn.textContent = 'Jetzt aktualisieren'
  btn.style.cssText = 'margin-left:8px;padding:6px 12px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;'
  btn.onclick = () => {
    sessionStorage.setItem(PWA_UPDATE_RELOAD_KEY, String(Date.now()))
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
  }
  banner.appendChild(text)
  banner.appendChild(btn)
  document.body.appendChild(banner)
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = SW_VERSION ? `./sw.js?v=${SW_VERSION}` : './sw.js'
    navigator.serviceWorker.register(swUrl, { scope: './' }).then((reg) => {
      const checkWaiting = () => {
        reg.update()
        if (reg.waiting) showUpdateBanner(reg)
      }
      if (typeof window !== 'undefined') window.__pwaCheckUpdate = checkWaiting
      reg.update()

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && reg.waiting) showUpdateBanner(reg)
        })
      })

      if (reg.waiting) showUpdateBanner(reg)

      let hiddenAt = 0
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          hiddenAt = Date.now()
        } else if (document.visibilityState === 'visible') {
          if (hiddenAt > 0 && Date.now() - hiddenAt > 2000) checkWaiting()
          hiddenAt = 0
        }
      })

      setInterval(checkWaiting, 5 * 60 * 1000)
    }).catch(() => {})

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (document.getElementById('pwa-update-banner')) window.location.reload()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <BrandingProvider>
        <App />
      </BrandingProvider>
    </BrowserRouter>
  </React.StrictMode>
)
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

const SW_VERSION = typeof import.meta.env?.PACKAGE_VERSION === 'string' ? import.meta.env.PACKAGE_VERSION : ''

const PWA_UPDATE_RELOAD_KEY = 'pwa-update-reload-at'
const PWA_BANNER_SHOWN_FOR_KEY = 'pwa-banner-shown-for'

function getVersionFromScriptUrl(url) {
  if (!url) return null
  const m = String(url).match(/[?&]v=([^&]+)/)
  return m ? m[1] : null
}

function showUpdateBanner(reg) {
  if (!reg.waiting || document.getElementById('pwa-update-banner')) return
  const reloadedAt = sessionStorage.getItem(PWA_UPDATE_RELOAD_KEY)
  if (reloadedAt && Date.now() - Number(reloadedAt) < 60000) return
  if (sessionStorage.getItem(PWA_BANNER_SHOWN_FOR_KEY) === reg.waiting.scriptURL) return
  if (reg.waiting.scriptURL === reg.active?.scriptURL) return
  const activeVer = getVersionFromScriptUrl(reg.active?.scriptURL)
  const waitingVer = getVersionFromScriptUrl(reg.waiting.scriptURL)
  if (!waitingVer || activeVer === waitingVer) return
  if (!reg.active) return
  sessionStorage.setItem(PWA_BANNER_SHOWN_FOR_KEY, reg.waiting.scriptURL)
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
			<App />
		</BrowserRouter>
	</React.StrictMode>
)
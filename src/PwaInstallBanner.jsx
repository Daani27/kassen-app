import { useState, useEffect } from 'react'

const STORAGE_KEY = 'pwa-install-dismissed'
const DISMISS_DAYS = 7

function isStandalone() {
  if (typeof window === 'undefined') return true
  return window.navigator?.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const t = parseInt(raw, 10)
    if (isNaN(t)) return false
    return Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch (_) {
    return false
  }
}

function dismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch (_) {}
}

export default function PwaInstallBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return
    setVisible(true)
  }, [])

  function handleDismiss() {
    dismiss()
    setVisible(false)
  }

  if (!visible) return null

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      backgroundColor: '#111827',
      color: '#f3f4f6',
      padding: '10px 14px 10px 16px',
      fontSize: '0.85rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
      <span style={{ flex: 1 }}>
        {isIos ? (
          <>📱 <strong>App installieren:</strong> Safari → Teilen → „Zum Home-Bildschirm“</>
        ) : (
          <>📲 App zum Home-Bildschirm hinzufügen für bessere Nutzung</>
        )}
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Hinweis schließen"
        style={{
          flexShrink: 0,
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          color: '#fff',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '1.1rem',
          lineHeight: 1,
          padding: 0
        }}
      >
        ✕
      </button>
    </div>
  )
}

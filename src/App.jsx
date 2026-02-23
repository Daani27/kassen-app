import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { getStoredSession, apiGetSession } from './api'
import { useBranding } from './BrandingContext'
import Login from './Login'
import Dashboard from './Dashboard'
import GastPage from './GastPage'
import PwaInstallBanner from './PwaInstallBanner'
import ErrorBoundary from './ErrorBoundary'

const APP_VERSION = import.meta.env.PACKAGE_VERSION || '3.0.2'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const branding = useBranding()

  useEffect(() => {
    const init = async () => {
      const stored = getStoredSession()
      if (stored?.token) {
        try {
          const data = await apiGetSession()
          if (data) setSession({ user: data.user, token: data.token })
          else setSession(null)
        } catch {
          setSession(null)
        }
      } else {
        setSession(null)
      }
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    document.title = branding.app_name ? `${branding.app_name}` : 'Kasse'
  }, [branding.app_name])

  const setSessionFromLogin = (newSession) => {
    setSession(newSession)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb', color: '#9ca3af' }}>
        <p>Wird geladen...</p>
      </div>
    )
  }

  const VersionFooter = () => (
    <footer style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '20px 16px 30px',
      fontSize: '10px',
      color: '#9ca3af',
      fontFamily: 'monospace',
      backgroundColor: 'transparent'
    }}>
      <span>{branding.app_name || 'Kasse'} • v{APP_VERSION}</span>
      <span style={{ display: 'flex', gap: '12px' }}>
        <a
          href="https://ko-fi.com/daani27"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#9ca3af', textDecoration: 'none' }}
        >
          Unterstützen
        </a>
        {branding.bug_report_url ? (
          <a
            href={branding.bug_report_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#9ca3af', textDecoration: 'none' }}
          >
            Bug melden
          </a>
        ) : null}
      </span>
    </footer>
  )

  return (
    <>
      <Routes>
        <Route path="/gast" element={<GastPage />} />
        <Route
          path="/*"
          element={
            !session ? (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <PwaInstallBanner />
                <div style={{ flex: 1 }}><Login onLogin={setSessionFromLogin} /></div>
                <VersionFooter />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <PwaInstallBanner />
                <div style={{ flex: 1 }}>
                  <ErrorBoundary>
                    <Dashboard session={session} onLogout={() => setSession(null)} />
                  </ErrorBoundary>
                </div>
                <VersionFooter />
              </div>
            )
          }
        />
      </Routes>
    </>
  )
}

export default App

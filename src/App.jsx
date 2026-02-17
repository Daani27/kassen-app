import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './Login'
import Dashboard from './Dashboard'
import GastPage from './GastPage'

// Die Version wird automatisch aus der package.json geladen (dank der vite.config.js Anpassung)
const APP_VERSION = import.meta.env.PACKAGE_VERSION || '2.0.0';

function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    // 1. Initiale Session prüfen
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // 2. Auf Auth-Statusänderungen hören
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Gemeinsame Footer-Komponente: Version links, Bug-Report rechts
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
      <span>WA I KASSE • v{APP_VERSION}</span>
      <a
        href="https://markertcloud.de/index.php/apps/forms/s/K2cSDcdjP47fF9zH6HPBnkMM"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#9ca3af', textDecoration: 'none' }}
      >
        Bug melden
      </a>
    </footer>
  );

  return (
    <>
      <Routes>
        <Route path="/gast" element={<GastPage />} />
        <Route
          path="/*"
          element={
            !session ? (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <div style={{ flex: 1 }}><Login /></div>
                <VersionFooter />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <div style={{ flex: 1 }}><Dashboard session={session} /></div>
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
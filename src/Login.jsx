import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [isRegEnabled, setIsRegEnabled] = useState(true)
  const [showMagicLink, setShowMagicLink] = useState(false)
  const emailInputRef = useRef(null)
  const passwordInputRef = useRef(null)
  const magicEmailInputRef = useRef(null)

  useEffect(() => {
    checkRegistrationStatus()
  }, [])

  async function checkRegistrationStatus() {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value_bool')
      .eq('id', 'registration_enabled')
      .single()

    if (!error && data) {
      setIsRegEnabled(data.value_bool)
    }
  }

  const handleLogin = async () => {
    const email = emailInputRef.current?.value?.trim() ?? ''
    const password = passwordInputRef.current?.value ?? ''
    if (!email || !password) return alert('E-Mail und Passwort eingeben.')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert('Fehler: ' + error.message)
    setLoading(false)
  }

  const handleSignUp = async () => {
    if (!isRegEnabled) return
    const email = emailInputRef.current?.value?.trim() ?? ''
    const password = passwordInputRef.current?.value ?? ''
    if (!email || !password) return alert('E-Mail und Passwort eingeben.')
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) alert('Fehler: ' + error.message)
    else alert('Registrierung erfolgreich! Du kannst dich jetzt einloggen.')
    setLoading(false)
  }

  const handleSendMagicLink = async (e) => {
    e.preventDefault()
    const magicEmail = magicEmailInputRef.current?.value?.trim() ?? ''
    if (!magicEmail) return alert('Bitte E-Mail eingeben!')

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: magicEmail,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      alert('Fehler: ' + error.message)
    } else {
      alert('Anmelde-Link wurde gesendet! Bitte schau in dein Postfach.')
      setShowMagicLink(false)
    }
    setLoading(false)
  }

  return (
    <div style={pageWrapperStyle}>
      <div style={loginCardStyle}>
        <div style={iconContainerStyle}>
          <span style={{ fontSize: '2.5rem' }}>🚒</span>
        </div>

        <h2 style={titleStyle}>Kasse WA I</h2>
        <p style={subtitleStyle}>Wachabteilung I • Lippstadt</p>

        {!showMagicLink ? (
          /* --- NORMALER LOGIN --- */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
            <div style={inputWrapperStyle}>
              <input
                ref={emailInputRef}
                type="email"
                placeholder="E-Mail"
                autoComplete="email"
                style={inputStyle}
              />
            </div>

            <div style={inputWrapperStyle}>
              <input
                ref={passwordInputRef}
                type="password"
                placeholder="Passwort"
                autoComplete="current-password"
                style={inputStyle}
              />
            </div>

            <button 
              onClick={handleLogin} 
              disabled={loading}
              style={{ 
                ...btnStyle, 
                backgroundColor: '#111827', 
                color: 'white',
                marginTop: '10px',
                opacity: loading ? 0.7 : 1 
              }}
            >
              {loading ? 'Wird angemeldet...' : 'Anmelden'}
            </button>

            <button 
              onClick={() => setShowMagicLink(true)} 
              style={{ ...signUpBtnStyle, color: '#6366f1', marginTop: '0' }}
            >
              Passwort vergessen
            </button>

            {isRegEnabled ? (
              <button 
                onClick={handleSignUp} 
                disabled={loading}
                style={signUpBtnStyle}
              >
                Neuen Account erstellen
              </button>
            ) : (
              <div style={lockedBadgeStyle}>
                🔒 Registrierung deaktiviert
              </div>
            )}
          </div>
        ) : (
          /* --- MAGIC LINK ANSICHT --- */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
            <h4 style={{ margin: '0', color: '#111827' }}>Link anfordern</h4>
            <p style={{ ...subtitleStyle, fontSize: '0.8rem' }}>Wir senden dir einen Link, mit dem du dich sofort ohne Passwort einloggen kannst.</p>
            <input
              ref={magicEmailInputRef}
              type="email"
              placeholder="Deine E-Mail"
              autoComplete="email"
              style={inputStyle}
            />
            <button
              onClick={handleSendMagicLink}
              disabled={loading}
              style={{ ...btnStyle, backgroundColor: '#6366f1', color: 'white' }}
            >
              Link senden
            </button>
            <button 
              onClick={() => setShowMagicLink(false)} 
              style={signUpBtnStyle}
            >
              Zurück zum Passwort-Login
            </button>
          </div>
        )}

        <footer style={footerStyle}>
          &copy; 2026 Daniel Markert
        </footer>
      </div>
    </div>
  )
}

// STYLES
const pageWrapperStyle = { backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', padding: '20px' }
const loginCardStyle = { backgroundColor: '#fff', padding: '40px 30px', borderRadius: '32px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02)', width: '100%', maxWidth: '400px', textAlign: 'center', border: '1px solid #f1f5f9' }
const iconContainerStyle = { width: '70px', height: '70px', backgroundColor: '#fef2f2', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', border: '1px solid #fee2e2' }
const titleStyle = { margin: '0', color: '#0f172a', fontSize: '1.5rem', fontWeight: '800' }
const subtitleStyle = { color: '#64748b', fontSize: '0.9rem', margin: '4px 0 0 0', fontWeight: '500' }
const inputWrapperStyle = { position: 'relative', width: '100%' }
const inputStyle = { width: '100%', padding: '14px 16px', borderRadius: '14px', border: '1px solid #e2e8f0', boxSizing: 'border-box', fontSize: '1rem', backgroundColor: '#f8fafc', outline: 'none', transition: 'border-color 0.2s' }
const btnStyle = { width: '100%', padding: '14px', borderRadius: '14px', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' }
const signUpBtnStyle = { ...btnStyle, backgroundColor: 'transparent', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginTop: '5px' }
const lockedBadgeStyle = { marginTop: '20px', padding: '10px', borderRadius: '12px', backgroundColor: '#fff1f2', color: '#e11d48', fontSize: '0.8rem', fontWeight: '700' }
const footerStyle = { marginTop: '30px', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }
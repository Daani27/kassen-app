import { useState, useEffect, useRef } from 'react'
import { apiLogin, apiRegister, apiGetRegistrationEnabled, apiForgotPassword } from './api'
import { useBranding } from './BrandingContext'

export default function Login({ onLogin }) {
  const branding = useBranding()
  const [loading, setLoading] = useState(false)
  const [isRegEnabled, setIsRegEnabled] = useState(true)
  const [showMagicLink, setShowMagicLink] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const emailInputRef = useRef(null)
  const passwordInputRef = useRef(null)
  const magicEmailInputRef = useRef(null)

  useEffect(() => {
    checkRegistrationStatus()
  }, [])

  async function checkRegistrationStatus() {
    try {
      const value = await apiGetRegistrationEnabled()
      setIsRegEnabled(value)
    } catch (_) {}
  }

  const handleLogin = async () => {
    const email = emailInputRef.current?.value?.trim() ?? ''
    const password = passwordInputRef.current?.value ?? ''
    if (!email || !password) return alert('E-Mail und Passwort eingeben.')
    setLoading(true)
    try {
      const session = await apiLogin(email, password)
      if (onLogin) onLogin(session)
    } catch (e) {
      alert('Fehler: ' + (e.data?.error || e.message))
    }
    setLoading(false)
  }

  const handleSignUp = async () => {
    if (!isRegEnabled) return
    const email = emailInputRef.current?.value?.trim() ?? ''
    const password = passwordInputRef.current?.value ?? ''
    if (!email || !password) return alert('E-Mail und Passwort eingeben.')
    setLoading(true)
    try {
      const session = await apiRegister(email, password)
      alert('Registrierung erfolgreich! Du kannst dich jetzt einloggen.')
      if (onLogin) onLogin(session)
    } catch (e) {
      alert('Fehler: ' + (e.data?.error || e.message))
    }
    setLoading(false)
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    const email = magicEmailInputRef.current?.value?.trim() ?? ''
    if (!email) return alert('Bitte E-Mail eingeben.')
    setLoading(true)
    try {
      const data = await apiForgotPassword(email)
      alert(data?.message || 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet. Bitte Postfach (und Spam) prüfen.')
      setShowMagicLink(false)
    } catch (e) {
      const err = e.data?.error || e.message
      const hint = e.data?.hint ? '\n\n' + e.data.hint : ''
      alert('Fehler: ' + err + hint)
    }
    setLoading(false)
  }

  return (
    <div style={pageWrapperStyle}>
      <div style={loginCardStyle}>
        <div style={iconContainerStyle}>
          <span style={{ fontSize: '2.5rem' }}>🚒</span>
        </div>

        <h2 style={titleStyle}>{branding.app_name || 'Kasse'}</h2>
        {branding.app_subtitle ? <p style={subtitleStyle}>{branding.app_subtitle}</p> : null}

        {!showMagicLink ? (
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

            <div style={passwordWrapperStyle}>
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                placeholder="Passwort"
                autoComplete="current-password"
                style={{ ...inputStyle, paddingRight: '48px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={passwordToggleBtnStyle}
                title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
            <h4 style={{ margin: '0', color: '#111827' }}>Passwort vergessen</h4>
            <p style={{ ...subtitleStyle, fontSize: '0.8rem' }}>E-Mail eingeben – wir senden dir einen Link zum Zurücksetzen (gültig 1 Stunde).</p>
            <input
              ref={magicEmailInputRef}
              type="email"
              placeholder="Deine E-Mail"
              autoComplete="email"
              style={inputStyle}
            />
            <button
              onClick={handleForgotPassword}
              disabled={loading}
              style={{ ...btnStyle, backgroundColor: '#6366f1', color: 'white' }}
            >
              {loading ? 'Wird gesendet...' : 'Link senden'}
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

const pageWrapperStyle = { backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', padding: '20px' }
const loginCardStyle = { backgroundColor: '#fff', padding: '40px 30px', borderRadius: '32px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02)', width: '100%', maxWidth: '400px', textAlign: 'center', border: '1px solid #f1f5f9' }
const iconContainerStyle = { width: '70px', height: '70px', backgroundColor: '#fef2f2', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', border: '1px solid #fee2e2' }
const titleStyle = { margin: '0', color: '#0f172a', fontSize: '1.5rem', fontWeight: '800' }
const subtitleStyle = { color: '#64748b', fontSize: '0.9rem', margin: '4px 0 0 0', fontWeight: '500' }
const inputWrapperStyle = { position: 'relative', width: '100%' }
const passwordWrapperStyle = { position: 'relative', width: '100%' }
const inputStyle = { width: '100%', padding: '14px 16px', borderRadius: '14px', border: '1px solid #e2e8f0', boxSizing: 'border-box', fontSize: '1rem', backgroundColor: '#f8fafc', outline: 'none', transition: 'border-color 0.2s' }
const passwordToggleBtnStyle = { position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: '6px', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, opacity: 0.7 }
const btnStyle = { width: '100%', padding: '14px', borderRadius: '14px', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' }
const signUpBtnStyle = { ...btnStyle, backgroundColor: 'transparent', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginTop: '5px' }
const lockedBadgeStyle = { marginTop: '20px', padding: '10px', borderRadius: '12px', backgroundColor: '#fff1f2', color: '#e11d48', fontSize: '0.8rem', fontWeight: '700' }
const footerStyle = { marginTop: '30px', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }

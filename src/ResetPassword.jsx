import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { apiResetPassword } from './api'
import { useBranding } from './BrandingContext'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  background: '#f8fafc',
}
const cardStyle = {
  backgroundColor: '#fff',
  padding: '40px 30px',
  borderRadius: '16px',
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02)',
  width: '100%',
  maxWidth: '400px',
  textAlign: 'center',
  border: '1px solid #f1f5f9',
}
const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '14px',
  border: '1px solid #e2e8f0',
  boxSizing: 'border-box',
  fontSize: '1rem',
  backgroundColor: '#f8fafc',
  outline: 'none',
  marginBottom: '12px',
}
const btnStyle = {
  width: '100%',
  padding: '14px',
  borderRadius: '14px',
  border: 'none',
  fontSize: '1rem',
  fontWeight: '700',
  cursor: 'pointer',
  backgroundColor: '#111827',
  color: 'white',
  marginTop: '8px',
}
const linkStyle = { color: '#6366f1', textDecoration: 'none', fontWeight: '600' }

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const branding = useBranding()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) setError('Ungültiger Link. Bitte „Passwort vergessen“ auf der Anmeldeseite nutzen.')
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!token) return
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen haben.')
      return
    }
    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await apiResetPassword(token, password)
      setDone(true)
    } catch (e) {
      setError(e.data?.error || e.message || 'Link ungültig oder abgelaufen. Bitte erneut anfordern.')
    }
    setLoading(false)
  }

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 12px', color: '#0f172a' }}>{branding.app_name || 'Kasse'}</h2>
          <p style={{ color: '#64748b', margin: '0 0 20px' }}>Ungültiger Link</p>
          <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
            Bitte auf der Anmeldeseite „Passwort vergessen“ nutzen und den Link aus der E-Mail verwenden.
          </p>
          <a href="/" style={linkStyle}>Zur Anmeldung</a>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 12px', color: '#0f172a' }}>{branding.app_name || 'Kasse'}</h2>
          <p style={{ color: '#16a34a', margin: '0 0 20px', fontWeight: '600' }}>Passwort wurde geändert.</p>
          <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 20px' }}>
            Du kannst dich jetzt mit dem neuen Passwort anmelden.
          </p>
          <button type="button" onClick={() => navigate('/')} style={btnStyle}>
            Zur Anmeldung
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 12px', color: '#0f172a' }}>{branding.app_name || 'Kasse'}</h2>
        <p style={{ color: '#64748b', margin: '0 0 20px' }}>Neues Passwort setzen</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Neues Passwort (min. 6 Zeichen)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Passwort wiederholen"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={inputStyle}
            autoComplete="new-password"
          />
          {error ? <p style={{ color: '#dc2626', fontSize: '0.9rem', margin: '0 0 12px' }}>{error}</p> : null}
          <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Wird gespeichert...' : 'Passwort setzen'}
          </button>
        </form>
        <p style={{ marginTop: '20px', fontSize: '0.85rem' }}>
          <a href="/" style={linkStyle}>Zurück zur Anmeldung</a>
        </p>
      </div>
    </div>
  )
}

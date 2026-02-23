import { useState, useEffect } from 'react'
import { apiUpdateProfileMe, apiUpdatePassword } from './api'
import { isPushSupported, isIos, isStandalone, requestPermissionAndSubscribe, unsubscribe, getCurrentPushState, getLastPushError } from './pushNotifications'

export default function UserSettings({ session, profile, onUpdate, transactions = [] }) {
  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const [username, setUsername] = useState(profile?.username ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [pushStatus, setPushStatus] = useState(null)

  useEffect(() => {
    if (!session?.user?.id || !isPushSupported()) return
    getCurrentPushState().then((state) => {
      if (state !== null) setPushStatus(state)
      else setPushStatus((prev) => (prev === 'disabled' ? 'disabled' : null))
    })
  }, [session?.user?.id])

  async function handlePushToggle() {
    if (!session?.user?.id) return
    setPushStatus('loading')
    const result = await requestPermissionAndSubscribe(session.user.id)
    setPushStatus(result)
  }

  async function handlePushDisable() {
    if (!session?.user?.id) return
    setPushStatus('loading')
    await unsubscribe(session.user.id)
    setPushStatus('disabled')
  }

  async function updateUsername() {
    setLoading(true)
    try {
      await apiUpdateProfileMe(username)
      alert('Anzeigename aktualisiert!')
      if (onUpdate) onUpdate()
    } catch (e) {
      alert(e.data?.error || e.message)
    }
    setLoading(false)
  }

  async function updatePassword() {
    if (password.length < 6) return alert('Passwort muss mind. 6 Zeichen haben.')
    setLoading(true)
    try {
      await apiUpdatePassword(password)
      alert('Passwort erfolgreich geändert!')
      setPassword('')
    } catch (e) {
      alert(e.data?.error || e.message)
    }
    setLoading(false)
  }

  return (
    <div style={containerStyle}>

      {/* --- PUSH-BENACHRICHTIGUNGEN (immer sichtbar) --- */}
      <div style={{ ...cardStyle, backgroundColor: '#111827', border: 'none' }}>
        <h3 style={{ ...cardTitleStyle, color: 'white', marginBottom: '8px' }}>🔔 Push-Benachrichtigungen</h3>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', marginBottom: '15px' }}>
          Erhalte Ankündigungen zu Mahlzeiten und Kasse direkt auf diesem Gerät.
        </p>
        {isIos() && !isStandalone() ? (
          <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 10px 0', fontWeight: '600' }}>📱 Push auf dem iPhone/iPad</p>
            <p style={{ margin: 0 }}>
              Push-Benachrichtigungen funktionieren unter iOS nur, wenn du die App <strong>vom Home-Bildschirm</strong> startest:
            </p>
            <ol style={{ margin: '10px 0 0 0', paddingLeft: '18px' }}>
              <li>In Safari: Menü <strong>Teilen</strong> (Quadrat mit Pfeil)</li>
              <li><strong>Zum Home-Bildschirm</strong> wählen</li>
              <li>App vom Home-Bildschirm öffnen und hier erneut <strong>Aktivieren</strong> tippen</li>
            </ol>
          </div>
        ) : !isPushSupported() ? (
          <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
            Push ist hier nicht verfügbar (HTTPS und VAPID-Key in der App-Konfiguration nötig).
          </p>
        ) : (
          <>
            {pushStatus === 'granted' && (
              <p style={{ color: '#86efac', fontSize: '0.85rem', marginBottom: '10px' }}>✓ Push aktiv</p>
            )}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handlePushToggle}
                disabled={pushStatus === 'loading'}
                style={pushBtnStyle}
              >
                {pushStatus === 'loading' ? '…' : pushStatus === 'granted' ? 'Aktualisieren' : 'Aktivieren'}
              </button>
              {(pushStatus === 'granted' || pushStatus === 'disabled') && (
                <button onClick={handlePushDisable} disabled={pushStatus === 'loading'} style={pushBtnSecondaryStyle}>
                  Deaktivieren
                </button>
              )}
            </div>
            {pushStatus === 'denied' && (
              <p style={{ color: '#fca5a5', fontSize: '0.75rem', marginTop: '8px' }}>Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben.</p>
            )}
            {(pushStatus === 'unsupported' || pushStatus === 'error') && getLastPushError() && (
              <p style={{ color: '#fcd34d', fontSize: '0.75rem', marginTop: '8px' }}>{getLastPushError()}</p>
            )}
            {pushStatus === 'unsupported' && !getLastPushError() && (
              <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '8px' }}>Push wird in diesem Browser oder ohne HTTPS nicht unterstützt.</p>
            )}
          </>
        )}
      </div>

      {/* Profil-Sektion */}
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>👤 Mein Profil</h3>
        <div style={{ marginBottom: '15px' }}>
          <label style={miniLabelStyle}>Anzeigename</label>
          <input 
            style={inputStyle} 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            placeholder="Dein Name"
          />
        </div>
        <button onClick={updateUsername} style={primaryBtnStyle} disabled={loading}>
          Name speichern
        </button>
      </div>

      {/* Sicherheits-Sektion */}
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>🔒 Sicherheit</h3>
        <div style={{ marginBottom: '15px' }}>
          <label style={miniLabelStyle}>Neues Passwort</label>
          <input 
            type="password" 
            style={inputStyle} 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="Mind. 6 Zeichen" 
          />
        </div>
        <button onClick={updatePassword} style={secondaryBtnStyle} disabled={loading}>
          Passwort aktualisieren
        </button>
      </div>

      {/* Historie-Sektion */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={cardTitleStyle}>📜 Letzte Buchungen</h3>
          <span style={countBadgeStyle}>{safeTransactions.length}</span>
        </div>

        <div style={historyContainerStyle}>
          {safeTransactions.length === 0 ? (
            <div style={emptyStateStyle}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}>☕</span>
              Noch keine Buchungen vorhanden.
            </div>
          ) : (
            safeTransactions.map((t) => {
              const amt = Number(t.amount) || 0
              const d = t.created_at ? new Date(t.created_at) : null
              const dateStr = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
              return (
              <div key={t.id} style={transactionItemStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    ...iconBoxStyle,
                    backgroundColor: amt < 0 ? '#fff1f2' : '#f0fdf4',
                    color: amt < 0 ? '#ef4444' : '#10b981'
                  }}>
                    {amt < 0 ? '▼' : '▲'}
                  </div>
                  <div>
                    <div style={descStyle}>{t.description || 'Systembuchung'}</div>
                    <div style={dateStyle}>{dateStr}</div>
                  </div>
                </div>
                <div style={{ 
                  fontWeight: '800', 
                  fontSize: '0.95rem',
                  color: amt < 0 ? '#1e293b' : '#10b981'
                }}>
                  {amt < 0 ? '' : '+'}{(Number(amt) || 0).toFixed(2)} €
                </div>
              </div>
            )})
          )}
        </div>
      </div>
    </div>
  )
}

// STYLES
const containerStyle = { display: 'flex', flexDirection: 'column', gap: '20px' }
const cardStyle = { backgroundColor: '#fff', padding: '24px', borderRadius: '24px', border: '1px solid #f1f5f9' }
const cardTitleStyle = { marginTop: 0, marginBottom: '20px', fontSize: '1rem', fontWeight: '800', color: '#0f172a' }
const miniLabelStyle = { fontSize: '0.65rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }
const inputStyle = { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', boxSizing: 'border-box', fontSize: '1rem' }
const primaryBtnStyle = { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569', cursor: 'pointer', fontWeight: 'bold' }
const secondaryBtnStyle = { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: 'white', cursor: 'pointer', fontWeight: 'bold' }

const pushBtnStyle = {
  padding: '10px 20px',
  backgroundColor: 'white',
  color: '#111827',
  border: 'none',
  borderRadius: '12px',
  fontWeight: 'bold',
  fontSize: '0.9rem',
  cursor: 'pointer'
}
const pushBtnSecondaryStyle = {
  ...pushBtnStyle,
  backgroundColor: 'transparent',
  color: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(255,255,255,0.5)'
}

const historyContainerStyle = { display: 'flex', flexDirection: 'column', maxHeight: '350px', overflowY: 'auto', paddingRight: '5px' }
const transactionItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f8fafc' }
const iconBoxStyle = { width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }
const descStyle = { fontWeight: '700', fontSize: '0.85rem', color: '#1e293b' }
const dateStyle = { fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }
const countBadgeStyle = { backgroundColor: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold' }
const emptyStateStyle = { textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '0.85rem' }
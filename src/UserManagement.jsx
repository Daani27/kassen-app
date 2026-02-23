import { useEffect, useState } from 'react'
import { apiGetProfiles, apiUpdateProfileAdmin, apiDeleteProfile } from './api'
import { cardStyle as themeCard, sectionTitleStyle as themeTitle, sectionSubtitleStyle as themeSubtitle, inputStyle as themeInput } from './uiTheme'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    try {
      const data = await apiGetProfiles()
      setUsers(data || [])
    } catch (_) {}
    setLoading(false)
  }

  async function toggleAdmin(id, status) {
    try {
      await apiUpdateProfileAdmin(id, !status)
      fetchUsers()
    } catch {
      alert('Fehler beim Ändern der Rechte.')
    }
  }

  async function deleteUser(id, name) {
    if (!window.confirm(`${name} wirklich entfernen? Achtung: Falls der Nutzer bereits Transaktionen hat, wird das Löschen vom System verhindert.`)) return
    try {
      await apiDeleteProfile(id)
      fetchUsers()
    } catch (e) {
      alert('Löschen fehlgeschlagen: ' + (e.data?.error || e.message))
    }
  }

  if (loading) return <div style={themeCard}>Lade Personal...</div>

  const filteredUsers = searchText.trim()
    ? users.filter(u => u.username?.toLowerCase().includes(searchText.trim().toLowerCase()))
    : users

  return (
    <div style={themeCard}>
      <header style={{ marginBottom: 20 }}>
        <h2 style={themeTitle}>👥 Personalverwaltung</h2>
        <p style={themeSubtitle}>{users.length} registrierte Mitglieder</p>
      </header>

      <input
        type="text"
        placeholder="Suchen nach Name…"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        style={{ ...themeInput, marginBottom: 16 }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredUsers.map(u => (
          <div key={u.id} style={userRowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div style={avatarStyle}>
                {u.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={usernameStyle}>{u.username}</div>
                {u.is_admin && <span style={adminBadgeStyle}>ADMIN</span>}
                <div style={versionStyle}>
                  {u.last_app_version ? `App v${u.last_app_version}` : '—'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label style={toggleLabelStyle}>Admin</label>
                <input 
                  type="checkbox" 
                  checked={u.is_admin} 
                  onChange={() => toggleAdmin(u.id, u.is_admin)}
                  style={checkboxStyle}
                />
              </div>

              <button 
                onClick={() => deleteUser(u.id, u.username)} 
                style={deleteBtnStyle}
                title="Nutzer entfernen"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      <footer style={infoFooterStyle}>
        * Neue Kameraden müssen sich eigenständig registrieren. Admins können hier Rechte vergeben oder verwaiste Konten (ohne Buchungen) löschen.
      </footer>
    </div>
  )
}

const userRowStyle = { 
  display: 'flex', 
  alignItems: 'center', 
  justifyContent: 'space-between', 
  padding: '12px 16px', 
  backgroundColor: '#f8fafc', 
  borderRadius: '16px',
  border: '1px solid #f1f5f9'
}

const avatarStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  backgroundColor: '#e2e8f0',
  color: '#475569',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: '800',
  fontSize: '0.9rem'
}

const usernameStyle = { fontSize: '0.95rem', fontWeight: '700', color: '#1e293b' }

const versionStyle = { fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }

const adminBadgeStyle = { 
  fontSize: '0.6rem', 
  fontWeight: '900', 
  backgroundColor: '#dcfce7', 
  color: '#16a34a', 
  padding: '2px 6px', 
  borderRadius: '4px',
  marginTop: '4px',
  display: 'inline-block'
}

const toggleLabelStyle = { fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px', fontWeight: '700' }

const checkboxStyle = {
  width: '18px',
  height: '18px',
  cursor: 'pointer'
}

const deleteBtnStyle = { 
  background: '#fff1f2', 
  border: '1px solid #fee2e2', 
  borderRadius: '10px', 
  padding: '8px', 
  cursor: 'pointer',
  fontSize: '1rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const infoFooterStyle = { 
  fontSize: '0.7rem', 
  color: '#94a3b8', 
  marginTop: '24px', 
  lineHeight: '1.4',
  fontStyle: 'italic'
}